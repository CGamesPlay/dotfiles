-- [[ Basic options ]]

-- Set options using opt_global, so that reloading this file does not clobber
-- buffer-local options. However, for historical reasons, files given on the
-- command line (and, if that is none, the first file opened) to not apply
-- these settings at all. To work around this, when doing initial setup, we use
-- opt, which overrides all buffer-local options. This doesn't cause problems,
-- because in the case of files on the command line, the filetype hasn't been
-- set yet. More details here: https://github.com/neovim/neovim/issues/21668
local opt = vim.opt_global
if vim.fn.has("vim_starting") == 1 then
  opt = vim.opt
end

-- This is an unofficial but apparently widely-used global variable controlling
-- the usage of Nerd Font.
vim.g.have_nerd_font = true

-- Show relative line numbers in the gutter (full line number is always in the
-- status bar). Note that relativenumber can cause lag over slow connections.
opt.number = false
opt.relativenumber = true

-- Enable the mouse in normal and visual modes
opt.mouse = "nv"

-- Don't show the mode, since it's already in the status line
opt.showmode = false

-- I use fish, but the startup speed is noticably slow, so we default to
-- standard sh when using ! and :! commands.
opt.shell = "sh"

-- Dealing with long lines: wrap them, keep them indented the same as the start
-- of the line, but show a continuation marker.
opt.linebreak = true
opt.breakindent = true
opt.breakindentopt = { shift = 0 }
opt.showbreak = "↳ "

-- Search case-sensitive, only if the search includes a capital letter. Use \C
-- in the pattern to disable.
opt.ignorecase = true
opt.smartcase = true

-- Always make room for the sign columns
opt.signcolumn = "number"

-- Amount of time to wait for for CursorHold events.
opt.updatetime = 1000

-- Amount of time to wait for a key chord.
opt.timeoutlen = 300

-- Default location for new splits. Can be overridden per-command with :topleft.
opt.splitright = true
opt.splitbelow = false

-- Highlight tab literals and trailing whitespace.
opt.list = false
opt.listchars = { tab = "⇥ ", space = "·" }

-- Incremental substitution results in the buffer (this is the default already,
-- shown here to document).
opt.inccommand = "nosplit"

-- These are disabled because they are togglable with yox.
opt.cursorline = false
opt.cursorcolumn = false

-- Ensure there's some context around search results
opt.scrolloff = 5

-- Enable lmaps in insert mode and the search pattern.
opt.iminsert = 1

-- Fish-style completion for cmdline: pressing Tab will fill the completion as
-- much as possible and open a menu of completion options. You can cycle
-- through the options with <Tab>/<S-Tab>, <C-n>/<C-p>, or <Right>/<Left> (?).
-- You can accept/reject with <C-y>/<C-e>, or accept by <CR>, or by continuing
-- to type.
opt.wildmenu = true
opt.wildmode = "full:longest"
opt.wildoptions = "pum"
opt.wildcharm = 9 -- Tab key

-- Require approval for completion options
opt.completeopt = "menu,menuone,noinsert,preview"

-- Set the default tab width to 4 characters. All other tab settings are defined per-filetype and using plugins.
opt.shiftwidth = 4
opt.tabstop = 4

-- Format lists inside of comments
opt.formatoptions:append("n")
opt.formatlistpat = "^\\s*\\d\\+\\.\\s\\+\\|^\\s*[-*+]\\s\\+\\|^\\[^\\ze[^\\]]\\+\\]:"

-- The path to the dotfiles directory.
vim.g.dotfiles_dir = vim.fn.fnamemodify(vim.fn.resolve(vim.fn.stdpath("config") .. "/init.lua"), ":h:h:h:h")

-- [[ Basic keymaps ]]
-- Keymaps for builtin vim behaviors.
-- Modes: n normal, i insert, c command, t terminal, o operator, v visual (and
-- select), l is not a mode, but applies to "text that would be in the buffer"
-- like search fields. Empty string is nvo. help :vim.keymap.set()

local keys = require("keygroup").new("config.builtin")

