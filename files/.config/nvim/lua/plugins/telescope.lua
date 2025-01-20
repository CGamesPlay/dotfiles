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
return {
  "nvim-telescope/telescope.nvim",
  version = "*",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-telescope/telescope-ui-select.nvim",
  },
  opts = {
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
  },
  event = "VeryLazy",
  keys = {
    { "<leader>s?", "<Cmd>Telescope builtin<CR>", desc = "[S]earch Builtin Telescopes" },
    { "<leader>sb", "<Cmd>Telescope buffers<CR>", desc = "[S]earch [B]uffers" },
    { "<leader>sc", "<Cmd>Telescope commands<CR>", desc = "[S]earch [C]ommands" },
    { "<leader>sf", "<Cmd>Telescope find_files<CR>", desc = "[S]earch [F]iles" },
    { "<leader>sh", "<Cmd>Telescope help_tags<CR>", desc = "[S]earch [H]elp" },
    { "<leader>sk", "<Cmd>Telescope keymaps<CR>", desc = "[S]earch [K]eymaps" },
    {
      "<leader>s.",
      function()
        require("telescope.builtin").find_files({ cwd = vim.g.dotfiles_dir, hidden = true })
      end,
      desc = "[S]earch [dot]files",
    },
    -- My very-commonly-used shortcuts
    {
      "<C-p>",
      function()
        local builtin = require("telescope.builtin")
        local path = vim.fn.getcwd(0)
        local is_git = os.execute("git -C " .. path .. " rev-parse --is-inside-work-tree") == 0

        if is_git then
          builtin.git_files({ cwd = path, use_git_root = false, show_untracked = true })
        else
          builtin.find_files()
        end
      end,
      desc = "Jump To File",
    },
    { "<C-b>", "<Cmd>Telescope buffers<CR>", desc = "Jump To Buffer" },
  },
  init = function()
    local telescope = require("telescope")
    telescope.extensions["ui-select"] = {
      require("telescope.themes").get_dropdown(),
    }
    pcall(telescope.load_extension, "ui-select")
  end,
}
