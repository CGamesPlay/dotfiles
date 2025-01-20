-- Fully featured & enhanced replacement for copilot.vim complete with API for interacting with Github Copilot
-- I have it set up to use <C-u> to cycle through completions, <Tab> to accept, <Esc> to dismiss. I have the panel disabled and no mapping to move backwards through suggestions.

return {
  "zbirenbaum/copilot.lua",
  cmd = "Copilot",
  event = "VeryLazy",
  opts = {
    suggestion = {
      keymap = {
        accept = "<Tab>",
        next = "<C-u>",
        prev = false,
        dismiss = "<Esc>",
      },
    },
    panel = { enabled = false },
  },
}
