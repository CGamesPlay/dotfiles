" This is my configuration file for vimwiki, because I needed to make a lot of
" customizations to it.

if empty($VIMWIKI_ROOT)
  let $VIMWIKI_ROOT = expand("$HOME/Seafile/Notes")
end
let g:pilikino_directory = $VIMWIKI_ROOT
let g:vimwiki_list = [{
      \ 'path': $VIMWIKI_ROOT,
      \ 'syntax': 'markdown', 'ext': '.md'
      \ }]
let g:zettel_fzf_command = 'ag'
let g:zettel_format = '%Y%m%d-%H%M-%title'
let g:zettel_options = [{ 'front_matter': { 'tags': '' } }]

function! MyPilikinoLink(filename)
  let title = substitute(fnamemodify(a:filename, ":r"), "^........-....-", "", "")
  let filename = fnamemodify(a:filename, ":r")
  return "[".title."](".filename.")"
endfunction
let g:pilikino_link_template = 'MyPilikinoLink'

" Define a custom ZettelNew function that works from everywhere, rather than
" only inside of an existing vimwiki buffer.
function! MyZettelNew(title)
  call vimwiki#base#goto_index(0)
  if !empty(a:title)
    call zettel#vimwiki#zettel_new(a:title)
  endif
endfunction

" Open a quickfix list with all "orphaned" files, which need to be linked from
" somewhere else.
function! MyZettelOrphans()
  call vimwiki#base#check_links()
  let errors = []
  for d in getqflist()
    if !has_key(d, 'filename') && !d.bufnr
      " Vimwiki puts a filename for all errors except unlinked files.
      let fname = fnamemodify(split(d.text, '\.md\zs')[0], ':p')
      call add(errors, {'text': 'not reachable from index', 'filename': fname})
    endif
  endfor
  if empty(errors)
    cclose
  else
    call sort(errors, { a, b -> a.filename == b.filename ? 0 : a.filename > b.filename ? -1 : 1 })
    call setqflist(errors)
    copen
  end
endfunction

" Use `Zet my note title` to create a new Zet from anywhere.
command! -nargs=* Zet silent call MyZettelNew(<q-args>)
" Use `ZetOrphans` to list orphaned notes in quickfix
command! ZetOrphans call MyZettelOrphans()

" Use F3 to search the wiki from anywhere
nmap <F3> :Pilikino<CR>
" Use F4 to jump to the wiki from anywhere
nmap <F4> :Zet<CR>

call vimwiki#vars#init()
call vimwiki#vars#populate_syntax_vars('markdown')
let g:vimwiki_syntax_variables.markdown.wikilink = '\[[^\]]\+\](\zs[^)]\+\ze)'

