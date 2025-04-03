-- Telescope is a fuzzy finder that comes with a lot of different things that
-- it can fuzzy find! It's more than just a "file finder", it can search
-- many different aspects of Neovim, your workspace, LSP, and more!
--
-- The easiest way to use Telescope, is to start by doing something like:
--  :Telescope help_tags
--
-- After running this command, a window will open up and you're able to
-- type in the prompt window. You'll see a list of `help_tags` options and
-- a corresponding preview of the help.
--
-- Two important keymaps to use while in Telescope are:
--  - Insert mode: <c-/>
--  - Normal mode: ?
--
-- This opens a window that shows you all of the keymaps for the current
-- Telescope picker. This is really useful to discover what Telescope can
-- do as well as how to actually do it!
local keys = require("keygroup").new("config.telescope")

keys:set(
  "n",
  "<leader>sb",
  "<Cmd>Telescope buffers sort_lastused=true sort_mru=true<CR>",
  { desc = "[S]earch [B]uffers" }
)
keys:set("n", "<leader>s?", "<Cmd>Telescope help_tags<CR>", { desc = "[S]earch Help Tags" })
keys:set("n", "<leader>sT", "<Cmd>Telescope builtin<CR>", { desc = "[S]earch Builtin [T]elescopes" })
keys:set("n", "<leader>sc", "<Cmd>Telescope commands<CR>", { desc = "[S]earch [C]ommands" })
keys:set("n", "<leader>sf", "<Cmd>Telescope find_files<CR>", { desc = "[S]earch [F]iles" })
keys:set("n", "<leader>sk", "<Cmd>Telescope keymaps<CR>", { desc = "[S]earch [K]eymaps" })
keys:set("n", "<leader>s.", function()
  require("telescope.builtin").find_files({ cwd = vim.g.dotfiles_dir, hidden = true })
end, { desc = "[S]earch [dot]files" })
keys:set("n", "<leader>sG", function()
  require("git_grep").workspace_live_grep()
end, { desc = "[S]earch Git [G]rep" })

-- This binding intelligently switches between git_files and find_files
-- depending on the cwd of the current buffer.
keys:set("n", "<C-p>", function()
  local builtin = require("telescope.builtin")
  local path = vim.fn.getcwd(0)
  local is_git = os.execute("git -C " .. path .. " rev-parse --is-inside-work-tree") == 0

  if is_git then
    builtin.git_files({ cwd = path, use_git_root = false, show_untracked = true })
  else
    builtin.find_files()
  end
end, { desc = "Jump To File" })
keys:set("n", "<C-b>", "<Cmd>Telescope buffers<CR>", { desc = "Jump To Buffer" })

return {
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "nvim-telescope/telescope-ui-select.nvim",
    },
    event = "VeryLazy",
    config = function()
      local telescope = require("telescope")
      telescope.setup({
        defaults = {
          mappings = {
            i = {
              ["jk"] = false, -- apparently false means "leave insert mode"
              ["<esc>"] = "close",
            },
            n = {
              ["<C-c>"] = "close",
            },
          },
        },
        extensions = {
          ["ui-select"] = {
            require("telescope.themes").get_dropdown(),
          },
        },
      })
      pcall(telescope.load_extension, "ui-select")
      pcall(telescope.load_extension, "git_grep")
    end,
  },
  {
    "https://gitlab.com/CGamesPlay/telescope-git-grep.nvim.git",
    -- "https://gitlab.com/davvid/telescope-git-grep.nvim.git",
    -- version = "1.3.0",
    lazy = true,
  },
}
