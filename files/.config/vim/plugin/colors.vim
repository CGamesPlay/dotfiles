let s:colors_name_light = 'rosepine_dawn'
let s:colors_name_dark = 'rosepine_moon'

function! s:update_colorscheme()
  if &background == 'light'
    let colors = s:colors_name_light
  else
    let colors = s:colors_name_dark
  end
  if !exists('g:colors_name') || g:colors_name != colors
    " Load the colorscheme
    execute 'colorscheme '.colors
  end

  " Update lightline. See :help lightline-problem-13
  let g:lightline.colorscheme = g:colors_name
  " Forcibly reload the color scheme file
  let candidates = globpath(&rtp, 'autoload/lightline/colorscheme/'.colors.'.vim', 0, 1)
  execute 'source '.candidates[-1]
  if !has('vim_starting') && exists('g:loaded_lightline')
    try
      call lightline#init()
      call lightline#colorscheme()
      call lightline#update()
    catch
    endtry
  end
endfunction

" Dark mode support {{{
if exists('v:os_appearance') " This supports MacVim
  function! s:sync_os_appearance()
    if v:os_appearance % 2 == 0
      set background=light
    else
      set background=dark
    endif
    call s:update_colorscheme()
    redraw!
  endfunction

  augroup macvim_dark_mode
    autocmd GUIEnter * call s:sync_os_appearance()
    autocmd OSAppearanceChanged * call s:sync_os_appearance()
  augroup END
elseif get(environ(), 'DARK_MODE', '') != ''
  " Any non-empty string means use dark mode.
  set background=dark
else
  set background=light
endif
" }}}

call s:update_colorscheme()
augroup set_colorscheme
  autocmd OptionSet background call s:update_colorscheme()
augroup END
