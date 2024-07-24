# Clear fzf's ^T binding to leave transpose alone, and use ^P instead
bind -e \ct
bind \cp fzf-file-widget

set fish_color_normal normal # default color
set fish_color_command green --bold # commands like echo
set fish_color_keyword # keywords like if - this falls back on the command color if unset
set fish_color_quote yellow # quoted text like "abc"
set fish_color_redirection cyan # IO redirections like >/dev/null
set fish_color_end normal # process separators like ; and &
set fish_color_error red --reverse # syntax errors
set fish_color_param normal # ordinary command parameters
set fish_color_valid_path --underline # parameters that are filenames (if the file exists)
set fish_color_option # options starting with “-”, up to the first “--” parameter
set fish_color_comment black # comments like ‘# important’
set fish_color_selection white --bold --background=brblack # selected text in vi visual mode
set fish_color_operator # parameter expansion operators like * and ~
set fish_color_escape magenta # character escapes like \n and \x70
set fish_color_autosuggestion --underline # autosuggestions (the proposed rest of a command)
set fish_color_cwd green --bold # the current working directory in the default prompt
set fish_color_cwd_root red # the current working directory in the default prompt for the root user
set ry_fish_color_date cyan # the date in the prompt
set fish_color_user blue # the username in the default prompt
set fish_color_host blue # the hostname in the default prompt
set fish_color_host_remote magenta # the hostname in the default prompt for remote sessions (like ssh)
set fish_color_status red # the last command’s nonzero exit code in the default prompt
set fish_color_cancel --reverse # the ‘^C’ indicator on a canceled command
set fish_color_search_match bryellow --background=brblack # history search matches and selected pager items (background only)
set fish_color_history_current --bold # the current position in the history for commands like dirh and cdh
