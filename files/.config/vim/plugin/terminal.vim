" Settings related to terminal mode

if !has("nvim")
  augroup terminal
    au!
    au TerminalWinOpen * setlocal termwinkey=<C-@>
    au TerminalWinOpen * setlocal nonumber norelativenumber cc=-1 nolist ve+=onemore scrolloff=0
    au TerminalWinOpen * hi! EndOfBuffer ctermfg=0
  augroup END
end

tnoremap jk <C-@>N

command! Terminal botright terminal ++close fish
