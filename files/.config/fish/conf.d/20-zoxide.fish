if not command -q fzf; or not command -q zoxide
  return
end

zoxide init fish --no-cmd | source

# Install a keybinding to allow jumping to directories directly.
bind \co __z_cd_widget

function __z_cd_widget --description="Change directory"
  set -lx FZF_DEFAULT_OPTS "--height 40% --reverse --bind=ctrl-z:ignore $FZF_DEFAULT_OPTS"
  set -l result (zoxide query --list | fzf +m --tiebreak=index --preview="ls --color=always {}" --preview-window down)

  if test -n "$result"
    set -f oldcmd (commandline -b)
    set -f cursor_pos (commandline -C)

    commandline -r "cd "(string escape $result)" "
    commandline -f repaint execute

    function __z_cd_restore_cmd -V oldcmd -V cursor_pos -e fish_postexec
      commandline -r $oldcmd
      commandline -C $cursor_pos
      functions -e __z_cd_restore_cmd
    end
  else
    commandline -f repaint
  end
end
