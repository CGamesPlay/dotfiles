let g:solarized_termtrans=1
colorscheme solarized

" Lightline {{{
let g:lightline.colorscheme = 'solarized'
" Lightline has a strangely complex way to reload the config.
" :help lightline-problem-13
function! s:lightline_update()
  if !exists('g:loaded_lightline')
    return
  endif
  try
    " Forcibly reload the color scheme file
    execute 'source' globpath(&rtp, 'autoload/lightline/colorscheme/solarized.vim')
    call lightline#init()
    call lightline#colorscheme()
    call lightline#update()
  catch
  endtry
endfunction
if !has('vim_starting')
  " Call when re-sourcing the vimrc. For some reason doing this before vim has
  " started also causes lightline to break.
  call s:lightline_update()
end

augroup colorscheme
  " Have lightline follow my main color scheme
  autocmd ColorScheme * call s:lightline_update()
  autocmd GUIEnter * call s:lightline_update()
augroup END

" }}}
" Dark mode support {{{
" If supported, have vim track the system dark mode setting.
if exists('v:os_appearance')
  function! s:sync_os_appearance()
    if v:os_appearance % 2 == 0
      set background=light
    else
      set background=dark
    endif
    redraw!
  endfunction

  augroup dark_mode
    autocmd GUIEnter * call s:sync_os_appearance()
    autocmd OSAppearanceChanged * call s:sync_os_appearance()
    autocmd OSAppearanceChanged * call s:lightline_update()
  augroup END
elseif get(environ(), 'DARK_MODE', '') != ''
  " Any non-empty string means use dark mode.
  set bg=dark
endif
" }}}
