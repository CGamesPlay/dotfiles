import { randomUUID } from "node:crypto";
import type { AssistantMessage, Context } from "@mariozechner/pi-ai";
import {
  type SDKUserMessage,
  type SessionKey,
  type SessionStore,
  type SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Minimal SessionStore that holds one synthetic session and matches by
 * sessionId only, ignoring projectKey. The SDK derives projectKey from the
 * cwd, which we don't know at build time, so we can't use InMemorySessionStore
 * (which key-matches on both fields and would return null on every load).
 */
class SyntheticSessionStore implements SessionStore {
  private readonly entries: SessionStoreEntry[];
  private readonly sessionId: string;
  constructor(sessionId: string, entries: SessionStoreEntry[]) {
    this.sessionId = sessionId;
    this.entries = entries;
  }
  async append(
    _key: SessionKey,
    _entries: SessionStoreEntry[],
  ): Promise<void> {}
  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    return key.sessionId === this.sessionId ? this.entries : null;
  }
}

/**
 * Translate a single pi user message into one SDKUserMessage. Strings and
 * arrays of text/image content blocks are supported. Returns undefined if
 * the message has no representable content.
 */
export function userMessageToSdk(m: any): SDKUserMessage | undefined {
  const blocks: any[] = [];
  const content = m.content;
  if (typeof content === "string") {
    if (content.length === 0) return undefined;
    blocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "text")
        blocks.push({ type: "text", text: block.text ?? "" });
      else if (block?.type === "image") {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType,
            data: block.data,
          },
        });
      }
    }
  }
  if (blocks.length === 0) return undefined;
  return {
    type: "user",
    message: { role: "user", content: blocks },
    parent_tool_use_id: null,
    session_id: "seed",
  };
}

/**
 * Translate a pi toolResult message into an SDKUserMessage carrying a
 * `tool_result` content block. Used for cold-seed replay; live tool result
 * delivery happens by resolving the parked MCP handler deferred, not by
 * pushing this onto the input queue.
 */
export function toolResultToSdk(m: any): SDKUserMessage {
  const resultBlocks: any[] = [];
  const content = m.content;
  if (typeof content === "string") {
    resultBlocks.push({ type: "text", text: content });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === "text")
        resultBlocks.push({ type: "text", text: block.text ?? "" });
      else if (block?.type === "image") {
        resultBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: block.mimeType,
            data: block.data,
          },
        });
      }
    }
  }
  if (resultBlocks.length === 0) resultBlocks.push({ type: "text", text: "" });
  return {
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId,
          content: resultBlocks,
          is_error: m.isError === true ? true : undefined,
        },
      ],
    },
    parent_tool_use_id: m.toolCallId,
    session_id: "seed",
  };
}

function piStopReasonToSdk(reason: string): string {
  if (reason === "toolUse") return "tool_use";
  if (reason === "length") return "max_tokens";
  return "end_turn";
}

function assistantContentToSdk(content: AssistantMessage["content"]): any[] {
  const blocks: any[] = [];
  for (const block of content) {
    if (block.type === "thinking") continue; // signatures can't be reproduced
    if (block.type === "text") {
      blocks.push({ type: "text", text: block.text });
    } else if (block.type === "toolCall") {
      blocks.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.arguments,
      });
    }
  }
  return blocks;
}

/**
 * Build a synthetic SDK session from pi's full message history (including
 * assistant messages) so a cold-seed resume starts with real context instead
 * of regenerating every assistant turn from scratch.
 *
 * Returns undefined when there are no assistant messages yet — the first
 * turn of a fresh session has no history to inject.
 *
 * Thinking blocks are excluded: their signatures can't be reproduced and
 * the SDK would reject them.
 */
export async function buildSyntheticSession(
  context: Context,
): Promise<
  { store: SessionStore; sessionId: string; tail: SDKUserMessage[] } | undefined
