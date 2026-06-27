/**
 * Subagent Tool — Delegate tasks to specialized agents (parallel-only mode)
 *
 * Key features:
 * - Parallel execution only (no single/chain modes)
 * - Recursion prevention via PI_SUBAGENT env var
 * - Preset resolution from ~/.pi/agent/presets.json
 * - Elapsed time tracking per task
 * - Adaptive rendering (single task = flat, multiple = parallel view)
 *
 * Spawns a separate `pi` process for each task with isolated context.
 * Uses JSON mode to capture structured output from subagents.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getMarkdownTheme,
  Theme,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Markdown,
  type MarkdownTheme,
  Spacer,
  Text,
  type Component,
} from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  discoverAgents,
  type AgentConfig,
  type AgentWarning,
} from "../lib/subagent-agents.js";
import {
  type ResolvedPreset,
  findGroupForModel,
  getDefaultGroup,
  resolvePreset,
} from "../lib/presets.js";
import {
  COLLAPSED,
  EXPANDED,
  filterDisplayItems,
  formatTaskFooter,
  formatTotalFooter,
  type DisplayItem as RenderDisplayItem,
  type RenderConfig,
  type RenderTaskResult,
} from "../lib/subagent-render.js";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const MAX_OUTPUT_BYTES = 16 * 1024;

// ─── Cached agent discovery ────────────────────────────────────────────────

let cachedAgents: AgentConfig[] | undefined;
let discoveryPromise: Promise<AgentWarning[]> | undefined;

/** Pre-populate the agent cache. Called from resources_discover. */
export async function loadSubagentCache(): Promise<AgentWarning[]> {
  if (discoveryPromise) return discoveryPromise;
  discoveryPromise = (async () => {
    const { agents, warnings } = await discoverAgents();
    cachedAgents = agents;
    return warnings;
  })();
  return discoveryPromise;
}

export function getCachedAgents(): AgentConfig[] {
  return cachedAgents ?? [];
}

// ─── Type Definitions ──────────────────────────────────────────────────────

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens?: number;
  turns?: number;
}

interface SingleResult {
  agent: string;
  task: string;
  /** -1 = still running, 0 = success, >0 = failure */
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  presetName?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  stopReason?: string;
  errorMessage?: string;
  /** ms epoch when the subprocess was launched */
  startedAt?: number;
  /** ms epoch when the subprocess exited (undefined while running) */
  endedAt?: number;
}

interface SubagentDetails {
  results: SingleResult[];
}

// ─── Schema & Parameters ──────────────────────────────────────────────────

const TaskItemSchema = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
  cwd: Type.Optional(
    Type.String({ description: "Working directory override" }),
  ),
});

const SubagentParams = Type.Object({
  tasks: Type.Array(TaskItemSchema, {
    description:
      "Array of {agent, task} objects for parallel execution. Required.",
    minItems: 1,
    maxItems: MAX_PARALLEL_TASKS,
  }),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, any> }
  | { type: "toolResult"; toolCallId: string; isError: boolean; text: string };

function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({
            type: "toolCall",
            name: part.name,
            args: part.arguments,
          });
      }
    } else if (msg.role === "toolResult") {
      const text = msg.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      items.push({
        type: "toolResult",
        toolCallId: msg.toolCallId,
        isError: msg.isError,
        text,
      });
    }
  }
  return items;
}

/**
 * Cap an agent's final output. Anything over MAX_OUTPUT_BYTES is written to a
 * temp file in full and replaced inline with a head slice plus the file path,
 * so the model can read the remainder on demand instead of flooding context.
 */
async function capAgentOutput(
  agentName: string,
  output: string,
): Promise<string> {
  if (Buffer.byteLength(output, "utf-8") <= MAX_OUTPUT_BYTES) return output;
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "pi-subagent-output-"),
  );
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `output-${safeName}.md`);
  await fs.promises.writeFile(filePath, output, {
    encoding: "utf-8",
    mode: 0o600,
  });
  // Slice is character-based; for the ASCII markdown reports agents produce
  // this is byte-exact, and a few extra bytes on multibyte input is harmless.
  const head = output.slice(0, MAX_OUTPUT_BYTES);
  return `${head}\n\n[Output truncated (${Buffer.byteLength(output, "utf-8")} bytes total). Full output: ${filePath}]`;
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