-- Use arrow keys to scroll view in normal mode
keys:set("n", "<Up>", "<C-y>")
keys:set("n", "<Down>", "<C-e>")
-- TIP: Unbind the arrow keys to force yourself to break that habit when you
-- are just getting started with vim.
-- keys:set({'n', 'i'}, '<left>', '<cmd>echo "Use h to move!!"<CR>')
-- keys:set({'n', 'i'}, '<right>', '<cmd>echo "Use l to move!!"<CR>')
-- keys:set({'n', 'i'}, '<up>', '<cmd>echo "Use k to move!!"<CR>')
-- keys:set({'n', 'i'}, '<down>', '<cmd>echo "Use j to move!!"<CR>')

-- Exit insert mode by typing jk. To actually insert "jk", wait 1 second after
-- typing the j.
keys:set("i", "jk", "<Esc>")

keys:set("n", "<leader>/", "<cmd>nohlsearch<CR>", { desc = "Clear search highlights (until next search)" })
keys:set("n", "<leader>df", vim.diagnostic.setloclist, { desc = "Open [D]iagnostics For [F]ile" })
keys:set("n", "<leader>dw", vim.diagnostic.setqflist, { desc = "Open [D]iagnostics For [W]orkspace" })
keys:set("n", "<leader>d.", vim.diagnostic.open_float, { desc = "Open [D]iagnostic Under Cursor" })

