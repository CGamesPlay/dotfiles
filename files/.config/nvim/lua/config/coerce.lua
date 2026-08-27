-- A Neovim plugin for changing keyword case.

return {
  "gregorias/coerce.nvim",
  version = "*",
  config = function()
    require "coerce".setup {}
    local wke = require("coerce.keymaps").which_key_expand
    require("which-key").add({
      { "cr",  group = "+Coerce word",   expand = wke.normal_mode, mode = "n" },
      { "gcr", group = "+Coerce motion", expand = wke.motion_mode, mode = "n" },
      { "gcr", group = "+Coerce visual", expand = wke.visual_mode, mode = "x" },
    })
  end,
}