function getTrustArg(): string | undefined {
  for (const arg of process.argv) {
    if (arg === "--approve" || arg === "-a") return "--approve";
    if (arg === "--no-approve" || arg === "-na") return "--no-approve";
  }
  return undefined;
}

function getPiInvocation(args: string[]): {
  command: string;
  args: string[];
} {
  const currentScript = process.argv[1];
  if (currentScript && fs.existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = path.basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }

  return { command: "pi", args };
}

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

async function writePromptToTempFile(
  agentName: string,
  prompt: string,
): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "pi-subagent-"),
  );
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, prompt, {
      encoding: "utf-8",
      mode: 0o600,
    });
  });
  return { dir: tmpDir, filePath };
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;
  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Build an error result for a task whose preset couldn't be resolved against
 * the main session's group (e.g. a bare name not present in that group).
 */
function makePresetErrorResult(
  agentName: string,
  task: string,
  rawPreset: string | undefined,
  mainGroup: string | undefined,
): SingleResult {
  const nowMs = Date.now();
  const groupHint = mainGroup ? ` (session group "${mainGroup}")` : "";
  return {
    agent: agentName,
    task,
    exitCode: 1,
    messages: [],
    stderr:
      rawPreset === undefined
        ? `Agent "${agentName}" has no preset configured.`
        : `Could not resolve preset "${rawPreset}" for agent "${agentName}"${groupHint}.`,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    startedAt: nowMs,
    endedAt: nowMs,
  };
}

/**
 * Build the CLI args for a subagent subprocess.
 *
 * Passes the resolved preset via `--preset` (the qualified `group/model` ref)
 * rather than expanding to `--model`/`--thinking`. This is essential: the
 * subprocess loads this same extension, whose startup hook would otherwise apply
 * the *default* preset over a bare `--model`. A `--preset` flag makes the hook
 * apply this preset instead, and routes through the model registry so the
 * provider is pinned exactly (bare model ids are ambiguous across providers).
 *
 * The ref must be the already-qualified `resolved.ref`, not the agent's raw
 * frontmatter name: the parent resolved any bare name against the session's
 * group, but the subprocess's own default group differs.
 */
export function buildSubagentArgs(
  resolved: ResolvedPreset,
  agent: Pick<AgentConfig, "tools">,
  trustArg: string | undefined,
): string[] {
  const args: string[] = [
    "--mode",
    "json",
    "-p",
    "--no-session",
    "--preset",
    resolved.ref,
  ];
  if (trustArg) args.push(trustArg);
  if (agent.tools && agent.tools.length > 0) {
    args.push("--tools", agent.tools.join(","));
  }
  return args;
}

/**
 * Run a single agent in a subprocess.
 * Tracks elapsed time and returns result with exitCode, messages, and usage.
 */
