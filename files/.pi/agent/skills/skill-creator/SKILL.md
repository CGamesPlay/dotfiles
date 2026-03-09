---
name: skill-creator
description: Create, improve, and troubleshoot Claude Code agent skills. Use when asked to make a new skill, write a SKILL.md file, improve skill discoverability, debug why a skill isn't activating, answer questions about skills, or review skill best practices.
# https://github.com/j-r-beckett/SpeedReader/tree/main/.claude/skills/skill-creator
---

# Skill Creator

Create well-structured Claude Code skills that are discoverable and effective.

## Skill Setup

```
.claude/skills/my-skill-name/
├── SKILL.md                    # Required: main definition file
├── scripts/                    # Optional: automation scripts
│   └── build.py
├── assets/                     # Optional: templates, samples, data
│   └── template.html
└── references/                 # Optional: reference documentation
    └── api-guide.md
```

Use the template at [assets/SKILL.template.md](assets/SKILL.template.md) as a starting SKILL.md file.

```bash
mkdir -p .claude/skills/my-skill-name
cp .claude/skills/skill-creator/assets/SKILL.template.md .claude/skills/my-skill-name/SKILL.md
```

## Writing Discoverable Descriptions

The only things we'll see before using a skill are the name and description in the frontmatter. Optimizing the description is key to making it discoverable. In general, agents are too conservative when deciding whether to use a skill. Maximize the likelihood of an agent using the skill by writing a description that captures the full scope of both **what** the skill does and **when** the skill should be used (and make sure to include *both*!). If you or I load a skill then decides not to use it, no big deal. If we don't load a skill and spend time spiralling on an already solved task, the session is ruined. High skill discoverability is *extremely important*.

Don't rely on the user saying magic words. Think about what *situations* call for this skill, including ones where the agent should decide to use it on its own, then write a description that captures those scenarios.

Note that the description must be 1024 characters or less, and it must be on a single line (Claude Code does not support multiline YAML).

Here are some good examples of discoverable frontmatters:

```yaml
---
name: speedreader-web
description: Handles SpeedReader server lifecycle (build, startup, shutdown) and web page rebuild/refresh. Use when you need to verify a web page works, view it, test UI interactions, or see how a page behaves. Also covers development tasks: creating, modifying, styling, reviewing.
---
```

```yaml
name: pdf
description: Toolkit for viewing, reading, extracting text, creating, editing, converting, and transforming PDFs. Use whenever you need to work with or interact with PDF files.
```

## Patterns

### Toolbox

The toolbox pattern is implemented by skills that contain non-trivial automation scripts (AKA "tools") and teach the agent how to use them. SKILL.md provides context and information about how to properly use the tools; the tools themselves are python scripts that encapsulate complexity and run commands without clogging up the agent's context window or making silly mistakes. This helps keeps agents focused on *when* and *how* to invoke tools rather than repeatedly reimplementing their logic, which over the course of a long session substantially increases reliability.

For scripting, always prefer python. Run shell commands with `subprocess.run`. Don't use shell commands for operations that could be performed in python (file manipulation, hashing, regex, etc). When done properly, these scripts are trivially portable across platforms.

Always use `uv` with inline dependencies. In the SKILL.md text, make it clear that the scripts must be invoked with `uv`. If you're not *extremely clear* that the agent should use `uv`, it **will** try to run the scripts with `python3` and then be confused when it doesn't work.

Design the API of scripts with care. Always provide `--help`. Avoid exposing unneeded configuration parameters. Scripts should create clean abstractions for agents to consume. As the agent works, contents of SKILL.md will fade but the script's API will remain, so make sure it's good.

### Knowledge Injection

A knowledge injection is when you give the agent a batch of valuable knowledge that it didn't have before that lets it do new things. Examples:

1. Teach the agent how to use a command line tool or python package (for ad-hoc scripting)
2. Give the agent a knowledge dump to make it instantly an expert on a topic
3. Guide the agent through a complex, nuanced workflow

Use `references/` to store documents. If appropriate, use progressive disclosure (e.g. "Depending on the platform, read docs/gcp.md, docs/azure.md, or docs/aws.md").

## Principles

### Valuable Knowledge

A common pitfall is for you to create skills and fill them up with generated information about how to complete a task. The problem with this is that the generated content is all content that's already inside your probability space. You are effectively telling yourself information that you *already know*!

Instead, you should strive to document in SKILL.md only information that:

1. Is outside of your training data (information that you had to learn through research, experimentation, or experience)
2. Is context specific (something that you know **now**, but won't know **later** in a new, blank conversation)
3. Aligns future you with current you (information that will guide future you in acting how we want you to act)

You should also avoid recording **derived data**. Lead a horse to water, don't teach it how to drink. If there's an easily available source that will tell you all you needs to know, point at that source. If the information you'll need can be trivially derived from information you already know or have already been provided, don't provide the derived data.

Before finalizing a skill, revisit this section. Often cruft will creep in in the course of writing the skill. A strong editing pass at the end is recommended.

### Automation

Over the course of a long session, we **will** start to screw up even simple tasks. Typos, forgotten flags, wrong directories, skipped steps. By pushing tasks into automation, we substantially improve long-term reliability. The goal is to reduce the surface area for us to make mistakes.

Good automation is:

1. **Single-touch** - Fold setup and teardown into the tool itself. If we can perform a step in python instead of doing it manually, do it in python. Always. One command should do the whole job.

2. **Clean primitives** - Expose composable operations that can be combined. Avoid tools that do too much or have complex interdependencies. The goal is to expose a simple API to the agent that frees up its attention for higher-value activities.

3. **Repo-specific** - The most powerful automation is usually repo-specific because that's where the low-hanging fruit is. Generic tools already exist; the unique workflows and pain points in your repo are where automation pays off most. Teaching your future self how to use a generic tool in your repo is high-leverage.

### Qualifications

You can't create a skill if you don't already know how to do the skill. Before creating a skill, you should experiment with the workflows themselves. Research CLIs and libraries, download them, try things out, see what's possible, think of things to try and see if they work. Then write the skill using that research and experience. Make sure not to include speculation!

This is related to Valuable Knowledge. Skills must add value. The best way to do that is to invest time and effort up front in creating the skill so that when you loads it later the skill is a value add rather than a drag on the context window.
