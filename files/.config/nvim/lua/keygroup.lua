-- A key group is a wrapper around vim.keymap.set, with two added behaviors:
-- 1. When another keygroup with the same name is created (e.g. by sourcing the
--    same file again), all previous mappings created by the group are unset.
-- 2. Mappings can be added with an "ft" key. When this is given, instead of
--    the mapping applying globally, it is only added to buffers of the
--    matching filetype.
--
-- Example usage:
--   local keys = require("keygroup").new("my.module.name")
--   keys:set("n", "<leader>s", "<Cmd>echo 'mapped!'<CR>", { desc = "..." })
--
-- This module defines a command :Keygroups that prints the names and source
-- locations of all active KeyGroups.
--
-- This module was created by Ryan Patterson in 2025 and is placed into the
-- public domain.

---@type table<string, KeyGroup>
local all_groups = {}

---@class KeyGroup
---@field protected _name string
---@field protected _source string
---@field protected _maps { [1]: string|string[], [2]: string, [3]: string|function, [4]: table? }[]
local M = {}
M.__index = M

--- Create a new KeyGroup, removing any previous KeyGroup which has the same
--- name. Options include:
---@param name string
function M.new(name)
  local self = setmetatable({}, M)
  self._name = name
  local source = debug.getinfo(2, "Sl")
  self._source = source.source .. ":" .. source.currentline
  self._maps = {}
  if all_groups[name] then
    all_groups[name]:_dispose()
  end
  all_groups[name] = self
  return self
end

---@param ft integer filetype of the named buffer
---@param buf integer
function M:_set_buffer_all(ft, buf)
  for _, map in ipairs(self._maps) do
    local modes, lhs, rhs, opts = unpack(map)
    if opts and opts.ft and vim.tbl_contains(opts.ft, ft) then
      self:_set_buffer(modes, lhs, rhs, opts, buf)
    end
  end
end

---@param modes string|string[]
---@param lhs string
---@param rhs string|function
---@param opts table?
---@param buf integer
function M:_set_buffer(modes, lhs, rhs, opts, buf)
  local buf_opts = vim.tbl_extend("force", opts, { buffer = buf })
  buf_opts.ft = nil
  vim.keymap.set(modes, lhs, rhs, buf_opts)

  local buf_groups = vim.b[buf].keygroup_groups or {}
  buf_groups[self._name] = buf_groups[self._name] or {}
  table.insert(buf_groups[self._name], { modes, lhs, rhs, buf_opts })
  vim.b[buf].keygroup_groups = buf_groups
end

--- Adds a new mapping. Works the same as vim.keymap.set.
--- For {opts}, the same values as nvim_set_keymap() {opts} are accepted, plus
--- an optional {ft}. When ft is provided, this mapping will automatically be
--- added to all current and future buffers of the matching filetype.
---@param modes string|string[]
---@param lhs string
---@param rhs string|function
---@param opts table?
function M:set(modes, lhs, rhs, opts)
  opts = opts or {}
  if opts.ft and opts.buffer ~= nil then
    error("ft cannot be combined with buffer")
  end
  if opts.ft then
    opts.ft = type(opts.ft) == "table" and opts.ft or { opts.ft }
    -- add to currently open buffers
    for _, buf in ipairs(vim.api.nvim_list_bufs()) do
      local ft = vim.api.nvim_get_option_value("filetype", { buf = buf })
      if vim.tbl_contains(opts.ft, ft) then
        self:_set_buffer(modes, lhs, rhs, opts, buf)
      end
    end
  else
    vim.keymap.set(modes, lhs, rhs, opts)
  end
  table.insert(self._maps, { modes, lhs, rhs, opts })
end

--- Remove all keymaps from this group
function M:_dispose()
  -- Remove all global mappings
  for _, map in ipairs(self._maps) do
    local modes, lhs, _, opts = unpack(map)
    if not opts or not opts.ft then
      pcall(vim.keymap.del, modes, lhs, opts)
    end
  end

  -- Remove all buffer-specific mappings
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    local buf_groups = vim.b[buf].keygroup_groups
    if buf_groups then
      local maps = buf_groups[self._name] or {}
      buf_groups[self._name] = nil
      vim.b[buf].keygroup_groups = buf_groups
      for _, map in ipairs(maps) do
        local modes, lhs, _, opts = unpack(map)
        pcall(vim.keymap.del, modes, lhs, opts)
      end
    end
  end
end

local augroup = vim.api.nvim_create_augroup("keygroup", { clear = true })

vim.api.nvim_create_autocmd("FileType", {
  callback = function(event)
    for _, map in pairs(all_groups) do
      map:_set_buffer_all(event.match, event.buf)
    end
  end,
  group = augroup,
  desc = "Apply ft-specific KeyGroup mappings",
})

vim.api.nvim_create_user_command("Keygroups", function()
  local any = false
  for name, map in pairs(all_groups) do
    any = true
    print(name .. "  " .. map._source)
  end
  if not any then
    print("No KeyGroups active")
  end
end, { desc = "Print locations of all active KeyGroups" })

return M
