nmap <silent><buffer> <C-]> <Plug>VimwikiFollowLink
nmap <silent><buffer> <S-BS> <Plug>VimwikiGoBackLink
nmap <buffer> <F5> :ZetOrphans<CR>
nmap <buffer> <F6> :call OpenInTypora(expand('%:p'))<CR>
nmap <buffer> <F7> :VimwikiBacklinks<CR>
setlocal concealcursor=nc conceallevel=2 nobreakindent showbreak=\ \ 
