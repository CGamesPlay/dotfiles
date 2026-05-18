import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Tool } from "@earendil-works/pi-ai";
import { jsonSchemaObjectToZodShape } from "./json-schema-to-zod.js";
import { MCP_SERVER_NAME } from "./tool-mapping.js";
import type { PendingToolCall } from "./types.js";
import { defer } from "./util.js";

/**
 * Callback the runtime provides to receive tool calls as they arrive.
 * The runtime decides whether to surface the call to pi immediately or
 * queue it (when an earlier call from the same turn is still pending).
 */
export type ToolCallSink = (call: PendingToolCall) => void;

/**
 * Extract the SDK's tool-use id from the `extra` argument the SDK passes to
 * an MCP handler. The id lives at `_meta["claudecode/toolUseId"]` — an
 * undocumented, namespaced key. If the SDK ever renames this key (e.g.
 * during a rebrand or refactor), every tool call would land with an empty
 * id, which would silently collapse all in-flight calls into one shared
 * deferred — pi would then get tool results crossed.
 *
 * Throwing here turns that silent failure into a loud one: the next SDK
 * upgrade that renames the key fails immediately with a clear pointer to
 * what changed, instead of producing a confusing cache/correctness drift.
 */
export function extractToolUseId(extra: unknown): string {
  const meta = (extra as { _meta?: Record<string, unknown> } | undefined)
    ?._meta;
  const id = meta?.["claudecode/toolUseId"];
  if (typeof id === "string" && id.length > 0) return id;
  throw new Error(
    `claude-agent-sdk: MCP handler invoked without a tool_use_id at _meta["claudecode/toolUseId"]. ` +
      `The SDK may have renamed this key. Got extra=${safeStringify(extra)}`,
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Build the SDK MCP server hosting all pi tools.
 *
 * Each registered tool's handler:
 *   1. creates a deferred,
 *   2. wraps it in a PendingToolCall and hands it to the runtime,
 *   3. awaits the deferred,
 *   4. returns the deferred's resolved value as the SDK's tool_result.
 *
 * The deferred stays parked across multiple streamSimple boundaries.
 */
export function buildPiMcpServer(piTools: Tool[], sink: ToolCallSink) {
  const sdkTools = piTools.map((piTool) =>
    tool(
      piTool.name,
      piTool.description,
      // Pi's `parameters` is a TypeBox-emitted JSON Schema. The SDK's
      // `tool()` factory wants a Zod raw shape (which it converts back
      // to JSON Schema internally). We do the conversion here.
      jsonSchemaObjectToZodShape(piTool.parameters),
      async (args, extra) => {
        const toolUseId = extractToolUseId(extra);
        const output = defer<{ text: string; isError: boolean }>();
        const pending: PendingToolCall = {
          toolUseId,
          piToolName: piTool.name,
          args: (args as Record<string, unknown>) ?? {},
          output,
        };
        sink(pending);
        const { text, isError } = await output.promise;
        return {
          content: [{ type: "text" as const, text }],
          isError: isError || undefined,
        };
      },
    ),
  );

  return createSdkMcpServer({
    name: MCP_SERVER_NAME,
    version: "1.0.0",
    tools: sdkTools,
  });
}