async function runSingleAgent(
  defaultCwd: string,
  agents: Map<string, AgentConfig>,
  resolved: ResolvedPreset,
  agentName: string,
  task: string,
  cwd: string | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => SubagentDetails,
): Promise<SingleResult> {
  const agent = agents.get(agentName);

  if (!agent) {
    const available = Array.from(agents.keys()).join(", ") || "none";
    const nowMs = Date.now();
    return {
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      },
      startedAt: nowMs,
      endedAt: nowMs,
    };
  }

  const trustArg = getTrustArg();
  const args = buildSubagentArgs(resolved, agent, trustArg);

  let tmpPromptDir: string | null = null;

  const currentResult: SingleResult = {
    agent: agentName,
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    },
    presetName: resolved.ref,
    provider: resolved.provider,
    model: resolved.model,
    thinkingLevel: resolved.thinkingLevel,
    startedAt: Date.now(),
  };

  const emitUpdate = () => {
    if (onUpdate) {
      onUpdate({
        content: [
          {
            type: "text",
            text: getFinalOutput(currentResult.messages) || "(running...)",
          },
        ],
        details: makeDetails([currentResult]),
      });
    }
  };

  try {
    if (agent.systemPrompt.trim()) {
      const tmp = await writePromptToTempFile(agent.name, agent.systemPrompt);
      tmpPromptDir = tmp.dir;
      args.push("--append-system-prompt", tmp.filePath);
    }

    args.push(`Task: ${task}`);
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(args);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: cwd ?? defaultCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PI_SUBAGENT: "1" },
      });
      let buffer = "";

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }

        if (event.type === "message_end" && event.message) {
          const msg = event.message as Message;
          currentResult.messages.push(msg);

          if (msg.role === "assistant") {
            currentResult.usage.turns = (currentResult.usage.turns || 0) + 1;
            const usage = msg.usage;
            if (usage) {
              currentResult.usage.input += usage.input || 0;
              currentResult.usage.output += usage.output || 0;
              currentResult.usage.cacheRead += usage.cacheRead || 0;
              currentResult.usage.cacheWrite += usage.cacheWrite || 0;
              currentResult.usage.cost += usage.cost?.total || 0;
              currentResult.usage.contextTokens = usage.totalTokens || 0;
            }
            if (!currentResult.model && msg.model)
              currentResult.model = msg.model;
            if (msg.stopReason) currentResult.stopReason = msg.stopReason;
            if (msg.errorMessage) currentResult.errorMessage = msg.errorMessage;
          }
          emitUpdate();
        }

        if (event.type === "tool_result_end" && event.message) {
          currentResult.messages.push(event.message as Message);
          emitUpdate();
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        currentResult.stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        resolve(code ?? 0);
      });

      proc.on("error", () => {
        resolve(1);
      });

      if (signal) {
        const killProc = () => {
          wasAborted = true;
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
          }, 5000);
        };
        if (signal.aborted) killProc();
        else signal.addEventListener("abort", killProc, { once: true });
      }
    });

    currentResult.exitCode = exitCode;
    currentResult.endedAt = Date.now();
    if (wasAborted) throw new Error("Subagent was aborted");
    return currentResult;
  } catch (err) {
    currentResult.exitCode = 1;
    currentResult.stderr = err instanceof Error ? err.message : String(err);
    currentResult.endedAt = Date.now();
    return currentResult;
  } finally {
    if (tmpPromptDir) {
      try {
        await fs.promises.rm(tmpPromptDir, { recursive: true });
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

// ─── Tool Registration ─────────────────────────────────────────────────────

/**
 * Register the subagent tool.
 * Checks PI_SUBAGENT env var to prevent recursive registration.
 * Discovers agents at startup and caches them.
 */
export function registerSubagentTool(pi: ExtensionAPI) {
  // Prevent recursive subagent spawning
  if (process.env.PI_SUBAGENT) return;

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate tasks to specialized subagents with isolated context.",
    promptSnippet: "Ask another agent to perform tasks",
    promptGuidelines: [
      "Multiple subagent tasks will run in parallel (up to 8 at a time). Ensure that the tasks do not compete for shared resources (e.g. modify the same sets of files).",
      "Subagent definitions are found in ~/.pi/agent/agents",
    ],
    parameters: SubagentParams,

    async execute(
      _toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    ): Promise<AgentToolResult<SubagentDetails>> {
      const tasks = params.tasks;

      // Ensure discovery has completed
      if (discoveryPromise) await discoveryPromise;

      const agentList = getCachedAgents();
      const agentsMap = new Map(agentList.map((a) => [a.name, a]));

      // No usable agents at all
      if (agentList.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No agents found in ~/.pi/agent/agents/. Create .md files with preset frontmatter.",
            },
          ],
          details: { results: [] },
        };
      }

      // Check for unknown agents
      const unknownAgents = tasks
        .map((t) => t.agent)
        .filter((name) => !agentsMap.has(name));
      if (unknownAgents.length > 0) {
        const available = Array.from(agentsMap.keys()).join(", ") || "none";
        return {
          content: [
            {
              type: "text",
              text: `Unknown agents: ${unknownAgents.join(", ")}\nAvailable: ${available}`,
            },
          ],
          details: { results: [] },
        };
      }

      const makeDetails = (results: SingleResult[]): SubagentDetails => ({
        results,
      });

      // Determine the main session's group from its current model, so bare
      // agent presets follow whatever provider the session is running.
      const currentModel = ctx.model;
      const mainGroup =
        (currentModel
          ? await findGroupForModel(currentModel.provider, currentModel.id)
          : undefined) ?? (await getDefaultGroup());

      // Resolve each task's agent preset against the main session's group.
      const resolvedPresets = new Map<string, ResolvedPreset | undefined>();
      for (const t of tasks) {
        if (resolvedPresets.has(t.agent)) continue;
        const agent = agentsMap.get(t.agent);
        if (!agent?.presetName) {
          resolvedPresets.set(t.agent, undefined);
          continue;
        }
        resolvedPresets.set(
          t.agent,
          await resolvePreset(agent.presetName, mainGroup),
        );
      }

      // Track all results for streaming updates
      const allResults: SingleResult[] = new Array(tasks.length);

      // Initialize placeholder results
      for (let i = 0; i < tasks.length; i++) {
        const resolved = resolvedPresets.get(tasks[i].agent);
        allResults[i] = {
          agent: tasks[i].agent,
          task: tasks[i].task,
          exitCode: -1, // -1 = still running
          messages: [],
          stderr: "",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0,
            contextTokens: 0,
            turns: 0,
          },
          presetName: resolved?.ref,
          provider: resolved?.provider,
          model: resolved?.model,
          thinkingLevel: resolved?.thinkingLevel,
        };
      }

      const emitParallelUpdate = () => {
        if (onUpdate) {
          const running = allResults.filter((r) => r.exitCode === -1).length;
          const done = allResults.filter((r) => r.exitCode !== -1).length;
          onUpdate({
            content: [
              {
                type: "text",
                text: `Parallel: ${done}/${allResults.length} done, ${running} running...`,
              },
            ],
            details: makeDetails([...allResults]),
          });
        }
      };

      emitParallelUpdate();

      const results = await mapWithConcurrencyLimit(
        tasks,
        MAX_CONCURRENCY,
        async (t, index) => {
          const resolved = resolvedPresets.get(t.agent);
          const result = resolved
            ? await runSingleAgent(
                ctx.cwd,
                agentsMap,
                resolved,
                t.agent,
                t.task,
                t.cwd,
                signal,
                // Per-task update callback
                (partial) => {
                  if (partial.details?.results[0]) {
                    allResults[index] = partial.details.results[0];
                    emitParallelUpdate();
                  }
                },
                makeDetails,
              )
            : makePresetErrorResult(
                t.agent,
                t.task,
                agentsMap.get(t.agent)?.presetName,
                mainGroup,
              );
          allResults[index] = result;
          emitParallelUpdate();
          return result;
        },
      );

      // Determine overall success
      const successCount = results.filter((r) => r.exitCode === 0).length;
      const isError = successCount !== results.length;

      // Format final output
      let finalText = "";
      if (results.length === 1) {
        finalText =
          (await capAgentOutput(
            results[0].agent,
            getFinalOutput(results[0].messages),
          )) || "(no output)";
      } else {
        const summaries = await Promise.all(
          results.map(async (r) => {
            const output =
              (await capAgentOutput(r.agent, getFinalOutput(r.messages))) ||
              "(no output)";
            return `[${r.agent}] ${r.exitCode === 0 ? "completed" : "failed"}:\n${output}`;
          }),
        );
        finalText = `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`;
      }

      const toolResult: AgentToolResult<SubagentDetails> = {
        content: [{ type: "text", text: finalText }],
        details: makeDetails(results),
      };

      // Encode errors in the content text for the model to see
      if (isError) {
        const errorText = results
          .filter((r) => r.exitCode !== 0)
          .map(
            (r) =>
              `${r.agent}: ${r.stderr || getFinalOutput(r.messages) || "failed"}`,
          )
          .join("\n");
        toolResult.content = [
          {
            type: "text" as const,
            text: `${finalText}\n\nErrors:\n${errorText}`,
          },
        ];
      }

      return toolResult;
    },

    renderCall(args, theme, _context) {
      return renderCallComponent(args, theme);
    },

    renderResult(result, opts, theme, context) {
      const details = result.details as SubagentDetails | undefined;
      const results = details?.results || [];
      const state = context.state as {
        interval?: ReturnType<typeof setInterval>;
      };

      // Tick once per second while still partial — drives the live clock.
      const isPartial = opts.isPartial;
      const anyRunning = results.some((r) => r.exitCode === -1);
      if (isPartial && anyRunning && !state.interval) {
        state.interval = setInterval(() => context.invalidate(), 1000);
      }
      if ((!isPartial || !anyRunning) && state.interval) {
        clearInterval(state.interval);
        state.interval = undefined;
      }

      if (!results || results.length === 0) {
        const text = result.content[0];
        return new Text(
          text?.type === "text" ? text.text : "(no output)",
          0,
          0,
        );
      }

      const mdTheme = getMarkdownTheme();
      const config = opts.expanded ? EXPANDED : COLLAPSED;
      const now = Date.now();

      // Convert messages to render-shape display items.
      const renderResults: RenderTaskResult[] = results.map((r) => {
        const items = getDisplayItems(r.messages);
        const displayItems: RenderDisplayItem[] = items.map((item) => {
          if (item.type === "text") return { type: "text", text: item.text };
          if (item.type === "toolResult")
            return {
              type: "toolResult",
              toolCallId: item.toolCallId,
              isError: item.isError,
              text: item.text,
            };
          // Pre-format tool call arguments to a short uncolored preview so
          // the pure renderer doesn't depend on theme.
          const argsStr = JSON.stringify(item.args);
          const preview =
            argsStr.length > 50 ? `${argsStr.slice(0, 50)}...` : argsStr;
          return {
            type: "toolCall",
            name: item.name,
            argsPreview: preview,
          };
        });
        return {
          agent: r.agent,
          task: r.task,
          exitCode: r.exitCode,
          stopReason: r.stopReason,
          errorMessage: r.errorMessage || r.stderr || undefined,
          usage: r.usage,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          presetName: r.presetName,
          provider: r.provider,
          model: r.model,
          thinkingLevel: r.thinkingLevel,
          displayItems,
          finalOutput: getFinalOutput(r.messages) || undefined,
        };
      });

      return buildResultComponent(renderResults, config, theme, mdTheme, now);
    },
  });
}

