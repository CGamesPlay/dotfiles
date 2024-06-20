" Configuration for github/copilot

" Turn copilot to manual mode, so it only suggests when explicitly requested.
let g:copilot_filetypes = { '*': v:false }

" Request with ^X^U (user-defined completion), repeat for full modal request
" Reminder: suggestions are accepted with Tab
imap <expr> <C-X><C-U> copilot#GetDisplayedSuggestion()['text'] != '' ?
      \ "\<Esc>:Copilot\<CR>" :
      \ "\<Plug>(copilot-suggest)"
" Do a full modal request when in normal mode
nmap <silent> <C-X><C-U> :Copilot<CR>

