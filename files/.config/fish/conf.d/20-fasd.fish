# This file came from https://github.com/fishgretel/fasd/blob/master/conf.d/__fasd_run.fish
# Copyright (c) 2017 Aditya Vikram Mukherjee

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