// ─── Extracted render helpers (exported for tests) ─────────────────────────

function addTaskBodyComponents(
  container: Container,
  r: RenderTaskResult,
  config: RenderConfig,
  theme: Theme,
  mdTheme: MarkdownTheme,
  now: number,
): void {
  const filtered = filterDisplayItems(r.displayItems);
  const shown =
    config.displayItems !== null
      ? filtered.slice(-config.displayItems)
      : filtered;

  const hiddenItems = filtered.slice(0, filtered.length - shown.length);
  const hiddenCount = hiddenItems.filter(
    (item) => item.type === "toolCall",
  ).length;
  if (hiddenCount > 0) {
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          `(${hiddenCount} previous tool${hiddenCount === 1 ? "" : "s"})`,
        ),
        0,
        0,
      ),
    );
  }

  for (const item of shown) {
    if (item.type === "toolCall") {
      container.addChild(
        new Text(
          theme.fg("muted", "→ ") +
            theme.fg("accent", item.name) +
            theme.fg("dim", " " + item.argsPreview),
          0,
          0,
        ),
      );
    } else if (item.type === "toolResult") {
      container.addChild(new Text(theme.fg("error", "  ✗ " + item.text), 0, 0));
    }
  }

  if (r.finalOutput && r.finalOutput.trim()) {
    if (shown.length > 0) container.addChild(new Spacer(1));
    const outputLines = r.finalOutput.trim().split("\n");
    const shownOutput =
      config.finalOutputLines !== null
        ? outputLines.slice(0, config.finalOutputLines)
        : outputLines;
    const truncated = shownOutput.length < outputLines.length;
    const outputParts = [...shownOutput];
    if (truncated) outputParts[outputParts.length - 1] += "…";
    container.addChild(new Markdown(outputParts.join("\n"), 0, 0, mdTheme));
  } else if (r.exitCode !== -1) {
    container.addChild(
      new Text(theme.fg("muted", "(finished with no output)"), 0, 0),
    );
  }

  if (r.exitCode > 0 && r.errorMessage) {
    container.addChild(
      new Text(theme.fg("error", "Error: " + r.errorMessage), 0, 0),
    );
  }

  container.addChild(new Text(theme.fg("dim", formatTaskFooter(r, now)), 0, 0));
}

