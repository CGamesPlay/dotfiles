" Configuration for github/copilot

" Turn copilot to manual mode, so it only suggests when explicitly requested.
let g:copilot_filetypes = { '*': v:false }

" Request with ^X^U (user-defined completion)
imap <C-X><C-U> <Plug>(copilot-suggest)

" Reminder: suggestions are accepted with Tab, And <M-]> and <M-[> cycle
" between options.
