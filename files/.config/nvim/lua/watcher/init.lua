---@class Config
---@field verbose boolean Notify when a file is reloaded.
local config = {
  verbose = false
}

---@class WatcherPlugin
---Installs a file watcher for visible buffers in nvim.
---
---Ideally, this should be done by nvim automatically, but this isn't done yet.
---This does *not* integrate with LSP or reload non-visible buffers, because
---the LSP server should do that on its own, which is supported by nvim.
---
---See here for more details:
---https://github.com/neovim/neovim/issues/1380#issuecomment-1946115753
local M = {}

---@type Config
M.config = config

-- Internal state
local watchers = {}         -- Map of directory paths to fs_event handles
local checktime_timer = nil -- Debounce timer for checktime calls

-- Cleanup function to stop all watchers
local function cleanup_watchers()
  for _, watcher in pairs(watchers) do
    if watcher and not watcher:is_closing() then
      watcher:stop()
      watcher:close()
    end
  end
  watchers = {}

  if checktime_timer and not checktime_timer:is_closing() then
    checktime_timer:stop()
    checktime_timer:close()
    checktime_timer = nil
  end
end

-- Check if buffer is visible and file-backed, returns filepath if so
local function get_visible_file_path(bufnr)
  -- Check if buffer is loaded and valid
  if not vim.api.nvim_buf_is_loaded(bufnr) then
    return nil
  end

  -- Get the file path
  local filepath = vim.api.nvim_buf_get_name(bufnr)
  if filepath == "" then
    return nil
  end

  -- Check if it's a real file (not a special buffer)
  local buftype = vim.api.nvim_get_option_value('buftype', { buf = bufnr })
  if buftype ~= "" then
    return nil
  end

  -- Check if buffer is displayed in any window
  local wins = vim.fn.win_findbuf(bufnr)
  if #wins == 0 then
    return nil
  end

  -- Convert to absolute path
  return vim.fn.fnamemodify(filepath, ':p')
end

-- Get all directories containing visible file buffers
local function get_visible_directories()
  local dirs = {}
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    local filepath = get_visible_file_path(bufnr)
    if filepath then
      local dir = vim.fn.fnamemodify(filepath, ':p:h')
      dirs[dir] = true
    end
  end
  return dirs
end

-- Debounced checktime for a specific buffer
local function debounced_checktime(bufnr, fullpath)
  if checktime_timer then
    checktime_timer:stop()
  else
    checktime_timer = vim.uv.new_timer()
  end

  checktime_timer:start(100, 0, vim.schedule_wrap(function()
    -- Check if buffer is modified before calling checktime
    if vim.api.nvim_get_option_value('modified', { buf = bufnr }) then
      local relpath = vim.fn.fnamemodify(fullpath, ':.')
      vim.notify("File changed on disk but buffer is modified: " .. relpath, vim.log.levels.WARN)
      return
    end

    -- Capture changedtick before checktime to see if buffer actually changes
    local before_tick = vim.api.nvim_buf_get_changedtick(bufnr)
    vim.api.nvim_command('checktime ' .. bufnr)
    local after_tick = vim.api.nvim_buf_get_changedtick(bufnr)

    if M.config.verbose and after_tick > before_tick then
      local relpath = vim.fn.fnamemodify(fullpath, ':.')
      vim.notify("Reloading " .. relpath)
    end
  end))
end

-- Handle file system events
local function on_file_change(dir, filename)
  if not filename then return end

  local fullpath = vim.fn.resolve(dir .. "/" .. filename)

  -- Check if this file corresponds to any visible buffer
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    local bufpath = get_visible_file_path(bufnr)
    if bufpath and vim.fn.resolve(bufpath) == fullpath then
      debounced_checktime(bufnr, fullpath)
      break
    end
  end
end

-- Start watching a directory
local function start_watcher(dir)
  if watchers[dir] or not vim.fn.isdirectory(dir) then
    return
  end

  local watcher = vim.uv.new_fs_event()
  if not watcher then
    return
  end

  local success = watcher:start(dir, {}, vim.schedule_wrap(function(err, filename, events)
    if err then
      return
    end
    on_file_change(dir, filename)
  end))

  if success then
    watchers[dir] = watcher
  else
    watcher:close()
  end
end

-- Sync watchers with current visible directories
local function sync_watchers()
  local current_dirs = get_visible_directories()

  -- Remove watchers for directories no longer needed
  for dir, watcher in pairs(watchers) do
    if not current_dirs[dir] then
      if watcher and not watcher:is_closing() then
        watcher:stop()
        watcher:close()
      end
      watchers[dir] = nil
    end
  end

  -- Add watchers for new directories
  for dir in pairs(current_dirs) do
    if not watchers[dir] then
      start_watcher(dir)
    end
  end
end

---Installs the plugin.
---@param args Config?
M.setup = function(args)
  M.config = vim.tbl_deep_extend("force", M.config, args or {})

  -- Set up autocommands to track buffer visibility changes
  local group = vim.api.nvim_create_augroup("WatcherPlugin", { clear = true })

  -- Update watchers when buffers change visibility
  vim.api.nvim_create_autocmd({ "BufEnter", "BufLeave", "BufWinEnter", "BufWinLeave" }, {
    group = group,
    callback = function()
      vim.schedule(sync_watchers)
    end,
  })

  -- Initial setup
  sync_watchers()
end

---Deactivate the plugin. This is called by Lazy to live-reload the plugin.
M.deactivate = function()
  cleanup_watchers()

  -- Clear autocommands
  vim.api.nvim_del_augroup_by_name("WatcherPlugin")
end

---Health check function to show current monitoring state
M.check = function()
  -- Show configuration
  vim.health.start("Configuration")
  vim.health.info("verbose: " .. tostring(M.config.verbose))

  -- Get current state
  local visible_dirs = get_visible_directories()

  -- Create map of directory => basenames for all visible files
  local dir_to_basenames = {}
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    local filepath = get_visible_file_path(bufnr)
    if filepath then
      local file_dir = vim.fn.fnamemodify(filepath, ':p:h')
      local basename = vim.fn.fnamemodify(filepath, ':t')
      if not dir_to_basenames[file_dir] then
        dir_to_basenames[file_dir] = {}
      end
      table.insert(dir_to_basenames[file_dir], basename)
    end
  end

  -- Show watched directories
  vim.health.start("Watched directories")

  for dir in pairs(visible_dirs) do
    -- Get basenames for this directory
    local basenames = dir_to_basenames[dir] or {}
    local dir_info = ""
    if #basenames > 0 then
      dir_info = " [" .. table.concat(basenames, ", ") .. "]"
    end

    if watchers[dir] then
      vim.health.ok(dir .. dir_info)
    else
      vim.health.warn(dir .. dir_info .. " (error: not active)")
    end
  end

  -- Show watcher status
  vim.health.start("Watcher status")
  local watcher_count = 0
  for _ in pairs(watchers) do
    watcher_count = watcher_count + 1
  end
  vim.health.ok("Active watchers: " .. watcher_count)
end

return M

