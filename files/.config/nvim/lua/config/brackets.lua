-- Improvements to [ and ] keybindings.

local keys = require("keygroup").new("config.brackets")

-- Disable mapping which override these
vim.g.no_python_maps = 1
vim.g.no_ruby_maps = 1
vim.g.no_rust_maps = 1

-- Jump between quickfix locations
local function hunk_nav(key, direction)
  return function()
    if vim.wo.diff then
      vim.cmd.normal({ key, bang = true })
    else
      require("gitsigns").nav_hunk(direction)
    end
  end
end
local MODES = {
  q = { desc = "[Q]uickfix", prev = "cprev", next = "cnext", first = "cfirst", last = "clast" },
  l = { desc = "[L]ocation", prev = "lprev", next = "lnext", first = "lfirst", last = "llast" },
  c = {
    desc = "[C]hange (git hunk)",
    prev = hunk_nav("[c", "prev"),
    next = hunk_nav("]c", "next"),
    first = hunk_nav("[c", "first"),
    last = hunk_nav("]c", "last"),
  },
  d = {
    desc = "[D]iagnostic",
    prev = function() vim.diagnostic.jump({ count = -1 }) end,
    next = function() vim.diagnostic.jump({ count = 1 }) end,
    first = function() vim.diagnostic.jump({ count = -math.huge, wrap = false }) end,
    last = function() vim.diagnostic.jump({ count = math.huge, wrap = false }) end,
  },
}
local last_bracket = "l"

local function safe_cmd(cmd)
  local ok, err
  if type(cmd) == "function" then
    ok, err = pcall(cmd)
  else
    ok, err = pcall(vim.cmd, cmd)
  end
  if not ok then
    local clean_err = err:match("E%d+: (.*)") or err
    vim.api.nvim_echo({ { clean_err, "ErrorMsg" } }, true, {})
  end
end

local function bracket_map(key, cmd, mode_key, desc)
  keys:set("n", key, function()
    last_bracket = mode_key
    safe_cmd(cmd)
  end, { desc = desc })
end

for mode_key, mode in pairs(MODES) do
  bracket_map("[" .. mode_key:upper(), mode.first, mode_key, "Jump To First " .. mode.desc .. " item")
  bracket_map("]" .. mode_key:upper(), mode.last, mode_key, "Jump To Last " .. mode.desc .. " item")
  bracket_map("[" .. mode_key:lower(), mode.prev, mode_key, "Jump To Previous " .. mode.desc .. " item")
  bracket_map("]" .. mode_key:lower(), mode.next, mode_key, "Jump To Next " .. mode.desc .. " item")
end

-- Add [[ and ]] that use the last bracket category
keys:set("n", "[[", function()
  safe_cmd(MODES[last_bracket].prev)
end, { desc = "Jump To Previous (last used category)" })
keys:set("n", "]]", function()
  safe_cmd(MODES[last_bracket].next)
end, { desc = "Jump To Next (last used category)" })

-- Auto-set last_bracket when selecting qflist/loclist items
vim.api.nvim_create_autocmd("FileType", {
  pattern = "qf",
  callback = function()
    vim.keymap.set("n", "<CR>", function()
      if vim.fn.getloclist(0, { winid = 0 }).winid ~= 0 then
        last_bracket = "l"
      else
        last_bracket = "q"
      end
      return "<CR>"
    end, { buffer = true, expr = true, desc = "Select item and set last_bracket" })
  end,
})

-- This file is treated as a lazy plugin spec. This means lazy will
-- automatically reload it for us!
return {}
