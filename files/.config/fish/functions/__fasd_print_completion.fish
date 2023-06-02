# This fiel came from https://github.com/fishgretel/fasd/blob/master/functions/__fasd_print_completion.fish
# Copyright (c) 2017 Aditya Vikram Mukherjee

# suggest paths for current args as completion
function __fasd_print_completion
  set cmd (commandline -po)
  test (count $cmd) -ge 2; and fasd $argv $cmd[2..-1] -l
end
