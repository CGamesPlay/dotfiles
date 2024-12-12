# This file came from https://github.com/fishgretel/fasd/blob/master/conf.d/__fasd_run.fish
# Copyright (c) 2021 Aditya Vikram Mukherjee
# Modified by Ryan Patterson

if ! command -qs fasd 2>/dev/null
  exit
end

function __fasd_expand_vars -d "Expands only the first occurance of a variable in the passed string without evaluating the string"
  # The following pipe does the same thing as fasd --sanitize
  printf '%s\\n' "$argv" | sed -e 's/\([^\]\)$( *[^ ]* *\([^)]*\)))*/\1\2/g' -e 's/\([^\]\)[|&;<>$`{}]\{1,\}/\1 /g' | tr -s " " \n
end

function __fasd_run -e fish_postexec -d "fasd records the directories changed into"
  set -lx RETVAL $status
  if test -z $fish_private_mode && test $RETVAL -eq 0 # if there was no error
    command fasd --proc (__fasd_expand_vars $argv) > "/dev/null" 2>&1 & disown
  end
end

# Install a keybinding to allow jumping to directories directly.
bind \co fasd-cd-widget

function fasd-cd-widget -d "Change directory"
  test -n "$FZF_TMUX_HEIGHT"; or set FZF_TMUX_HEIGHT 40%
  begin
    set -lx FZF_DEFAULT_OPTS "--height $FZF_TMUX_HEIGHT --reverse --bind=ctrl-z:ignore $FZF_DEFAULT_OPTS $FZF_ALT_C_OPTS"
    eval 'fasd -Rdl | fzf +m --tiebreak=index' | read -l result

    if [ -n "$result" ]
      set -g __fasd_oldcmd (commandline -b)
      set -g __fasd_cursor_pos (commandline -C)

      commandline -r "cd "(string escape $result)
      commandline -f repaint execute

      function __fasd_restore_cmd -e fish_postexec
        commandline -r $__fasd_oldcmd
        commandline -C $__fasd_cursor_pos
        functions -e __fasd_restore_cmd
        set -eg __fasd_oldcmd __fasd_cursor_pos
      end
    end
  end

  commandline -f repaint
end
