-- This is a script to:
-- - unload, delete or wipe a buffer without closing the window it was
--   displayed in
-- - in its place, display the buffer most recently used in the window, prior
--   to the buffer being killed.  This selection is taken from the full list of
--   buffers ever displayed in the particular window.
-- - allow one level of undo in case you kill a buffer then change your mind
-- - allow navigation through recently accessed buffers, without closing them.
-- - override the standard Ctrl-^ (Ctrl-6) functionality to maintain the
--   correct cursor column position. (Enable via g:BufKillOverrideCtrlCaret)
return {
  "qpkorr/vim-bufkill",
}
