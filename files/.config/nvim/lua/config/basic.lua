-- [[ Basic options ]]

-- Lazy requires that this is set before any plugins are loaded.
vim.g.mapleader = ","
vim.g.maplocalleader = ","

-- This is an unofficial but apparently widely-used global variable controlling
-- the usage of Nerd Font.
vim.g.have_nerd_font = false

-- Show relative line numbers in the gutter (full line number is always in the
-- status bar). Note that relativenumber can cause lag over slow connections.
vim.opt.number = false
vim.opt.relativenumber = true

-- Enable the mouse in normal and visual modes
vim.opt.mouse = "nv"

-- Don't show the mode, since it's already in the status line
vim.opt.showmode = false

-- I use fish, but the startup speed is noticably slow, so we default to
-- standard sh when using ! and :! commands.
vim.opt.shell = "sh"

-- Dealing with long lines: wrap them, keep them indented the same as the start
-- of the line, but show a continuation marker.
vim.opt.linebreak = true
vim.opt.breakindent = true
vim.opt.breakindentopt = { shift = 0 }
vim.opt.showbreak = "↳ "

-- Search case-sensitive, only if the search includes a capital letter. Use \C
-- in the pattern to disable.
vim.opt.ignorecase = true
vim.opt.smartcase = true

-- Always make room for the sign columns
vim.opt.signcolumn = "number"

-- Amount of time to wait for for CursorHold events.
vim.opt.updatetime = 1000

-- Amount of time to wait for a key chord.
vim.opt.timeoutlen = 300

-- Default location for new splits. Can be overridden per-command with :topleft.
vim.opt.splitright = true
vim.opt.splitbelow = false

-- Highlight tab literals and trailing whitespace.
vim.opt.list = false
vim.opt.listchars = { tab = "⇥ ", space = "·" }

-- Incremental substitution results in the buffer (this is the default already,
-- shown here to document).
vim.opt.inccommand = "nosplit"

-- These are disabled because they are togglable with yox.
vim.opt.cursorline = false
vim.opt.cursorcolumn = false

-- Ensure there's some context around search results
vim.opt.scrolloff = 5

-- Enable lmaps in insert mode and the search pattern.
vim.opt.iminsert = 1

-- Use tab completion that I'm used to
vim.opt.wildmode = "list:longest"

-- Require approval for completion options
vim.opt.completeopt = "menu,menuone,noinsert,preview"

-- Set the default tab width to 4 characters. All other tab settings are defined per-filetype and using plugins.
vim.opt.shiftwidth = 4
vim.opt.tabstop = 4

-- The path to the dotfiles directory.
vim.g.dotfiles_dir = vim.fn.fnamemodify(vim.fn.resolve(vim.fn.stdpath("config") .. "/init.lua"), ":h:h:h:h")

-- [[ Basic keymaps ]]
-- Keymaps for builtin vim behaviors.
-- Modes: n normal, i insert, c command, t terminal, o operator, v visual (and
-- select), l is not a mode, but applies to "text that would be in the buffer"
-- like search fields. Empty string is nvo. help :vim.keymap.set()

-- Use arrow keys to scroll view in normal mode
vim.keymap.set("n", "<Up>", "<C-y>")
vim.keymap.set("n", "<Down>", "<C-e>")
-- TIP: Unbind the arrow keys to force yourself to break that habit when you
-- are just getting started with vim.
-- vim.keymap.set({'n', 'i'}, '<left>', '<cmd>echo "Use h to move!!"<CR>')
-- vim.keymap.set({'n', 'i'}, '<right>', '<cmd>echo "Use l to move!!"<CR>')
-- vim.keymap.set({'n', 'i'}, '<up>', '<cmd>echo "Use k to move!!"<CR>')
-- vim.keymap.set({'n', 'i'}, '<down>', '<cmd>echo "Use j to move!!"<CR>')

