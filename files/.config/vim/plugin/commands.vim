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
" Prettier {{{

let g:prettier_enabled = 1
function! s:prettier_do_save()
  if exists('g:prettier_enabled') && !g:prettier_enabled
    return
  elseif exists('b:prettier_enabled') && b:prettier_enabled
    Prettier
  end
endfunction

" Automatically enable prettier_enabled based on heuristics.
function! PrettierAutoenable()
  " TODO: don't do this for node_modules
  let b:prettier_enabled=1
endfunction

" Quick way to toggle prettier_enabled globally/for buffer
command! PrettierDisable let g:prettier_enabled = 0
command! PrettierEnable let g:prettier_enabled = 1
command! PrettierDisableBuffer let b:prettier_enabled = 0
command! PrettierEnableBuffer let b:prettier_enabled = 1

augroup prettier
  au!
  autocmd BufWritePre * call s:prettier_do_save()
augroup END

" }}}
