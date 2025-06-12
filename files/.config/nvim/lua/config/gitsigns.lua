-- Deep buffer integration for Git

local augroup = vim.api.nvim_create_augroup("config.gitsigns", { clear = true })

vim.api.nvim_create_autocmd("ColorScheme", {
  desc = "Customize gitsigns colors",
  group = augroup,
  callback = function()
    vim.api.nvim_set_hl(0, 'GitSignsAdd', { fg = vim.api.nvim_get_hl(0, { name = "DiffAdd" }).bg })
    vim.api.nvim_set_hl(0, 'GitSignsChange', { fg = vim.api.nvim_get_hl(0, { name = "DiffAdd" }).bg })
    vim.api.nvim_set_hl(0, 'GitSignsStagedAdd', { fg = vim.api.nvim_get_hl(0, { name = "DiffChange" }).bg })
    vim.api.nvim_set_hl(0, 'GitSignsStagedChange', { fg = vim.api.nvim_get_hl(0, { name = "DiffChange" }).bg })
    vim.api.nvim_set_hl(0, 'GitSignsStagedDelete', { fg = vim.api.nvim_get_hl(0, { name = "DiffChange" }).bg })
    vim.api.nvim_set_hl(0, 'GitSignsStagedAddLn', { bg = "bg" })
    vim.api.nvim_set_hl(0, 'GitSignsStagedChangeLn', { bg = "bg" })
  end,
})

return {
  "lewis6991/gitsigns.nvim",
  version = "*",
  event = { "VeryLazy" },
  opts = {
    on_attach = function(bufnr)
      local gitsigns = require('gitsigns')

      local function map(mode, l, r, opts)
        opts = opts or {}
        opts.buffer = bufnr
        vim.keymap.set(mode, l, r, opts)
      end

      -- Display settings
      map("n", "<leader>ts",
        function()
          gitsigns.toggle_linehl()
          gitsigns.toggle_deleted()
        end,
        { desc = "Toggle Git [S]tatus" })

      -- Navigation
      local function hunk_nav(keys, direction)
        map("n", keys, function()
          if vim.wo.diff then
            vim.cmd.normal({ keys, bang = true })
          else
            gitsigns.nav_hunk(direction)
          end
        end, { desc = "Jump to " .. direction .. " [c]hange" })
      end
      hunk_nav("[C", "first")
      hunk_nav("[c", "prev")
      hunk_nav("]c", "next")
      hunk_nav("]C", "last")

      -- Hunk staging
      map("n", "+", gitsigns.stage_hunk, { desc = "Stage hunk" })
      map("v", "+", function()
        gitsigns.stage_hunk({ vim.fn.line('.'), vim.fn.line('v') })
      end, { desc = "Stage hunk" })
    end
  }
}
