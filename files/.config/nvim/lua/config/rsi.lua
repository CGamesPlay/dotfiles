-- - Readline mappings are provided in insert mode and command line mode.
--   Normal mode is deliberately omitted.
-- - Important Vim key bindings (like insert mode's C-n and C-p completion) are
--   not overridden.
-- - Meta key bindings are provided in a way that works in the terminal without
--   the perils of remapping escape.
-- - C-d, C-e, and C-f are mapped such that they perform the Readline behavior
--   in the middle of the line and the Vim behavior at the end. (Think about it.)
return {
  "tpope/vim-rsi",
}
