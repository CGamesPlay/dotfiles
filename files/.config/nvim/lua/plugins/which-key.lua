-- WhichKey helps you remember your Neovim keymaps, by showing available
-- keybindings in a popup as you type.
return {
  "folke/which-key.nvim",
  event = "VeryLazy",
  opts = {
    -- Slow down the automatic popup
    delay = 1000,
    keys = {
      scroll_down = "<Down>",
      scroll_up = "<Up>",
    },
    icons = {
      mappings = vim.g.have_nerd_font,
      keys = vim.g.have_nerd_font and {} or {
        Up = "<Up> ",
        Down = "<Down> ",
        Left = "<Left> ",
        Right = "<Right> ",
        C = "C-",
        M = "M-",
        D = "D-",
        S = "S-",
        CR = "<CR> ",
        Esc = "<Esc> ",
        ScrollWheelDown = "<ScrollWheelDown> ",
        ScrollWheelUp = "<ScrollWheelUp> ",
        NL = "<NL> ",
        BS = "<BS> ",
        Space = "<Space> ",
        Tab = "<Tab> ",
        F1 = "<F1>",
        F2 = "<F2>",
        F3 = "<F3>",
        F4 = "<F4>",
        F5 = "<F5>",
        F6 = "<F6>",
        F7 = "<F7>",
        F8 = "<F8>",
        F9 = "<F9>",
        F10 = "<F10>",
        F11 = "<F11>",
        F12 = "<F12>",
      },
    },
    -- Name groups of some chord prefixes
    spec = {},
  },
  keys = {
    -- Give names and catchall behaviors to our common chord prefixes. This absorbs the <leader>c$ from <leader>c$, which would otherwise be the same as c$ (modifying the buffer).
    { "<leader>c", "<Nop>", desc = "[C]ode" },
    { "<leader>d", "<Nop>", desc = "[D]iagnostics" },
    { "<leader>g", "<Nop>", desc = "[G]it" },
    { "<leader>r", "<Nop>", desc = "[R]ename" },
    { "<leader>s", "<Nop>", desc = "[S]earch" },
    { "<leader>t", "<Nop>", desc = "[T]oggle Vim Option" },

    {
      "<leader>?",
      function()
        require("which-key").show({ global = true })
      end,
      desc = "Open which-key",
    },
  },
}
