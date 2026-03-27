# Subagent Extension — Provenance

## Source

- **URL**: https://github.com/mjakl/pi-subagent
- **npm**: @mjakl/pi-subagent@1.4.1
- **Original vendor commit**: 04cb357c6ce1c7e63d81101cda91d337e1b3a903

Originally vendored from the repository. Updated 2026-03-27 by selectively
porting critical fixes from npm v1.4.1 into the existing soft-fork:
- Semantic completion: resolve on `agent_end` event instead of waiting for
  child process exit (fixes hangs when extensions keep the event loop alive)
- `resolvePiSpawn` helper for robust cross-platform process invocation
- stdin piping with immediate close instead of `stdio: "ignore"`
- Proper abort cleanup (remove signal listener, settled/didClose guards)
- Handle `agent_end` and `turn_end` events in JSON stream parser
- CLI argument inheritance (`runner-cli.ts`): forwards parent extension,
  provider, skill, theme flags to children; falls back to parent model/
  thinking/tools when the agent file doesn't specify them
- `normalizeCompletedResult()`: if child was aborted or exited non-zero but
  produced a valid agent_end with output, treat as success
- `getResultSummaryText()`: better fallback text in render (error message →
  stderr → "(no output)")
- Message deduplication via stable-stringify signatures to avoid double-counting
  messages that appear in both message_end and agent_end events

## Companion Files

None. Agent definitions in `files/.pi/agent/agents/` are independently maintained and were not installed by this extension.

## License

MIT License

Copyright (c) 2026 Michael Jakl

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
