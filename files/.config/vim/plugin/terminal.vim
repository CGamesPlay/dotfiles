" Settings related to terminal mode

augroup terminal
  au!
  au TerminalWinOpen * setlocal termwinkey=<C-@>
  au TerminalWinOpen * setlocal nonumber norelativenumber cc=-1 nolist ve+=onemore scrolloff=0
  au TerminalWinOpen * hi! EndOfBuffer ctermfg=0
augroup END

tnoremap jk <C-@>N

command! Terminal botright terminal ++close fish
