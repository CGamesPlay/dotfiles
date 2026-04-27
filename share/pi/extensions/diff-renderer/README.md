# Improved Diff Renderer

This extension overrides the rendering used for the built-in write and edit tools.

For writes, it renders as a diff when overwriting an existing file. This is useful because models will often choose to rewrite the file entirely if a large percentage of it is changing.

For edits, we do a similar process, where we convert the "old" and "new" strings into an actual diff and render that instead.

For both cases, we reduce the number of context lines to 1 in the tool output, and render two columns of line numbers (old and new).

Finally (and most interestingly), we compute the "frontier" of the in-progress tool call in diff terms, and we scroll the truncated output so that the frontier is at the bottom. This makes in-progress tool calls much more legible; without it the tool call just shows as a bunch of red lines, not because the agent is deleting the file, but because the agent hasn't finished writing it yet.
