-- blink.cmp is a completion plugin with support for LSPs and external sources
-- that updates on every keystroke with minimal overhead (0.5-4ms async).

---@return boolean true if the context is cmdline, except for search cmdlines.
local function only_cmdline(ctx)
  return ctx.mode == "cmdline" and not vim.tbl_contains({ "/", "?" }, vim.fn.getcmdtype())
end

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
  version = "*",
  opts = {
    -- 'default' for mappings similar to built-in completion
    -- 'super-tab' for mappings similar to vscode (tab to accept, arrow keys to navigate)
    -- 'enter' for mappings similar to 'super-tab' but with 'enter' to accept
    -- https://cmp.saghen.dev/configuration/keymap.html#presets
    keymap = {
      preset = "none",
      ["<C-n>"] = { copilot_next, "show", "select_next", "fallback" },
      ["<Esc>"] = { copilot_dismiss, "hide", "fallback" },
      ["<C-p>"] = { copilot_prev, "select_prev", "fallback" },
      ["<Up>"] = { "select_prev", "fallback" },
      ["<Down>"] = { "select_next", "fallback" },
      ["<C-e>"] = { copilot_dismiss, "hide", "fallback" },
      ["<C-y>"] = { copilot_accept, "accept", "fallback" },
      ["<CR>"] = { copilot_accept, "accept", "fallback" },
      ["<C-u>"] = { copilot_activate, "scroll_documentation_up", "fallback" },
      ["<C-d>"] = { "scroll_documentation_down", "fallback" },
      ["<Tab>"] = { copilot_accept, "select_and_accept", "snippet_forward", "fallback" },
      ["<S-Tab>"] = { "snippet_backward", "fallback" },

      cmdline = {
        preset = "default",
        ["<Tab>"] = {
          function(cmp)
            if not cmp.is_visible() then
              return cmp.show()
            end
          end,
          "select_next",
          "fallback",
        },
        ["<S-Tab>"] = { "select_prev", "fallback" },
      },
    },
    completion = {
      accept = { auto_brackets = { enabled = false } },
      menu = {
        auto_show = only_cmdline,
        draw = {
          columns = {
            { "label", "label_description", gap = 1 },
            { "kind_icon", "kind" },
          },
        },
      },
      list = {
        selection = {
          preselect = false,
          auto_insert = only_cmdline,
        },
      },
      documentation = {
        auto_show = true,
        auto_show_delay_ms = 0,
      },
    },
    sources = {
      default = { "lsp", "path", "snippets", "buffer" },
    },
    appearance = {
      nerd_font_variant = "mono",
    },
  },
}
