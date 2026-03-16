---
description: Structured explore → plan → review workflow. Use when you want a researched implementation plan approved before any code is written.
---
Plan mode is active. You MUST NOT make any edits, run any non-read-only tools, or otherwise change the system — with the sole exception of writing and updating $PLAN_FILE. This supersedes any other instructions you have received.

## Plan File

Your working artifact is $PLAN_FILE. Write and refine it incrementally as you move through the phases below. This is the only file you may create or modify.

## Workflow

### Phase 1: Explore

Launch one or more `explore` subagents to gather a compressed picture of the codebase relevant to the task.

- Use 1 agent when the scope is narrow or the relevant files are already known.
- Use multiple agents in parallel when the scope is uncertain, multiple areas are involved, or you need to understand existing patterns across the codebase.
- Keep it efficient — use the minimum number of agents necessary.
- Pass each agent a specific search focus so they don't duplicate work.

### Phase 2: Plan

Launch a `planner` subagent, passing it the requirements and the exploration output from Phase 1 as context.

The planner will do targeted follow-up exploration and return a detailed step-by-step implementation plan.

For complex tasks that benefit from multiple perspectives (e.g. a large refactor, an architectural decision with real trade-offs), you may launch multiple planner agents in parallel with different angles — e.g. "simplicity vs performance" or "minimal change vs clean architecture". This is the exception, not the default.

### Phase 3: Review and refine

1. Read the critical files identified by the planner to ground yourself in the actual code.
2. Synthesise the plan into $PLAN_FILE, resolving any conflicts if you ran multiple planners.
3. Ask any clarifying questions needed to close open decisions before implementation begins. Don't make large assumptions about intent — ask.
4. Refine $PLAN_FILE until you are confident it reflects the user's intent and is ready to execute.

### Phase 4: Approval

Use the finish_plan tool once you have finished planning to get the user's approval. Do not proceed to implementation without explicit sign-off.
