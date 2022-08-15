" Settings related to terminal mode

augroup terminal
  au!
  au TerminalOpen * setlocal termwinkey=<C-@>
  au TerminalOpen * setlocal nonumber norelativenumber cc=-1 nolist ve+=onemore scrolloff=0
  au TerminalOpen * hi! EndOfBuffer ctermfg=0
augroup END

tnoremap jk <C-@>N

command! Terminal botright terminal ++close fish
