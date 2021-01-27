" This is my configuration file for vimwiki, because I needed to make a lot of
" customizations to it.

if !exists('g:pilikino_directory')
  let g:pilikino_directory = expand("$HOME/Seafile/Notes")
end

function! MyPilikinoLink(filename)
  let title = substitute(fnamemodify(a:filename, ":r"), "^........-....-", "", "")
  let filename = fnamemodify(a:filename, ":r")
  return "[".title."](".filename.")"
endfunction
let g:pilikino_link_template = 'MyPilikinoLink'

" Use F3 to search the wiki from anywhere
nmap <F3> :Pilikino<CR>
