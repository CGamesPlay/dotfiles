-- Deep buffer integration for Git

local function set_colors()
    local wcColor = vim.api.nvim_get_hl(0, { name = "DiffAdd" }).bg
    for _, group in pairs({ "GitSignsAdd", "GitSignsChange", "GitSignsTopdelete", "GitSignsChangedelete", "GitSignsDelete" }) do
      vim.api.nvim_set_hl(0, group, { fg = wcColor })
    end

    local stageColor = vim.api.nvim_get_hl(0, { name = "DiffChange" }).bg
    for _, group in pairs({ "GitSignsStagedAdd", "GitSignsStagedChange", "GitSignsStagedTopdelete", "GitSignsStagedChangedelete", "GitSignsStagedDelete" }) do
      vim.api.nvim_set_hl(0, group, { fg = stageColor })
    end

    vim.api.nvim_set_hl(0, 'GitSignsStagedAddLn', { bg = "bg" })
    vim.api.nvim_set_hl(0, 'GitSignsStagedChangeLn', { bg = "bg" })
end

local augroup = vim.api.nvim_create_augroup("config.gitsigns", { clear = true })

vim.api.nvim_create_autocmd("ColorScheme", {
  desc = "Customize gitsigns colors",
  group = augroup,
  callback = set_colors,
})

if vim.g.colors_name then
  set_colors()
end

local keys = require("keygroup").new("config.gitsigns")
keys:set(
  "n",
  "<leader>gs",
  function() require("gitsigns").setqflist(0, { use_location_list = true }) end,
  { silent = true, desc = "[G]it [S]tatus File" }
)
keys:set(
  "n",
  "<leader>gS",
  function() require("gitsigns").setqflist("all") end,
  { silent = true, desc = "[G]it [S]tatus Repository" }
)
keys:set(
  "n",
  "<leader>gr",
  function() require("gitsigns").reset_hunk() end,
  { silent = true, desc = "[G]it [R]eset Hunk" }
)
keys:set(
  "v",
  "<leader>gr",
  function() require("gitsigns").reset_hunk({ vim.fn.line('.'), vim.fn.line('v') }) end,
  { silent = true, desc = "[G]it [R]eset Selection" }
)

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


      -- Hunk staging
      map("n", "+", gitsigns.stage_hunk, { desc = "Stage hunk" })
      map("v", "+", function()
        gitsigns.stage_hunk({ vim.fn.line('.'), vim.fn.line('v') })
      end, { desc = "Stage hunk" })
    end
  }
}