-- Exit insert mode by typing jk. To actually insert "jk", wait 1 second after
-- typing the j.
vim.keymap.set("i", "jk", "<Esc>")

vim.keymap.set("n", "<leader>/", "<cmd>nohlsearch<CR>", { desc = "Clear search highlights (until next search)" })
vim.keymap.set("n", "<leader>dl", vim.diagnostic.setloclist, { desc = "Open [d]iagnostic [l]ocation list" })
vim.keymap.set("n", "<leader>d.", vim.diagnostic.open_float, { desc = "Open [d]iagnostic under cursor" })

-- Exit terminal mode in the builtin terminal with a shortcut that is a bit easier
-- for people to discover.
--
-- NOTE: This won't work in all terminal emulators/tmux/etc. Try your own mapping
-- or just use <C-\><C-n> to exit terminal mode
vim.keymap.set("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Keybinds to make split navigation easier.
--  Use CTRL+<hjkl> to switch between windows
--
--  See `:help wincmd` for a list of all window commands
vim.keymap.set("n", "<C-h>", "<C-w><C-h>", { desc = "Focus left window" })
vim.keymap.set("n", "<C-l>", "<C-w><C-l>", { desc = "Focus right window" })
vim.keymap.set("n", "<C-j>", "<C-w><C-j>", { desc = "Focus lower window" })
vim.keymap.set("n", "<C-k>", "<C-w><C-k>", { desc = "Focus upper window" })

-- Enter command mode without pressing shift!
vim.keymap.set("", ";", ":")

-- Have j/k move screen lines (for the line is wrapped), but only when not
-- using a count.
vim.keymap.set({ "n", "x" }, "j", 'v:count == 0 ? "gj" : "j"', { desc = "Down", expr = true, silent = true })
vim.keymap.set({ "n", "x" }, "k", 'v:count == 0 ? "gk" : "k"', { desc = "Up", expr = true, silent = true })

-- n/N normally follow/reverse the current search direction. I want them to
-- always move forwards/backwards through the file (even if you start the
-- search with ? or #).
vim.keymap.set("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next search result" })
vim.keymap.set({ "x", "o" }, "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next search result" })
vim.keymap.set("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Previous search result" })
vim.keymap.set({ "x", "o" }, "N", "'nN'[v:searchforward]", { expr = true, desc = "Previous search result" })

-- Force * and # to search case-sensitive, ignoring smartcase.
vim.keymap.set("n", "*", "")

-- Q normally repeats the last recorded macro, but this is the same as @@, so
-- I map it to line formatting instead.
vim.keymap.set("", "Q", "gw")

-- Use vp to select the most recently pasted text (VP for whole lines)
vim.keymap.set("v", "p", "`[o`]")
vim.keymap.set("v", "P", "'[o']")

-- Disable ignorecase when using * and #. This is usually what you want in
-- code, but maybe not in prose.
vim.keymap.set("n", "*", '/\\C\\<<C-R>=expand("<cword>")<CR>\\><CR>', { silent = true })
vim.keymap.set("n", "#", '?\\C\\<<C-R>=expand("<cword>")<CR>\\><CR>', { silent = true })

-- Use %% in command mode to get the directory of the current buffer.
vim.keymap.set("c", "%%", '<C-R>=expand("%:h")<CR>/')

-- Stay in visual mode after changing the indent in visual mode
vim.keymap.set("x", "<", "<gv")
vim.keymap.set("x", ">", ">gv")

-- Disable mouse selection for text (because I trigger is accidentally)
vim.keymap.set("n", "<LeftDrag>", "<Nop>")
vim.keymap.set("n", "<LeftRelease>", "<Nop>")

-- Jump between quickfix locations
local function bracket_map(left, cmd, desc)
  vim.keymap.set("n", left, "<Cmd>:" .. cmd .. "<CR>", { desc = desc })
