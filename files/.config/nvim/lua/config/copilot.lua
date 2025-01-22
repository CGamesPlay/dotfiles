-- Fully featured & enhanced replacement for copilot.vim complete with API for interacting with Github Copilot
-- I have it set up to use <C-u> to cycle through completions, <Tab> to accept, <Esc> to dismiss. I have the panel disabled and no mapping to move backwards through suggestions.

return {
  "zbirenbaum/copilot.lua",
  cmd = "Copilot",
  event = "VeryLazy",
  opts = {
    suggestion = {
      -- This prevents copilot from creating any keymaps. Instead, they get
      -- configured with blink.cmp. This allows properly handling the
      -- interaction between the two libraries.
      keymap = {
        accept = false,
        next = false,
        prev = false,
        dismiss = false,
      },
    },
    panel = { enabled = false },
  },
}
