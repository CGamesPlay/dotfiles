-- The crown jewel of Fugitive is :Git (or just :G), which calls any arbitrary
-- Git command. If you know how to use Git at the command line, you know how to
-- use :Git. It's vaguely akin to :!git but with numerous improvements:
--
-- The default behavior is to directly echo the command's output. Quiet
-- commands like :Git add avoid the dreaded "Press ENTER or type command to
-- continue" prompt.
-- - :Git commit, :Git rebase -i, and other commands that invoke an editor do
--   their editing in the current Vim instance.
-- - :Git diff, :Git log, and other verbose, paginated commands have their
--   output loaded into a temporary buffer. Force this behavior for any command
--   with :Git --paginate or :Git -p.
-- - :Git blame uses a temporary buffer with maps for additional triage. Press
--   enter on a line to view the commit where the line changed, or g? to see
--   other available maps. Omit the filename argument and the currently edited
--   file will be blamed in a vertical, scroll-bound split.
-- - :Git mergetool and :Git difftool load their changesets into the quickfix
--   list.
-- - Called with no arguments, :Git opens a summary window with dirty files and
--   unpushed and unpulled commits. Press g? to bring up a list of maps for
--   numerous operations including diffing, staging, committing, rebasing, and
--   stashing. (This is the successor to the old :Gstatus.)
-- - This command (along with all other commands) always uses the current
--   buffer's repository, so you don't need to worry about the current working
--   directory.
--
-- Additional commands are provided for higher level operations:
--
-- - View any blob, tree, commit, or tag in the repository with :Gedit (and
--   :Gsplit, etc.). For example, :Gedit HEAD~3:% loads the current file as it
--   existed 3 commits ago.
-- - :Gdiffsplit (or :Gvdiffsplit) brings up the staged version of the file
--   side by side with the working tree version. Use Vim's diff handling
--   capabilities to apply changes to the staged version, and write that buffer
--   to stage the changes. You can also give an arbitrary :Gedit argument to
--   diff against older versions of the file.
-- - :Gread is a variant of git checkout -- filename that operates on the
--   buffer rather than the file itself. This means you can use u to undo it
--   and you never get any warnings about the file changing outside Vim.
-- - :Gwrite writes to both the work tree and index versions of a file, making
--   it like git add when called from a work tree file and like git checkout
--   when called from the index or a blob in history.
-- - :Ggrep is :grep for git grep.  :Glgrep is :lgrep for the same.
-- - :GMove does a git mv on the current file and changes the buffer name to
--   match.  :GRename does the same with a destination filename relative to the
--   current file's directory.
-- - :GDelete does a git rm on the current file and simultaneously deletes the
--   buffer.  :GRemove does the same but leaves the (now empty) buffer open.
-- - :GBrowse to open the current file on the web front-end of your favorite
--   hosting provider, with optional line range (try it in visual mode).

local function git_delete()
  local buf = vim.api.nvim_get_current_buf()
  if vim.bo[buf].modified then
    local _, choice = pcall(vim.fn.confirm, "File has been modified", "&Delete\n&Cancel", 2, "Warning")
    if choice ~= 1 then
      return
    end
  end

  vim.cmd("GRemove! | BD")
end

local keys = require("keygroup").new("config.fugitive")

keys:set("n", "<leader>gs", "<Cmd>Git<CR>", { desc = "[G]it [S]tatus" })
keys:set("n", "<leader>gb", "<Cmd>Git blame<CR>", { desc = "[G]it [B]lame" })
keys:set("n", "<leader>gd", git_delete, { desc = "[G]it [D]elete" })
keys:set("n", "<leader>gw", "<Cmd>:Gwrite<CR>", { desc = "[G]it [W]rite (buffer to git index)" })
keys:set("n", "<leader>gr", "<Cmd>:Gread<CR>", { desc = "[G]it [R]ead (buffer from git index)" })

keys:set(
  "n",
  "<leader>g*",
  [[:let @/='\C\V\<<C-r><C-w>\>' | set hlsearch | silent Ggrep! -w '<C-r><C-w>'<CR>]],
  { silent = true, desc = "[G]it Grep Word ([*])" }
)
keys:set(
  "v",
  "g*",
  [[y:let @/='\C\V<C-r>"' | set hlsearch | silent Ggrep! '<C-r>"'<CR>]],
  { silent = true, desc = "[G]it Grep Selection ([*])" }
)

return {
  "tpope/vim-fugitive",
  version = "*",
  event = "VeryLazy",
  init = function()
    vim.g.fugitive_legacy_commands = 0
  end,
}