-- Exit terminal mode in the builtin terminal with a shortcut that is a bit
-- easier for people to discover.
--
-- NOTE: This won't work in all terminal emulators/tmux/etc. Try your own
-- mapping or just use <C-\><C-n> to exit terminal mode
keys:set("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Keybinds to make split navigation easier.
--  Use CTRL+<hjkl> to switch between windows
--
--  See `:help wincmd` for a list of all window commands
keys:set("n", "<C-h>", "<C-w><C-h>", { desc = "Focus left window" })
keys:set("n", "<C-l>", "<C-w><C-l>", { desc = "Focus right window" })
keys:set("n", "<C-j>", "<C-w><C-j>", { desc = "Focus lower window" })
keys:set("n", "<C-k>", "<C-w><C-k>", { desc = "Focus upper window" })

-- Enter command mode without pressing shift!
keys:set("", ";", ":")

-- Have j/k move screen lines (for the line is wrapped), but only when not
-- using a count.
keys:set({ "n", "x" }, "j", 'v:count == 0 ? "gj" : "j"', { desc = "Down", expr = true, silent = true })
keys:set({ "n", "x" }, "k", 'v:count == 0 ? "gk" : "k"', { desc = "Up", expr = true, silent = true })

-- n/N normally follow/reverse the current search direction. I want them to
-- always move forwards/backwards through the file (even if you start the
-- search with ? or #).
keys:set("n", "n", "'Nn'[v:searchforward].'zv'", { expr = true, desc = "Next search result" })
keys:set({ "x", "o" }, "n", "'Nn'[v:searchforward]", { expr = true, desc = "Next search result" })
keys:set("n", "N", "'nN'[v:searchforward].'zv'", { expr = true, desc = "Previous search result" })
keys:set({ "x", "o" }, "N", "'nN'[v:searchforward]", { expr = true, desc = "Previous search result" })

-- Force * and # to search case-sensitive, ignoring smartcase.
keys:set("n", "*", "")

-- Q normally repeats the last recorded macro, but this is the same as @@, so
-- I map it to line formatting instead.
keys:set("", "Q", "gw")

-- Use vp to select the most recently pasted text (VP for whole lines)
keys:set("v", "p", "`[o`]")
keys:set("v", "P", "'[o']")

-- Add readline-style bindings for insert and cmdline modes. Inspired by
-- https://github.com/tpope/vim-rsi/
keys:set("i", "<C-a>", "<C-o>^")
keys:set("i", "<C-e>", [[pumvisible()?"<C-e>":"<End>"]], { expr = true, replace_keycodes = false })
keys:set("i", "<C-d>", [[col('.')>strlen(getline('.'))?"<C-d>":"<Del>"]], { expr = true, replace_keycodes = false })
keys:set("i", "<M-BS>", "<C-w>")
keys:set("i", "<M-Left>", "<S-Left>")
keys:set("i", "<M-Right>", "<S-Right>")
keys:set("c", "<C-a>", "<Home>")
keys:set("c", "<C-e>", [[pumvisible()?"<C-e>":"<End>"]], { expr = true, replace_keycodes = false })
keys:set("c", "<C-d>", [[getcmdpos()>strlen(getcmdline())?"<C-d>":"<Del>"]], { expr = true, replace_keycodes = false })
keys:set("c", "<M-BS>", "<C-w>")
keys:set("c", "<M-Left>", "<S-Left>")
keys:set("c", "<M-Right>", "<S-Right>")

-- Disable ignorecase when using * and #. This is usually what you want in
-- code, but maybe not in prose.
keys:set("n", "*", '/\\C\\<<C-R>=expand("<cword>")<CR>\\><CR>', { silent = true })
keys:set("n", "#", '?\\C\\<<C-R>=expand("<cword>")<CR>\\><CR>', { silent = true })

-- Use %% in command mode to get the directory of the current buffer.
keys:set("c", "%%", '<C-R>=expand("%:h")<CR>/')

-- Jump between quickfix locations
local function bracket_map(left, cmd, desc)
  keys:set("n", left, "<Cmd>:" .. cmd .. "<CR>", { desc = desc })
end
bracket_map("[L", "lfirst", "Jump To First [L]ocation item")
bracket_map("]L", "llast", "Jump To Last [L]ocation item")
bracket_map("[l", "lprev", "Jump To Previous [L]ocation item")
bracket_map("]l", "lnext", "Jump To Next [L]ocation item")
bracket_map("[Q", "cfirst", "Jump To First [Q]uickfix item")
bracket_map("]Q", "clast", "Jump To Last [Q]uickfix item")
bracket_map("[q", "cprev", "Jump To Previous [Q]uickfix item")
bracket_map("]q", "cnext", "Jump To Next [Q]uickfix item")

-- Select the just-pasted text, works with whole and partial lines.
keys:set("n", "gp", [['`[' . strpart(getregtype(), 0, 1) . '`]']], { expr = true, desc = "Select last pasted text" })

-- Some option toggles
keys:set(
  "n",
  "<leader>tx",
  "<Cmd>setl invcursorcolumn invcursorline<CR>",
  { silent = true, desc = "[T]oggle Crosshair ([x])" }
)
keys:set("n", "<leader>t ", "<Cmd>setl invlist<CR>", { silent = true, desc = "[T]oggle Visible White[space]" })
keys:set("n", "<leader>tB", function()
  vim.o.background = vim.o.background == "light" and "dark" or "light"
end, { desc = "[T]oggle [B]ackground" })
keys:set("n", "<leader>td", function()
  vim.diagnostic.enable(not vim.diagnostic.is_enabled())
end, { desc = "[T]oggle [D]iagnostics" })
keys:set("n", "<leader>t|", function()
  if vim.o.textwidth == 0 then
    vim.notify("textwidth is not set", vim.log.levels.INFO)
  end
  vim.o.colorcolumn = vim.o.colorcolumn == "" and "+0" or ""
end, { desc = "[T]oggle Color Column" })

keys:set("n", "<D-r>", function()
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

-- Cmdline completion: <Tab> moves through completion options
keys:set(
  "c",
  "<Tab>",
  [[pumvisible() ? "<C-n>" : nr2char(&wildcharm)]],
  { expr = true, desc = "Show wildmenu or advance to next option" }
)
-- Cmdline completion: <CR> accepts the completion without submitting
keys:set(
  "c",
  "<CR>",
  [[pumvisible() ? "<C-y>" : "<CR>"]],
  { expr = true, desc = "Accept the wildmenu choice, or submit" }
)

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

vim.api.nvim_create_autocmd("QuickFixCmdPost", {
  desc = "Open the quickfix window after a grep",
  command = "botright cwindow",
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

-- This file is treated as a lazy plugin spec. This means lazy will
-- automatically reload it for us!
return {}
