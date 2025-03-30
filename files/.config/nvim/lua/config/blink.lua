-- blink.cmp is a completion plugin with support for LSPs and external sources
-- that updates on every keystroke with minimal overhead (0.5-4ms async).

local function copilot_activate(cmp)
  cmp.hide()
  require("copilot.suggestion").next()
  return true
end

--- Activate copilot and show the next suggestion
local function copilot_next(cmp)
  if require("copilot.suggestion").is_visible() then
    cmp.hide()
    require("copilot.suggestion").next()
    return true
  end
end

--- Show the previous copilot suggestion
local function copilot_prev(cmp)
  if require("copilot.suggestion").is_visible() then
    cmp.hide()
    require("copilot.suggestion").next()
    return true
  end
end

--- Accept the current copilot suggestion
local function copilot_accept()
  if require("copilot.suggestion").is_visible() then
    require("copilot.suggestion").accept()
    return true
  end
end

--- Cancel the current copilot action
local function copilot_dismiss()
  if require("copilot.suggestion").is_visible() then
    require("copilot.suggestion").dismiss()
    return true
  end
end

return {
  "saghen/blink.cmp",
  version = "1.0.0",
  opts = {
    -- 'default' for mappings similar to built-in completion
    -- 'super-tab' for mappings similar to vscode (tab to accept, arrow keys to navigate)
    -- 'enter' for mappings similar to 'super-tab' but with 'enter' to accept
    -- https://cmp.saghen.dev/configuration/keymap.html#presets
    keymap = {
      preset = "none",
      ["<C-n>"] = { copilot_next, "show", "select_next", "fallback" },
      ["<Esc>"] = { copilot_dismiss, "cancel", "fallback" },
      ["<C-p>"] = { copilot_prev, "select_prev", "fallback" },
      ["<Up>"] = { "select_prev", "fallback" },
      ["<Down>"] = { "select_next", "fallback" },
      ["<C-e>"] = { copilot_dismiss, "cancel", "fallback" },
      ["<C-y>"] = { copilot_accept, "accept", "fallback" },
      ["<CR>"] = { copilot_accept, "accept", "fallback" },
      ["<C-u>"] = { copilot_activate, "scroll_documentation_up", "fallback" },
      ["<C-d>"] = { "scroll_documentation_down", "fallback" },
      ["<Tab>"] = { copilot_accept, "select_and_accept", "snippet_forward", "fallback" },
      ["<S-Tab>"] = { "snippet_backward", "fallback" },
    },
    completion = {
      accept = { auto_brackets = { enabled = false } },
      menu = {
        auto_show = false,
        draw = {
          columns = {
            { "label", "label_description", gap = 1 },
            { "kind_icon", "kind" },
          },
        },
      },
      list = {
        selection = { preselect = false, auto_insert = false },
      },
      documentation = {
        auto_show = true,
        auto_show_delay_ms = 0,
      },
    },
    sources = {
      default = { "lsp", "path", "snippets", "buffer" },
    },
    -- Blink supports completing on the cmdline. There are two main problems with this:
    -- 1. Blink uses fuzzy matching, which is never what I want when
    --    completing filenames.
    -- 2. Blink doesn't have an "implicit accept" function. If you type
    --    `:e fi<Tab>`, then you get `:e files/`, and if you then type
    --    `.co<Tab>`, you get `:e files/.cargo`, because you pressed tab
    --    (select_next) while `.config` was selected (so show_and_insert
    --    was skipped).
    cmdline = {
      enabled = false,
      keymap = {
        preset = "none",
        ["<C-n>"] = { "show", "select_next", "fallback" },
        ["<Esc>"] = { "cancel", "fallback" },
        ["<C-p>"] = { "select_prev", "fallback" },
        ["<Up>"] = { "select_prev", "fallback" },
        ["<Down>"] = { "select_next", "fallback" },
        ["<C-e>"] = { "cancel", "fallback" },
        ["<C-y>"] = { "accept", "fallback" },
        ["<CR>"] = { "accept", "fallback" },
        ["<Tab>"] = { "show_and_insert", "select_next", "fallback" },
        ["<S-Tab>"] = { "fallback" },
      },
    },
    appearance = {
      nerd_font_variant = "mono",
    },
  },
}
