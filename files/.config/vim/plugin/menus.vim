" Adding options to the GUI menu

menu FZF.Files :Files 
menu FZF.Git\ Files :GFiles<CR>
menu FZF.Modified\ Git\ Files :GFiles?<CR>
menu FZF.Buffers :Buffers<CR>
menu FZF.Color\ Schemes :Colors<CR>
menu FZF.Search\ with\ Ag :Ag 
menu FZF.Search\ with\ Rg :Rg 
menu FZF.Lines\ in\ open\ buffers :Lines 
menu FZF.Lines\ in\ current\ buffer :BLines 
menu FZF.Tags\ in\ project :Tags<CR>
menu FZF.Tags\ in\ current\ buffer :BTags<CR>
menu FZF.Marks :Marks<CR>
menu FZF.Windows :Windows<CR>
menu FZF.Search\ using\ Locate :Locate 
menu FZF.File\ History :History<CR>
menu FZF.Command\ History :History:<CR>
menu FZF.Search\ History :History/<CR>
menu FZF.Snippets :Snippets<CR>
menu FZF.Git\ Commits :Commits<CR>
menu FZF.Git\ Commits\ for\ current\ buffer :BCommits<CR>
menu FZF.Commands :Commands<CR>
menu FZF.Maps :Maps<CR>
menu FZF.Helptags :Helptags<CR>
menu FZF.Filetypes :Filetypes<CR>

if has("gui_macvim")
  macmenu FZF.Buffers key=<C-b>
  macmenu FZF.Commands key=<D-p>
  macmenu FZF.Maps key=<D-P>
  macmenu FZF.Helptags key=<F1>
end

" Remove options from the right-click menu
silent! aunmenu PopUp.Select\ Word
silent! aunmenu PopUp.Select\ Sentence
silent! aunmenu PopUp.Select\ Paragraph
silent! aunmenu PopUp.Select\ Line
silent! aunmenu PopUp.Select\ Block
silent! aunmenu PopUp.Select\ Blockwise
silent! aunmenu PopUp.Select\ All
