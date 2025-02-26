-- An asynchronous linter plugin for Neovim (>= 0.9.5) complementary to the built-in Language Server Protocol support.
-- Linter list at https://github.com/mfussenegger/nvim-lint?tab=readme-ov-file#available-linters
-- Also, :Mason lists supported ones under linters.

local augroup = vim.api.nvim_create_augroup("config.nvim-lint", { clear = true })

vim.api.nvim_create_user_command("Lint", function()
  require("lint").try_lint()
end, {})

return {
  "mfussenegger/nvim-lint",
  config = function()
    local lint = require("lint")
    lint.linters_by_ft = {
      python = { "ruff" },
      sh = { "shellcheck" },
    }
    -- To override args:
    --   :lua =require('lint').linters.ruff.args
    --table.insert(lint.linters.ruff.args, 2, "--foo")
  end,
  lazy = true,
  init = function()
    vim.api.nvim_create_autocmd({ "BufWritePost" }, {
      desc = "Lint on file save",
      group = augroup,
      callback = function()
        require("lint").try_lint()
      end,
    })
  end,
}
