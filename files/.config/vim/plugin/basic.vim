" Configures basic vim options, like the GUI and visual appearance.

" How vim loads files {{{

" Automatically refresh unmodified files when modified by external programs
set autoread
" Backup files are annoying
set nobackup
" I use fish, but startup is super slow so I use sh in vim.
set shell=/bin/sh
if has('vim_starting')
  " Tabs are 4 spaces wide, but we use spaces instead. shiftwidth is for
  " autoindent; softtabstop is for when you press Tab. Don't reset these
  " values when sourcing this file.
  set tabstop=4 expandtab shiftwidth=2 softtabstop=2
end

" }}}
" Main editing area {{{

" Allow backspacing over everything in insert mode
set backspace=indent,eol,start
" Highlight tab literals and trailing spaces
set listchars=tab:\ \ ,trail:\  list
" Ensure there's some context around search results
set scrolloff=5
" For omnifunc completion
set completeopt=menu,menuone,popup,noinsert
" Wrap long lines by showing a symbol at the beginning of the next line.
set linebreak breakindent breakindentopt=shift:0
let &showbreak = " \u21b3  "
" Default to syntax folding, but no folds enabled. Don't reset this value when
" sourcing this file.
if has('vim_starting')
  set foldmethod=syntax foldlevelstart=99
end
" When formatting lines, don't double space after a period.
set nojoinspaces

augroup folding
  au!
  " Don't screw up folds when inserting text that might affect them, until
  " leaving insert mode. Foldmethod is local to the window. Protect against
  " screwing up folding when switching between windows.
  autocmd InsertEnter * if !exists('w:last_fdm') | let w:last_fdm=&foldmethod | setlocal foldmethod=manual | endif
  autocmd InsertLeave,WinLeave * if exists('w:last_fdm') | let &l:foldmethod=w:last_fdm | unlet w:last_fdm | endif
augroup END

" }}}
" Window gutters {{{

" Show line numbers in the gutter
set number
if has('gui_macvim') && exists('+relativenumber')
  " I prefer this, but is really slow to update in the terminal.
  set nonumber relativenumber
end

" Always show the sign column, so it doesn't flicker in when I load files
if exists('+signcolumn')
  if has("nvim-0.5.0") || has("patch-8.1.1564")
    " Recently vim can merge signcolumn and number column into one
    set signcolumn=number
  else
    set signcolumn=yes
  endif
end

if exists('+colorcolumn')
  " Display a line at the 81st column
  set colorcolumn=81
end

" }}}
" The status bar (Lightline) {{{

" Always show the status bar
set laststatus=2
" Lightline configuration.
let g:lightline = {
  \   'active': {
  \     'left': [['mode', 'paste'], ['relativepath', 'modified']],
  \     'right': [['percent', 'lineinfo'], [], ['filetype', 'readonly', 'fileformat']]
  \   },
  \   'inactive': {
  \     'left': [['relativepath', 'modified']],
  \     'right': [['percent', 'lineinfo'], ['filetype', 'readonly', 'fileformat']]
  \   },
  \   'mode_map': {
  \     'n' : 'NRM',
  \     'i' : 'INS',
  \     'R' : 'RPL',
  \     'v' : 'VIS',
  \     'V' : 'VIL',
  \     "\<C-v>": 'VIB',
  \     'c' : 'CMD',
  \     's' : 'SEL',
  \     'S' : 'SLL',
  \     "\<C-s>": 'SLB',
  \     't': 'TRM',
  \   },
  \}
" }}}
" Last line of the screen {{{

" Shows the partial command in the last line
set showcmd
" Lightline shows the mode in it
set noshowmode
" Display the caret position at bottom of screen (superseded by lightline)
"set ruler

" }}}
" The overall GUI {{{

set guioptions=egk
set lazyredraw
set linespace=2
if !has("gui_macvim")
  set guifont="Anonymous Pro":h14
else
  set guifont=JetBrainsMono-Regular:h13,Menlo:h13,Consolas:h14
end
" Use the tab-completion (for files) that I'm used to in bash.
set wildmode=list:longest
" Enable the mouse in normal mode
set mouse=n
" Allow vim to keep buffers open even when they aren't displayed.
set hidden
" smartcase is case-sensitive iff your search includes a capital letter
set ignorecase smartcase incsearch hlsearch
" Check .git/tags for tags files, in all parent directories.
set tags^=./.git/tags;

if has("gui_macvim")
  " Set background to 98% opacity
  set transparency=5 blurradius=30
  " Fullscreen fills entire screen, retains transparency setting
  set fuoptions+=maxhorz,background:Normal
endif

" Disable smartcase in command-line mode, so that tab completion always uses
" ignorecase.
augroup dynamic_smartcase
    autocmd!
    autocmd CmdLineEnter : set nosmartcase
    autocmd CmdLineLeave : set smartcase
augroup END

augroup setup_gui
  " Set preferred window size on startup
  if has("gui_macvim")
    autocmd GUIEnter * :2Cols
  end

  " When editing a file, always jump to the last known cursor position.
  " Don't do it when the position is invalid or when inside an event handler
  " (happens when dropping a file on gvim).
  " Also don't do it when the mark is in the first line, that is the default
  " position when opening a file.
  autocmd BufReadPost *
    \ if line("'\"") > 1 && line("'\"") <= line("$") && &ft != 'gitcommit' |
    \   exe "normal! g`\"" |
    \ endif

  " Automatically open the location list after performing a grep or make
  autocmd QuickFixCmdPost * botright cwindow

  " Close the location list when closing the parent window
  autocmd BufWinLeave * lclose
augroup END

" }}}
