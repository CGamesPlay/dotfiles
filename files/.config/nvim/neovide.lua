--------------------------------------------------------------------------------
--- Visual options for Neovide
--------------------------------------------------------------------------------
--- Note: some settings are also configured in ~/.config/neovide/config.toml
vim.g.neovide_theme = 'auto'
-- g:neovide_transparency should be 0 if you want to unify transparency of content and title bar.
--vim.g.neovide_transparency = 1
--vim.g.transparency = 0.5
--vim.g.neovide_window_blurred = true
vim.o.winblend = 15
vim.o.pumblend = 15
vim.g.neovide_cursor_animation_length = 0.07
vim.g.neovide_cursor_trail_size = 0.4
vim.g.neovide_cursor_animate_command_line = false
vim.g.neovide_hide_mouse_when_typing = true
vim.g.neovide_padding_top = 10
vim.g.neovide_padding_bottom = 0
vim.g.neovide_padding_right = 10
vim.g.neovide_padding_left = 10
--------------------------------------------------------------------------------
--- Set up key bindings for normal GUI app integration
--------------------------------------------------------------------------------
vim.keymap.set('n', '<D-s>', ':w<CR>', { silent = true }) -- Save
vim.keymap.set('v', '<D-c>', '"+y') -- Copy
vim.keymap.set(
  {'n', 'v', 's', 'x', 'o', 'i', 'l', 'c', 't'},
  '<D-v>',
  function() vim.api.nvim_paste(vim.fn.getreg('+'), true, -1) end,
  { noremap = true, silent = true }
)
vim.g.neovide_scale_factor = 1.0
local change_scale_factor = function(delta)
  vim.g.neovide_scale_factor = vim.g.neovide_scale_factor * delta
end
vim.keymap.set("n", "<D-0>", function() vim.g.neovide_scale_factor = 1 end)
vim.keymap.set("n", "<D-=>", function() change_scale_factor(1.25) end)
vim.keymap.set("n", "<D-->", function() change_scale_factor(1/1.25) end)

