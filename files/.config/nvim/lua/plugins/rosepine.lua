return {
  "CGamesPlay/rose-pine-vim",
  name = "rose-pine",
  lazy = false,
  priority = 1000, -- Load this one first
  init = function()
    local colors_name_light = "rosepine_dawn"
    local colors_name_dark = "rosepine_moon"

    local function update_colorscheme()
      local colors
      if vim.o.background == "light" then
        colors = colors_name_light
      else
        colors = colors_name_dark
      end

      if not vim.g.colors_name or vim.g.colors_name ~= colors then
        vim.cmd.colorscheme(colors)
      end
    end

    if os.getenv("DARK_MODE") ~= nil and os.getenv("DARK_MODE") ~= "" then
      -- Any non-empty string means use dark mode
      vim.o.background = "dark"
    else
      vim.o.background = "light"
    end

    vim.schedule(update_colorscheme)
    local augroup_rosepine = vim.api.nvim_create_augroup("rosepine", { clear = true })
    vim.api.nvim_create_autocmd("OptionSet", {
      pattern = "background",
      callback = update_colorscheme,
      group = augroup_rosepine,
    })
  end,
}