/**
 * Build the result component for a subagent invocation.
 * Uses theme colors for structural elements and Markdown for task/output text.
 */
export function buildResultComponent(
  results: RenderTaskResult[],
  config: RenderConfig,
  theme: Theme,
  mdTheme: MarkdownTheme,
  now: number,
): Component {
  const container = new Container();
  if (results.length === 0) {
    container.addChild(
      new Text(theme.fg("muted", "subagent (no tasks)"), 0, 0),
    );
    return container;
  }

  for (let i = 0; i < results.length; i++) {
    if (i > 0) container.addChild(new Spacer(1));
    const r = results[i];
    const taskLines = r.task.split("\n");
    if (config.taskLines !== null) {
      const slicedTask = taskLines.slice(0, config.taskLines);
      const taskEllipsis = taskLines.length > config.taskLines ? "…" : "";
      if (taskEllipsis) {
        slicedTask[slicedTask.length - 1] = slicedTask[
          slicedTask.length - 1
        ].replace(/\.+$/, "");
      }
      container.addChild(
        new Text(
          theme.fg("toolTitle", theme.bold(r.agent)) +
            ": " +
            slicedTask.join("\n") +
            taskEllipsis,
          0,
          0,
        ),
      );
    } else {
      container.addChild(
        new Text(theme.fg("toolTitle", theme.bold(r.agent)), 0, 0),
      );
      container.addChild(new Markdown(r.task, 0, 0, mdTheme));
      container.addChild(new Spacer(1));
    }
    addTaskBodyComponents(container, r, config, theme, mdTheme, now);
  }

  const total = formatTotalFooter(results, now);
  if (total) {
    container.addChild(new Spacer(1));
    const totalStats = total.slice("Total: ".length);
    container.addChild(
      new Text(
        theme.fg("toolTitle", theme.bold("Total") + ":") +
          theme.fg("muted", " " + totalStats),
        0,
        0,
      ),
    );
  }

  return container;
}

/**
 * Render the tool call header (shown before any result arrives).
 * Extracted from registerSubagentTool's renderCall for testability.
 */
export function renderCallComponent(
  args: { tasks?: Array<{ agent: string; task: string; cwd?: string }> },
  theme: Theme,
): Component {
  // Keep the call line minimal — the result render below shows the full
  // per-task layout with status icons, so duplicating it here would just
  // produce two stacked headers while the agents run.
  const tasks = args.tasks || [];
  if (tasks.length === 0) {
    return new Text(
      theme.fg("toolTitle", theme.bold("subagent ")) +
        theme.fg("muted", "(no tasks)"),
      0,
      0,
    );
  }
  const names = tasks.map((t) => t.agent).join(", ");
  return new Text(
    theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", names),
    0,
    0,
  );
}
