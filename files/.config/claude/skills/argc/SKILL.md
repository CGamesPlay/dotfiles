---
name: Using `argc` / `Argcfile`
description: Create and modify Argcfiles using the special comment-driven syntax required. Use when editing Argcfile.sh, @argc, or any shell script that uses argc. Also use when creating CLI commands, task runners, bash scripts with argument parsing, or adding subcommands to an existing Argcfile.
---

# Argc

[Argc](https://github.com/sigoden/argc/) is a Bash command line framework that utilizes a special comment-driven syntax to provide a command runner and argument parser.

Use [assets/Argcfile-template.sh](assets/Argcfile-template.sh) as a starting point for new Argcfiles. The template includes the required boilerplate footer (argc check + eval) and `set -eu`.

Here is a minimal example showing the key concepts:

```bash
# @describe My CLI tool
# @option --name  Name to greet
# @flag -v --verbose  Enable verbose output
# @arg target*  Target files

main() {
    echo "name: ${argc_name:-world}"
    echo "verbose: ${argc_verbose:-0}"
    echo "targets: ${argc_target[@]}"
}

# ... boilerplate footer (see template)
```

Argc parses the comment tags, generates `--help` automatically, and creates `argc_`-prefixed variables from the parsed arguments. Flags become `0` or `1`, options become strings, and multi-value params become arrays.

## Subcommands

Use `@cmd` before a function to define a subcommand. Nest subcommands using `::` in the function name:

```bash
# @cmd Deploy the application
# @arg environment![staging|production]  Target environment
deploy() {
    echo "Deploying to ${argc_environment:?}"
}

# @cmd Database commands
db() { :; }

# @cmd Run pending migrations
db::migrate() {
    echo "Running migrations"
}

# @cmd Seed the database
# @flag --reset  Drop existing data first
db::seed() {
    echo "Seeding (reset=${argc_reset:-0})"
}
```

- `main()` is called when no subcommand is given.
- Use `{ :; }` for parent commands that only exist to group subcommands (like `db` above).
- Comment tags placed before `main()` or at the top level (before any `@cmd`) apply globally to the script and all subcommands.

## Bash Idioms

Prefer using Bash idioms when working with argc. For example, shellcheck isn't aware of the argc_foo variables, so prefer using `${argc_foo:?}` for required values and values where argc is known to provide the default. For others, use `${argc_foo:-default}`, as appropriate.

## Argcfile.sh

Note that running `argc` directly will attempt to locate a file named `Argcfile.sh` in the current and parent directories. In this case, argc will always cd into the directory with the Argcfile before executing it, and `$ARGC_PWD` will be set to the directory the user ran the command from.

## Comment Tags

Comment tags are standard Bash comments prefixed with `@` and a specific tag. They provide instructions to Argc for configuring your script's functionalities.

| Tag         | Description                           |
| :---------- | ------------------------------------- |
| `@describe` | Sets the description for the command. |
| `@cmd`      | Defines a subcommand.                 |
| `@alias`    | Sets aliases for the subcommand.      |
| `@arg`      | Defines a positional argument.        |
| `@option`   | Defines an option argument.           |
| `@flag`     | Defines a flag argument.              |
| `@env`      | Defines an environment variable.      |
| `@meta`     | Adds metadata.                        |

Some common forms:

```
# @arg va
# @arg vb!                        required
# @arg vc*                        multi-values
# @arg vd+                        multi-values + required
# @arg vna <PATH>                 value notation
# @arg vda=a                      default
# @arg vdb=`_default_fn`          default from bash function
# @arg vca[a|b]                   choices
# @arg vcb[=a|b]                  choices + default
# @arg vcc*[a|b]                  multi-values + choice
# @arg vcd+[a|b]                  required + multi-values + choice
# @arg vfa[`_choice_fn`]          choice from bash function
# @arg vfb[?`_choice_fn`]         choice from bash function + no validation
# @arg vfc*[`_choice_fn`]         multi-values + choice from bash function
# @arg vfd*,[`_choice_fn`]        multi-values + choice from bash function + comma-separated list
# @arg vxa~                       capture all remaining args
# @arg vea $$                     bind-env
# @arg veb $BE <PATH>             bind-named-env
# @option    --oa
# @option -b --ob                   short
# @option -c                        short only
# @option    --of*,                 multi-occurs + comma-separated list (also supports all other patterns from @arg)
# @option    --ona <PATH>           value notation
# @option    --onb <FILE> <FILE>    two-args value notations
# @option    --onc <CMD> <FILE+>    unlimited-args value notations
# @option    --oda=a                default
# @option    --odb=`_default_fn`    default from bash function
# @option    --oca[a|b]             choice (supports all patterns from @arg)
# @option    --ofa[`_choice_fn`]    choice from bash function (supports all patterns from @arg)
# @option    --oxa~                 capture all remaining args
# @option    --oea $$               bind-env
# @option    --oeb $BE <PATH>       bind-named-env
# @flag     --fa
# @flag  -b --fb         short
# @flag  -c              short only
# @flag     --fd*        multi-occurs
# @flag     --ea $$      bind-env
# @flag     --eb $BE     bind-named-env
# @env EA                 optional
# @env EB!                required
# @env EC=true            default
# @env EDA[dev|prod]      choices
# @env EDB[=dev|prod]     choices + default
```

For `_choice_fn`, it should print candidates, one per line. `_choice_fn` and `_default_fn` *must* be bash functions, they are not arbitrary commands. "bind-env" means the variable default comes from the environment. For the environment variables, argc does not create argc_ variables (just validates existing variables).

Most common `@meta` options:

- Set a version on the top-level of the script: `@meta version 1.0.0`
- Require tools installed (usable at top-level and subcommands): `@meta require-tools git,yq`

Use `@describe` at the top level of the script and `@cmd` for subcommands. The first line is the short description, and subsequent comment lines that aren't comment tags are the long description.

## Further Documentation

- [Specification](https://github.com/sigoden/argc/blob/main/docs/specification.md) — formal grammar for all comment tags, modifiers (`!`, `*`, `+`), value notations, and `@meta` options.
- [Variables](https://github.com/sigoden/argc/blob/main/docs/variables.md) — `argc_`-prefixed generated variables, built-in variables (`argc__args`, `argc__positionals`), and environment variables (`ARGC_PWD`, `ARGC_OS`).
- [Examples](https://github.com/sigoden/argc/tree/main/examples) — individual scripts for specific features: nested commands, hooks, parallel execution, `@meta` options (`default-subcommand`, `inherit-flag-options`, `combine-shorts`).

## Fixes

- **`argc --argc-help` is argc's self-help, not your script's help.** The `--argc-help` flag prints information about the argc tool itself (its own usage, flags, etc.), NOT the auto-generated help for your Argcfile. Never use `argc --argc-help` inside an Argcfile to show script help — argc already auto-generates and displays help from your `@describe`/`@cmd` tags when the user runs the script without arguments or with `--help`.
- **Omit `main()` when your script only has subcommands.** If every action is behind a `@cmd` subcommand, don't define a `main()` function. Without `main()`, argc's default behavior when no subcommand is given is to display the auto-generated help — which is the correct behavior. Only define `main()` when you want a meaningful default action (not help display).
