return {
  "chrisgrieser/nvim-genghis",
  version = "*",
  opts = {
    icons = {
      chmodx = "",
      copyPath = "",
      copyFile = "",
      duplicate = "",
      file = "",
      move = "",
      new = "",
      rename = "",
      trash = "",
    },
  },
  keys = {
    {
      "<leader>rf",
      function()
        require("genghis").moveAndRenameFile()
      end,
      desc = "[R]ename [F]ile",
    },
  },
}