end
bracket_map("[L", "lfirst", "Jump To First [L]ocation item")
bracket_map("]L", "llast", "Jump To Last [L]ocation item")
bracket_map("[l", "lprev", "Jump To Previous [L]ocation item")
bracket_map("]l", "lnext", "Jump To Next [L]ocation item")
bracket_map("[Q", "cfirst", "Jump To First [Q]uickfix item")
bracket_map("]Q", "clast", "Jump To Last [Q]uickfix item")
bracket_map("[q", "cprev", "Jump To Previous [Q]uickfix item")
bracket_map("]q", "cnext", "Jump To Next [Q]uickfix item")

-- Some option toggles
vim.keymap.set(
  "n",
  "<leader>tx",
  "<Cmd>setl invcursorcolumn invcursorline<CR>",
  { silent = true, desc = "[T]oggle Crosshair ([x])" }
)
vim.keymap.set("n", "<leader>t ", "<Cmd>setl invlist<CR>", { silent = true, desc = "[T]oggle Visible White[space]" })

vim.keymap.set("n", "<D-r>", function()
  vim.cmd("wa")
  local handle = io.popen(
    'osascript -e \'tell application "Google Chrome" to set URL of active tab of its first window to "javascript:void(typeof Jupyter !== \\"undefined\\" ? Jupyter.notebook.execute_all_cells() : location.reload())"\''
  )
  if not handle then
    return
  end
  local result = handle:read("*a")
  handle:close()

  if result and result ~= "" then
    print(result)
  end
end, { desc = "Save all and refresh browser" })

-- [[ Basic autocommands ]]
local augroup = vim.api.nvim_create_augroup("config.basic", { clear = true })

vim.api.nvim_create_autocmd("TextYankPost", {
  desc = "Flash a highlight of yanked text",
  group = augroup,
  callback = function()
    vim.highlight.on_yank()
  end,
})

vim.api.nvim_create_autocmd("BufRead", {
  desc = "Restore cursor position",
  callback = function()
    vim.api.nvim_create_autocmd("FileType", {
      buffer = 0,
      once = true,
      callback = function()
        local line = vim.fn.line("'\"")
        if
          line >= 1
          and line <= vim.fn.line("$")
          and vim.bo.filetype ~= "commit"
          and not vim.tbl_contains({ "xxd", "gitrebase" }, vim.bo.filetype)
        then
          vim.cmd('normal! g`"')
        end
      end,
    })
  end,
  group = augroup,
})

vim.api.nvim_create_autocmd("VimEnter", {
  desc = "Disable netrw directory editing",
  callback = function()
    vim.cmd("silent! au! FileExplorer *")
  end,
  group = augroup,
})

-- [[ Basic commands ]]

-- Resize my window to fit N columns of 81 columns with 6 gutter columns each
-- plus (n - 1) separator bars, and be max height
local function set_cols(n)
  local colorcolumn = vim.o.colorcolumn ~= "" and vim.o.colorcolumn or nil
  local textwidth = vim.o.textwidth ~= 0 and vim.o.textwidth or nil
  local width = colorcolumn or textwidth or 81
  local cols = n * (width + 5) - 1
  vim.cmd("set columns=" .. cols .. " lines=999")
  vim.cmd("normal! <C-W>=")
end
vim.api.nvim_create_user_command("Cols", function(opts)
  set_cols(tonumber(opts.count))
end, { count = true })

-- Run dfm
vim.api.nvim_create_user_command("Dfm", function(opts)
  local args = opts.args
  local command = "!dfm -d " .. vim.fn.shellescape(vim.g.dotfiles_dir) .. " " .. args
  vim.cmd(command)
end, {
  nargs = "*",
})

-- Convenient command to see the difference between the current buffer and the
-- file it was loaded from, thus the changes you made.
vim.api.nvim_create_user_command("DiffOrig", function()
  vim.cmd("vert new | set bt=nofile | r # | 0d_ | diffthis | wincmd p | diffthis")
end, { desc = "Show differences between in-memory and on-disk versions of current file" })
