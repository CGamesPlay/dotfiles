" Custom user commands

" Convenient command to see the difference between the current buffer and the
" file it was loaded from, thus the changes you made.
command! DiffOrig vert new | set bt=nofile | r # | 0d_ | diffthis
      \ | wincmd p | diffthis

" Resize my window to fit N columns of 81 columns with 6 gutter columns each
" plus (n - 1) separator bars, and be max height
function! SetCols(n)
  let cols = a:n * (&cc + 5) - 1
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

" Open fzf, either with the current git repo or with a normal file list. If
" the current buffer is in a git repo, use this table:
" | CWD             | Effect             |
" | --------------- | ------------------ |
" | Worktree root   | Gitfiles           |
" | Worktree subdir | Gitfiles in subdir |
" | Otherwise       | Files              |
"
" Fugitive will handle cases where no buffer is loaded by falling back to the
" cwd. If there is no git dir, always fall back to Files.
function! s:jump_to_file() abort
  let git_worktree = FugitiveWorkTree()
  let dir = getcwd()
  if !empty(git_worktree) && (git_worktree == dir || stridx(dir, git_worktree.'/') == 0)
    " In the workdir root or subdirectory
    call fzf#vim#gitfiles('-co --exclude-standard', { 'dir': dir })
  else
    call fzf#vim#files(0)
  endif
endfunction
command! -bar JumpToFile call s:jump_to_file()

" Load all Typescript errors into the current error list.
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

" Vimrc tools {{{

command! ReloadVimrc source ~/.vimrc | runtime! plugin/**/*.vim

" FZF for all vim runtime files
command! VimRuntime call fzf#run(fzf#wrap({
  \ 'source': split(substitute(execute('scriptnames'), ' *\d*: ', '', 'g'), "\n"),
  \ 'options': ['--prompt', 'Vim> ', '--nth=1'],
  \ }))

" }}}
" Dotfiles navigation {{{

let g:dotfiles_dir = simplify(fnamemodify(resolve(expand('<sfile>')), ':h').'/../../../..')

" Choose a particular file from my dotfiles.
command! -nargs=? Dotfile call fzf#vim#gitfiles('-co --exclude-standard', { 'dir': g:dotfiles_dir })
" Run dfm
exe 'command! -nargs=* Dfm !'.shellescape(g:dotfiles_dir).'/bin/dfm -d '.shellescape(g:dotfiles_dir).' <args>'

" }}}