> {
  let lastAssistantIdx = -1;
  for (let i = context.messages.length - 1; i >= 0; i--) {
    if ((context.messages[i] as any)?.role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx < 0) return undefined;

  const sessionId = randomUUID();
  const entries: SessionStoreEntry[] = [];
  let prevUuid: string | null = null;

  for (let i = 0; i <= lastAssistantIdx; i++) {
    const m = context.messages[i] as any;
    if (!m) continue;
    const uuid = randomUUID();
    const ts = new Date(m.timestamp).toISOString();

    if (m.role === "user") {
      const sdk = userMessageToSdk(m);
      if (!sdk) continue; // skip empty user messages without advancing prevUuid
      entries.push({
        type: "user",
        uuid,
        parentUuid: prevUuid,
        isSidechain: false,
        sessionId,
        timestamp: ts,
        message: sdk.message,
      });
    } else if (m.role === "toolResult") {
      const sdk = toolResultToSdk(m);
      entries.push({
        type: "user",
        uuid,
        parentUuid: prevUuid,
        isSidechain: false,
        sessionId,
        timestamp: ts,
        message: sdk.message,
      });
    } else if (m.role === "assistant") {
      entries.push({
        type: "assistant",
        uuid,
        parentUuid: prevUuid,
        isSidechain: false,
        sessionId,
        timestamp: ts,
        message: {
          id: `msg_synthetic_${uuid.replace(/-/g, "").slice(0, 24)}`,
          type: "message",
          role: "assistant",
          model: m.model,
          content: assistantContentToSdk(m.content),
          stop_reason: piStopReasonToSdk(m.stopReason),
          stop_sequence: null,
          usage: {
            input_tokens: m.usage.input,
            output_tokens: m.usage.output,
            cache_read_input_tokens: m.usage.cacheRead,
            cache_creation_input_tokens: m.usage.cacheWrite,
          },
        },
      });
    } else {
      continue;
    }
    prevUuid = uuid;
  }

  const store = new SyntheticSessionStore(sessionId, entries);

  const tail: SDKUserMessage[] = [];
  for (let i = lastAssistantIdx + 1; i < context.messages.length; i++) {
    const m = context.messages[i] as any;
    if (!m) continue;
    if (m.role === "user") {
      const msg = userMessageToSdk(m);
      if (msg) tail.push(msg);
    } else if (m.role === "toolResult") {
      tail.push(toolResultToSdk(m));
    }
  }
  if (tail.length === 0) {
    tail.push({
      type: "user",
      message: { role: "user", content: "" },
      parent_tool_use_id: null,
      session_id: "seed",
    });
  }
  for (let i = 0; i < tail.length - 1; i++) {
    (tail[i] as any).shouldQuery = false;
  }

  return { store, sessionId, tail };
}

/**
 * Build the cold-seed input sequence for a brand-new SDK session with no
 * prior assistant history: replay every pi user/toolResult message, with
 * `shouldQuery: false` on all but the last.
 */
export function buildColdSeedMessages(context: Context): SDKUserMessage[] {
  const out: SDKUserMessage[] = [];
  for (const m of context.messages) {
    if (m.role === "user") {
      const sdkMsg = userMessageToSdk(m);
      if (sdkMsg) out.push(sdkMsg);
    } else if (m.role === "toolResult") {
      out.push(toolResultToSdk(m));
    }
  }
  if (out.length === 0) {
    out.push({
      type: "user",
      message: { role: "user", content: "" },
      parent_tool_use_id: null,
      session_id: "seed",
    });
  }
  for (let i = 0; i < out.length - 1; i++) {
    (out[i] as any).shouldQuery = false;
  }
  return out;
}

/**
 * Concatenate the text content of a message's content blocks. Used to
 * extract the text body of a pi toolResult to inject into the SDK as the
 * tool_result text.
 */
export function messageContentToText(content: any): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (block?.type === "text") text += block.text ?? "";
  }
  return text;
}

export function mapStopReason(
  reason: string | undefined,
): "stop" | "length" | "toolUse" {
  switch (reason) {
    case "tool_use":
      return "toolUse";
    case "max_tokens":
      return "length";
    default:
      return "stop";
  }
}
