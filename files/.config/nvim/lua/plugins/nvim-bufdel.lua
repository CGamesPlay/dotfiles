-- A small Neovim plugin to improve the deletion of buffers. Improvements:
-- - Preserve the layout of windows. Deleting a buffer will no longer close any window unexpectedly (see demo).
-- - Cycle through buffers according to their number (configurable). This is especially helpful when using a bufferline: we get the same behavior as closing tabs in Chrome / Firefox (see demo).
-- - Terminal buffers are deleted without prompt.
-- - Exit Neovim when last buffer is deleted (configurable).
-- - Add commands to close all listed buffers and to close them all except the current one.
return {
  "ojroques/nvim-bufdel",
  opts = {
    quit = false,
  },
}
