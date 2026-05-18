import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSessionEvent,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import {
  createTurnStreamFn,
  formatRemainingActions,
  CallAction,
} from "./playbook.js";
import { interceptToolExecution, type TurnStateRef } from "./mock-tools.js";
import { createMockUIContext } from "./mock-ui.js";
import { createEventCollector } from "./events.js";
import type {
  PlaybookAction,
  TestEvents,
  TestSessionOptions,
  ToolCallRecord,
} from "./types.js";

export interface TestSession {
  turn(
    prompt: string,
    actions: Array<PlaybookAction | CallAction>,
  ): Promise<void>;
  /**
   * Wait for the session's queued extension events to finish processing.
   * Call after `session.abort()` (e.g. in afterEach) before tearing down env
   * vars or the temp dir — see `drainSessionEventQueue` for details.
   */
  waitForIdle(): Promise<void>;
  session: AgentSession;
  sessionManager: SessionManager;
  cwd: string;
  events: TestEvents;
  dispose(): void;
}

export async function createTestSession(
  options: TestSessionOptions = {},
): Promise<TestSession> {
  const propagateErrors = options.propagateErrors ?? true;
  const ownsTmpDir = !options.cwd;
  const cwd =
    options.cwd ?? fs.mkdtempSync(path.join(os.tmpdir(), "pi-test-harness-"));

  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
  }

  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    settingsManager,
    additionalExtensionPaths:
      options.extensions?.map((p) => path.resolve(cwd, p)) ?? [],
    extensionFactories: options.extensionFactories,
    systemPromptOverride: options.systemPrompt
      ? () => options.systemPrompt!
      : undefined,
  });
  await loader.reload();

  const playbookModel = getModel("openai", "gpt-4o");

  const { session, extensionsResult } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: playbookModel,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader: loader,
  });

  // Bypass auth — harness never makes a network call because streamFn is
  // replaced per turn, but session.prompt() validates auth before invoking
  // streamFn. Patch all three entry points used across pi-coding-agent 0.66+.
  (session.agent as any).getApiKey = async () => "test-key";
  const modelRegistry = (session as any)._modelRegistry;
  if (modelRegistry) {
    modelRegistry.getApiKey = async () => "test-key";
    modelRegistry.getApiKeyForProvider = async () => "test-key";
    modelRegistry.hasConfiguredAuth = () => true;
  }

  if (extensionsResult.errors.length > 0) {
    session.dispose();
    if (ownsTmpDir && fs.existsSync(cwd)) {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
    const errors = extensionsResult.errors
      .map((e) => `  ${e.path}: ${e.error}`)
      .join("\n");
    throw new Error(`Extension load errors:\n${errors}`);
  }

  const events = createEventCollector();
  const turnRef: TurnStateRef = { current: null };
  const toolCallCounter = { value: 0 };
  const onStreamFnCall = options.onStreamFnCall;

  session.subscribe((event: AgentSessionEvent) => {
    events.all.push(event);

    if (event.type === "tool_execution_start") {
      const record: ToolCallRecord = {
        step: turnRef.current?.consumed ?? 0,
        toolName: event.toolName,
        input: (event as any).args ?? {},
        blocked: false,
      };
      events.toolCalls.push(record);
    }

    if (event.type === "tool_execution_end") {
      if (event.isError) {
        const lastCall = events.toolCalls[events.toolCalls.length - 1];
        if (lastCall && lastCall.toolName === event.toolName) {
          const resultText =
            (event as any).result?.content
              ?.filter((c: any) => c.type === "text")
              ?.map((c: any) => c.text)
              ?.join("\n") ?? "";
          if (
            resultText.includes("blocked") ||
            resultText.includes("Plan mode")
          ) {
            lastCall.blocked = true;
            lastCall.blockReason = resultText;
          }
        }
      }
    }

    if (event.type === "message_end") {
      events.messages.push(event.message);
    }
  });

  const mockUI = createMockUIContext(options.mockUI, events.ui);

  await session.bindExtensions({
    uiContext: mockUI,
    commandContextActions: {
      waitForIdle: () => (session as any).agent.waitForIdle(),
      navigateTree: async (targetId: string, navigateOptions: any) => {
        const result = await (session as any).navigateTree(
          targetId,
          navigateOptions,
        );
        return { cancelled: result.cancelled };
      },
      reload: async () => {
        await (session as any).reload();
      },
      // These create new process-level sessions in production (delegated
      // to a runtime host that owns process lifecycle). The test harness
      // has no equivalent host. Throw so a test exercising them fails
      // loudly rather than seeing silent stub behavior.
      newSession: async () => {
        throw new Error("test-harness: newSession is not supported");
      },
      fork: async () => {
        throw new Error("test-harness: fork is not supported");
      },
      switchSession: async () => {
        throw new Error("test-harness: switchSession is not supported");
      },
    },
    onError: (err: { event: string; error: string; stack?: string }) => {
      events.extensionErrors.push({
        event: err.event,
        error: err.error,
        stack: err.stack,
      });
      console.error(
        `[pi-test-harness] Extension error in ${err.event}: ${err.error}`,
      );
      if (err.stack) {
        console.error(err.stack?.split("\n").join("\n  "));
      }
    },
  });

  // Snapshot the unwrapped tools once, before any per-turn wrapping.
  const originalTools: AgentTool[] = [
    ...((session.agent as any).state.tools as AgentTool[]),
  ];

  // Install intercepted tools. Tool interception needs to be live before
  // the first turn; the closure reads turnRef.current to route events.
  const interceptedTools = interceptToolExecution(
    originalTools,
    options.mockTools ?? {},
    events.toolResults,
    turnRef,
    propagateErrors,
    (session as any).extensionRunner,
  );
  (session.agent as any).state.tools = interceptedTools;

  // pi-coding-agent 0.66+ resets state.tools from _toolRegistry in
  // setActiveToolsByName(); sync the registry so wrapped versions survive.
  const toolRegistry = (session as any)._toolRegistry as
    | Map<string, AgentTool>
    | undefined;
  if (toolRegistry) {
    for (const tool of interceptedTools) {
      toolRegistry.set(tool.name, tool);
    }
  }

  return {
    session,
    sessionManager: (session as any).sessionManager as SessionManager,
    cwd,
    events,

    async turn(prompt, actions) {
      const errorsBefore = events.extensionErrors.length;
      const flat = actions.map((a) =>
        a instanceof CallAction ? a.action : (a as PlaybookAction),
      );
      const { streamFn, state } = createTurnStreamFn(flat, toolCallCounter);
      turnRef.current = state;

      if (onStreamFnCall) {
        (session.agent as any).streamFn = (
          model: any,
          context: any,
          options: any,
        ) => {
          onStreamFnCall(context);
          return streamFn(model, context, options);
        };
      } else {
        (session.agent as any).streamFn = streamFn;
      }

      try {
        await session.prompt(prompt);

        // waitForIdle() may return before a followUp message (sent by a command
        // handler via pi.sendUserMessage) triggers its asynchronous agent turn.
        // Poll until the turn's playbook is fully consumed or a timeout elapses.
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          await this.waitForIdle();
          if (state.remaining === 0 && !state.exhausted) break;
          // Agent went idle but playbook has remaining actions — a followUp
          // agent turn may not have started yet. Yield and retry.
          await new Promise((r) => setTimeout(r, 20));
        }

        if (propagateErrors) {
          const newErrors = events.extensionErrors.slice(errorsBefore);
          if (newErrors.length > 0) {
            const summary = newErrors
              .map(
                (e) =>
                  `Extension error in ${e.event}: ${e.error}${
                    e.stack ? `\n  ${e.stack.split("\n").join("\n  ")}` : ""
                  }`,
              )
              .join("\n");
            throw new Error(summary);
          }
        }

        const diag = formatRemainingActions(state);
        if (diag) throw new Error(diag);
      } finally {
        turnRef.current = null;
      }
    },

    async waitForIdle() {
      // BUG: `AgentSession` queues incoming agent events onto an internal
      // `_agentEventQueue` promise chain that drives extension hooks (e.g.
      // `agent_end` → `onAgentEnd`). Both `agent.waitForIdle()` and
      // `session.abort()` resolve based on the *agent's* idle state, not on
      // this queue draining — so an `agent_end` event can still be dispatched
      // to extensions after `abort()` returns. In tests that delete env vars
      // or rm the temp dir in `afterEach`, the late-firing extension hook then
      // crashes on missing state.
      //
      // Workaround: after waiting for agent idle (or after abort), also await
      // the session's event queue so extension processing for already-emitted
      // events has fully completed.
      const queue = (session as any)._agentEventQueue as
        | Promise<unknown>
        | undefined;
      if (queue) await queue.catch(() => {});
    },

    dispose() {
      session.dispose();
      if (ownsTmpDir && fs.existsSync(cwd)) {
        fs.rmSync(cwd, { recursive: true, force: true });
      }
    },
  } satisfies TestSession;
}
