-- This plugin automatically adjusts 'shiftwidth' and 'expandtab' heuristically
-- based on the current file, or, in the case the current file is new, blank,
-- or otherwise insufficient, by looking at other files of the same type in the
-- current and parent directories. Modelines and EditorConfig are also
-- consulted, adding 'tabstop', 'textwidth', 'endofline', 'fileformat',
-- 'fileencoding', and 'bomb' to the list of supported options.
return {
  "tpope/vim-sleuth",
}
