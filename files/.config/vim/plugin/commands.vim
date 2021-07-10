" Custom user commands

" Convenient command to see the difference between the current buffer and the
" file it was loaded from, thus the changes you made.
command! DiffOrig vert new | set bt=nofile | r # | 0d_ | diffthis
      \ | wincmd p | diffthis

" Resize my window to fit N columns of 81 columns with 6 gutter columns each
" plus (n - 1) separator bars, and be max height
function! SetCols(n)
  let cols = a:n * 88 - 1
  exec "set columns=" . cols . " lines=999"
  exec "normal \<C-W>="
endfunction
command! -count=1 Cols call SetCols(<count>)

" This function will refresh the top Chrome window.
function! s:refresh_browser()
  silent let result = system('osascript', 'tell application "Google Chrome" to set URL of active tab of its first window to "javascript:void(typeof Jupyter !== \"undefined\" ? Jupyter.notebook.execute_all_cells() : location.reload())"')
  if v:shell_error
    echo result
  endif
endfunction
command! -bar RefreshBrowser call s:refresh_browser()

" Open the given URL in the default program. The URL can contain extra
" characters, for example if using <cWORD>.
function! OpenURL(url)
  let url = matchstr(a:url, '[a-z]*:\/\/[^ >,;()]*')
  call system('open '.shellescape(url))
endfunction
command! -nargs=1 -bar OpenURL call OpenURL(<q-args>)

" Open the given filename with Typora.
function! s:open_in_typora(filename)
  call system('open -a Typora '.shellescape(a:filename))
endfunction
command! -bar Typora call s:open_in_typora(expand('%:p'))

" Open fzf, either with the current git repo or with a normal file list.
function! s:jump_to_file()
  let git_dir = FugitiveExtractGitDir(getcwd())
  if git_dir != ''
    call fzf#vim#gitfiles('-co --exclude-standard', 0)
  else
    call fzf#vim#files(0)
  endif
endfunction
command! -bar JumpToFile call s:jump_to_file()

function! s:tsc()
  let saved_efm = &efm
  try
    silent set efm=%f(%l\\\,%c):\ %m
    cexpr system('tsc -b .')
  finally
    exec 'set efm='.escape(saved_efm, " \t|\\\"")
  endtry
endfunction
command! TSC call s:tsc()

" Vimrc navigation {{{

" Handler for the VimrcLines command
function s:lines_handler(line)
  let components = split(a:line, ":", 2)
  exec 'silent' 'edit' '+'.components[1] components[0]
endfunction

" FZF for all vim runtime files
command! VimRuntime call fzf#run(fzf#wrap({
  \ 'source': split(substitute(execute('scriptnames'), ' *\d*: ', '', 'g'), "\n"),
  \ 'options': ['--prompt', 'Vim> ', '--nth=1'],
  \ }))
" FZF for my own vimrc files
command! Vimrc call fzf#run(fzf#wrap(fzf#vim#with_preview({ 'source': 'find $XDG_CONFIG_HOME/vim -name bundle -prune -o -path \*/\*.vim -print -o \! -type d -print' })))
" Full text search for my vimrc files
command! VimrcLines call fzf#run(fzf#wrap(fzf#vim#with_preview({
  \ 'source': 'find $XDG_CONFIG_HOME/vim -name bundle -prune -o -path \*/\*.vim -print -o \! -type d -print | xargs grep -Hn .',
  \ 'sink': function('s:lines_handler')
  \ })))

" }}}
