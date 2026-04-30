# claude-agent-sdk-pi

A pi provider that drives Claude models via `@anthropic-ai/claude-agent-sdk`.
Pi keeps owning tool execution; the SDK only generates assistant turns.

## How it works

The provider keeps a *persistent runtime* per pi session: one long-lived
`query()` iterator that hosts every assistant turn for that pi conversation.
Each pi `streamSimple` call drives one logical turn through that iterator
without tearing it down between calls.

### Tool execution

Pi owns tool execution. To make the SDK call into pi's tools we register
**every** pi tool as an MCP tool under server name `pi` (so the SDK sees
e.g. `mcp__pi__bash`). When the model calls a tool:

1. The SDK invokes our MCP handler.
2. The handler creates a deferred and parks on it. The runtime surfaces the
   call to pi as an assistant turn ending in a `toolCall` block, and the
   pi-side `streamSimple` returns.
3. Pi runs the tool and calls `streamSimple` again with the `toolResult`
   appended to context.
4. We resolve the parked deferred with pi's result. The handler returns
   that to the SDK, which records it as the tool's `tool_result` and
   continues the assistant loop.

This avoids the deny-stub problem of the old design (where `canUseTool: deny`
left a synthetic deny `tool_result` in the SDK transcript that overrode any
real result we tried to inject afterward).

### Multi-tool-call assistant turns

If the SDK emits two or more `tool_use` blocks in one assistant turn, only
the first is surfaced to pi. The second is queued. After pi returns the
first tool's result, we synthesize an assistant turn containing only the
queued `toolCall` — no SDK round-trip — and surface that to pi. Pi sees a
clean linear sequence of single-tool assistant turns even though the SDK's
underlying turn was a parallel fan-out.

### Decision logic per call

Each `streamSimple` call diffs pi message signatures (timestamp + md5 of
content) against what was sent last time:

- **First call** — *cold-seed*: replay every pi message into the SDK input
  queue with `shouldQuery: false` on all but the last. The static prefix
  (system prompt, tool schemas, AGENTS.md append) is snapshotted here and
  reused byte-identical for the rest of the session so Anthropic's prompt
  cache hits.
- **Linear extension with a fresh user message** — push as `SDKUserMessage`
  onto the persistent input queue.
- **Linear extension with tool result(s)** — resolve the matching parked
  deferred(s). If pi also pushed a follow-up user message alongside, queue
  it too.
- **Divergence** (tree navigation, rewind) — `forkSession({ upToMessageId })`
  at the deepest matching assistant turn, build a fresh runtime on the
  forked SDK session, replay the new branch's tail. Falls back to cold-seed
  if the fork point is unknown.

### Cache surface stability

`systemPrompt: { excludeDynamicSections: true }` keeps the SDK's
`claude_code` preset from injecting per-cwd dynamic content (working
directory, git status) that would shift the cache prefix between calls.

Pi tool schemas are converted from JSON Schema (TypeBox-emitted) to a Zod
raw shape so the SDK can consume them.

### Lifetime and cleanup

The runtime lives for the life of the pi process. On `session_shutdown`,
the input queue is closed, `query.close()` tears down the SDK iterator,
parked tool deferreds are rejected, and a best-effort cleanup deletes any
SDK session JSONL files we created. Restart busts the cache by design —
Anthropic's prompt cache TTL is 5–60 minutes, so durable persistence
buys nothing.

## Tests

Live integration tests live at `tests/cache.test.ts`. They exercise the real
Anthropic API and so are gated on the `RUN_LIVE_TESTS=1` environment variable
— the default `npm run test` skips them.

```sh
# Skipped by default; runs everything else.
npm run test

# Includes the live cache tests.
RUN_LIVE_TESTS=1 npm run test
```

The tests assert *thresholds* on `cacheRead` / `cacheWrite` rather than exact
counts; they catch regressions where cache hits stop happening but tolerate
normal token-count drift between runs. They cost a few cents per run and
require valid Anthropic auth visible to the Claude Code binary
(`CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`). Override the model with
`BENCH_MODEL=<id>`.

## Source

The inspiration for this extension came from [prateekmedia's implementation](https://github.com/prateekmedia/claude-agent-sdk-pi), but this
plugin has been implemented almost entirely from scratch and uses a
fundamentally different architecture.
