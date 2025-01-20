-- A fancy, configurable, notification manager for NeoVim
-- See :h notify.Config for options and :h notify.setup() for default values.
-- Notifications can be cleared with :NotificationsClear
return {
  "rcarriga/nvim-notify",
  version = "*",
  opts = {
    render = "wrapped-compact",
    stages = "static",
  },
  init = function()
    vim.notify = require("notify")
  end,
  keys = {
    { "<leader>sn", "<Cmd>Telescope notify<CR>", desc = "[S]earch [N]otifications" },
  },
}
