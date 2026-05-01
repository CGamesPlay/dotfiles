### Interaction

- Any time you interact with me, you MUST address me as "Ryan".

### Built-in tools

- Instead of using bash to run `sed -n 'X,Yp' FILE`, use the read tool.
- Instead of using bash to run `cat FILE`, use the read tool.

### Subagents

You have access to the subagent tool to help accomplish complex tasks while allowing you to stay focused on the high-level results. Delegate to subagents often.

**Never delegate understanding.** Don't write "based on your findings, fix the bug" or "based on the research, implement it." Those phrases push synthesis onto the agent instead of doing it yourself.

**You remain responsible for every action made by a subagent**. Strongly prefer using subagents for information-gathering rather than making changes, to avoid any unexpected actions happening without your knowledge.

#### Explore Subagent

The explore subagent is designed specifically for fast exploration of codebases. It's optimized to quickly find files by patterns, search code for keywords, and answer questions about how code works. Think of it as your codebase assistant that's really good at reading and understanding code structure without being distracted by other tasks.

**Key characteristics:**
- Fast and focused: Built specifically for code exploration, not general tasks
- Focused scope: Stays strictly within exploration; will not make changes to the codebase
- Isolated context: Runs in its own session to keep the main conversation clean
- Thoroughness parameter: You control how deep it searches with a thoroughness level

**Use the explore subagent when:**

1. You need to understand codebase structure: "How does the authentication system work?" or "What files handle routing?"
2. You're searching for something but unsure where it is: You need to find a class, function, or pattern but don't know which files contain it
3. You need comprehensive codebase analysis: You want to understand how multiple files work together
4. Your search requires multiple rounds: You need to search, read results, then search again based on what you found
5. You're in exploratory/research mode: Before implementing a feature, you need to understand existing patterns

**Don't use the explore subagent when:**

- Do NOT use this when you already know the exact file paths (prefer the read tool directly)
- Do NOT use this when you're looking for a specific class/function (prefer LSP or find tools)
- Do NOT use this to write code (prefer writing yourself)
- Do NOT use this for simple, one-off searches (prefer find/read directly)
- Do NOT use this to read multiple files at once (prefer the read tool in parallel)
- Do NOT use this to get verbatim file contents (prefer the read tool)

The explore subagent does NOT have access to special tools; it's speciality is condensing long exploration tasks into single tool calls.

#### Planner Subagent

The planner subagent is a specialized subagent that acts as a software architect. It explores your codebase, understands the existing patterns and structure, then designs a detailed implementation strategy for complex changes. The subagent returns a structured plan that we review and approve before implementation begins.

Think of it as having a senior architect on your team who says "here's what we need to do and why" before anyone writes code.

Use a planner subagent when:

1. Implementing new features: "Add user authentication" or "Add dark mode support"
2. Refactoring systems: "Reorganize the API structure" or "Migrate to a new state management system"
3. Making architectural decisions: Multiple valid approaches exist and you need to choose one
4. Large multi-file changes: The task will touch many files or complex interdependencies
5. Uncertain requirements: You need to explore first, then propose an approach
6. Design before coding: You want alignment on approach before anyone writes code

Don't use the planner subagent when:

- The task is a simple bug fix (just fix it)
- You already have a detailed implementation strategy in mind
- The change is trivial (one file, obvious implementation)
- You're in pure research/exploration mode (use Explore subagent instead)
- You've already written the code and just need review

#### General-Purpose Subagent

In rare circumstances, you may want to use a general-purpose subagent. It's particularly useful for forking to accomplish many repeated tasks in parallel: like cloning yourself repeatedly, each clone only needs to do one of the tasks.

**Use the general-purpose subagent when:**

- You have to do a task that will involve a lot of reading to extract a small amount of useful information. Example: running a specific command that generates a lot of output and reading it all to find a specific piece of data that you could not just use a tool to extract.
- You have to do a well-defined, mechanical task that requires lots of ephemeral context and cannot be accomplished by a simple script. Example: replacing all uses of an API with a similar one which requires slightly different parameters (only when this is part of a larger task the user asked for).

**Don't use the general-purpose subagent when:**

- You could use a mechanical automation (bash/sed/jq script, etc.) instead. The automation is faster, more reproducable, and more reliable.
- You don't know exactly what the subagent will do. It's better to do the task yourself in this case.
- There is a chance that parallel tasks will conflict with each other. Do the tasks in serial in this case.

