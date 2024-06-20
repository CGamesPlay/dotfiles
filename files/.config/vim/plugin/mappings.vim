" All of my personal remaps and maps.

" Decrease the delay on waiting for keycodes to finish (Esc in SSH).
set timeout timeoutlen=1000 ttimeoutlen=100

" Mappings for builtin Vim commands {{{

" Use , as a custom leader key, see :help <Leader>
let mapleader=","

" F2 will switch to paste mode, which will disable auto-indent, among other
" things. Only necessary in terminal vim.
set pastetoggle=<F2>

" Unbind arrow keys to force yourself to break that habit when you are just
" getting started with vim.
" noremap <Left> <Nop>
" noremap <Right> <Nop>
" noremap <Up> <Nop>
" noremap <Down> <Nop>
" inoremap <Left> <Nop>
" inoremap <Right> <Nop>
" inoremap <Up> <Nop>
" inoremap <Down> <Nop>

" Enter command mode by pressing ; instead of :
noremap ; :
" jk should scroll by visible lines
nnoremap <silent> j gj
nnoremap <silent> k gk
" and gj/gk should scroll by actual lines
nnoremap <silent> gj j
nnoremap <silent> gk k

" Space will repeat the previous f or t, S-Space in the opposite direction.
noremap <Space> ;
noremap <S-Space> ,
" n / N normally follow / reverse the current search direction. I want n to
" always go forward, and N always backward, regardless of the current search
" direction. (This means #n will always take you to where you just were.)
nnoremap <silent> n /<cr>
nnoremap <silent> N ?<cr>
" By default, * and # respect 'ignorecase'. This mapping forces these commands
" to search case sensitively, which is usually what you want when searching
" code with * or #. May be less good for prose.
nnoremap <silent> * /\C\<<C-R>=expand('<cword>')<CR>\><CR>
nnoremap <silent> # ?\C\<<C-R>=expand('<cword>')<CR>\><CR>
" Remap * and # in visual mode to search for the selected text
vnoremap <silent> * :<C-U>
  \let old_reg=getreg('"')<Bar>let old_regtype=getregtype('"')<CR>
  \gvy/<C-R>=&ic?'\c':'\C'<CR><C-R><C-R>=substitute(
  \escape(@", '/\.*$^~['), '\_s\+', '\\_s\\+', 'g')<CR><CR>
  \gVzv:call setreg('"', old_reg, old_regtype)<CR>
vnoremap <silent> # :<C-U>
  \let old_reg=getreg('"')<Bar>let old_regtype=getregtype('"')<CR>
  \gvy?<C-R>=&ic?'\c':'\C'<CR><C-R><C-R>=substitute(
  \escape(@", '?\.*$^~['), '\_s\+', '\\_s\\+', 'g')<CR><CR>
  \gVzv:call setreg('"', old_reg, old_regtype)<CR>
" ,/ will turn off search highlighting until you search again.
noremap <silent> <leader>/ :nohlsearch<CR>

" Disable pasting with middle mouse
map <MiddleMouse> <Nop>
" Love me some emacs-style shortcuts
inoremap <C-a> <Home>
inoremap <C-e> <End>
inoremap <C-d> <Delete>
cnoremap <C-a> <Home>
cnoremap <C-e> <End>
cnoremap <C-d> <Delete>
" Exit insert mode by typing jk. To actually insert "jk", wait 1 second after
" typing the j.
inoremap jk <Esc>
" Use %% in command mode to get the directory of the current file.
cnoremap %% <C-R>=expand('%:h').'/'<cr>

" Window nav
noremap <C-h> <C-w>h
noremap <C-j> <C-w>j
noremap <C-k> <C-w>k
noremap <C-l> <C-w>l
" Arrow keys scroll view in normal mode
noremap <Up> <C-y>
noremap <Down> <C-e>

" Toggle fullscreen mode on command-enter
if has('gui_macvim')
  nmap <silent> <D-CR> :set fullscreen!<CR>
end

" Q normally switches to ex mode, but I don't use that
map Q gq

" use vp to select the most recently pasted text (VP for whole lines)
vmap p `[o`]
vmap P '[o']

" }}}
" Mappings for plugins {{{

" Search for current word with fugitive
nnoremap <leader>g :Ggrep! -w '<C-r><C-w>'<CR>
" Search for current selection with fugitive
vnoremap <leader>g y:Ggrep! '<C-r>"'<CR>

" Instead of closing the window, wipe out the current buffer, but switch to the
" previous buffer before doing so to preserve window splits.
if has("gui_macvim")
    noremap <D-w> :BD<CR>
else
    noremap <A-w> :BD<CR>
end

" Command-R will save and then refresh the active Chrome window, why not
nnoremap <silent> <D-r> :wa\|RefreshBrowser<CR>

" gu will open the URL under the cursor.
" [google](http://google.com/)
nnoremap gu :OpenURL <C-R>=expand('<cWORD>')<CR><CR>

" Jump to an open file (fzf)
nnoremap <C-B> :Buffers<CR>
" Jump to a file (commands.vim)
nnoremap <C-P> :JumpToFile<CR>
if has("gui_macvim")
  nnoremap <D-o> :JumpToFile<CR>
  " Command palette (fzf)
  nnoremap <D-p> :Commands<CR>
  " Keyboard shortcut palette, in case you forget one (fzf)
  nnoremap <D-P> :Maps<CR>
else
  nnoremap <A-p> :Commands<CR>
  nnoremap <A-P> :Maps<CR>
end
noremap <F1> :Helptags<CR>

" Disable this weird default shortcut from Tsuquyomi
map <Plug>Unused <Plug>(TsuquyomiReferences)

" }}}
