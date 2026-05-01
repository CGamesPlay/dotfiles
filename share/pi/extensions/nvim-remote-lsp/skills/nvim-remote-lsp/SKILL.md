---
name: nvim-remote-lsp
description: Use the LSP servers to navigate code (definition, references, hover, symbols, diagnostics). Activate when investigating code, looking up symbols, finding code definitions, or interpreting LSP diagnostics.
---

# nvim-remote-lsp

Use `nvim-remote-lsp` as the default, preferred way of navigating code. Start by issuing LSP queries, and fall back to grep/glob/find only if LSP doesn't yield results. LSP is pre-indexed and knows about types, scopes, and cross-file references that text search cannot.

`nvim-remote-lsp` is a CLI utility, execute it via the bash tool.

```bash
$ nvim-remote-lsp --help
Query LSP servers attached to a running nvim session.

Talks to nvim over its RPC socket and asks its already-attached LSP
clients to answer queries. Lets short-lived callers (agents, scripts)
share the editor's LSP instead of starting their own.

Line and column numbers are always 1-indexed in both input arguments and
formatted text output. Raw JSON output (--json) uses LSP-native 0-indexed
coordinates.

The col parameter can be a numeric column (1-indexed) or a search string.
When a search string, it must match exactly once in the line, and the
first column of the match is used as the target column.

USAGE: nvim-remote-lsp [OPTIONS] <COMMAND>
```

The socket to nvim is managed by pi, and prepared for you. All subcommands accept a `--json` argument useful for scripting, but output human-readable text by default. It is not recommended to suppress stderr when running this tool (it is designed to produce succinct output for humans and agents).

## When to use

- **Where is this symbol defined?**
  `nvim-remote-lsp definition PATH LINE COL`
  
- **What references this symbol?**
  `nvim-remote-lsp references PATH LINE COL`
  
- **Where is the class/struct of this symbol declared?**
  `nvim-remote-lsp type-definition PATH LINE COL`

- **Where are the implementations for this symbol?**

  `nvim-remote-lsp implementation PATH LINE COL`

- **What type is this symbol?** Also useful for getting information about function signatures and docstrings.

  `nvim-remote-lsp hover PATH LINE COL`

- **What are the current issues with the file/project?**

  `nvim-remote-lsp diagnostics [PATH]`

- **I need an outline of this file's structure.**

  `nvim-remote-lsp document-symbol PATH`

- **What are all the locations where this symbol is mentioned?**

  `nvim-remote-lsp symbol SYMBOL`

- **What files are loaded in the LSP?** a.k.a. what files are open in nvim? Also lists which LSPs are in use for each file.

  `nvim-remote-lsp buffers`

- **I need to tell LSP about a file I modified.** a.k.a. Reload the file in nvim. 

  `nvim notify-file-changed PATH`

## Automatic features

- Whenever you read a file, any applicable LSPs are automatically loaded.
- Whenever you modify a file with write/edit, LSP is automatically notified. If you modified a file with bash/sed, you may need to use `notify-file-changed`.
- Whenever you finish your response, if there are different diagnostics than the last time, they are shown to you to give you an opportunity to correct them. This happens automatically, before the user receives your messages. There may be diagnostics in the project unrelated to your current task; if so, ignore them unless the user says otherwise.

## When not to use

The methods are only good for locating symbols in the code, and will not be helpful for other strings. For example, LSP will not help to locate text in comments or documentation files.
