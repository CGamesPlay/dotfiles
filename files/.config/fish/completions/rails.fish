# Completions for `rails` / `bin/rails`.
#
# The first argument is a Rails command, a rake task, or a rake option (Rails
# hands anything it doesn't recognize to rake). Listing commands and tasks boots
# the app (several seconds), so the lists are cached per project and refreshed
# when the Rakefile, Gemfile.lock, or anything under config/ or lib/tasks/
# changes.

# Rake options whose value is the next argument.
set -g __rails_rake_value_flags -C -e -E -f -I -j -p -r -R \
    --directory --execute --execute-continue --rakefile --libdir --jobs \
    --execute-print --require --rakelibdir --rakelib --suppress-backtrace --job-stats

function __rails_root
    set -l root (path resolve .)
    while not test -e $root/config/application.rb
        test "$root" = / && return 1
        set root (path dirname $root)
    end
    echo $root
end

# Prints the up-to-date cache directory for the current project.
function __rails_cache
    set -l root (__rails_root) || return
    set -q XDG_CACHE_HOME; or set -l XDG_CACHE_HOME ~/.cache
    set -l dir $XDG_CACHE_HOME/fish/rails/(string escape --style=var $root)
    set -l inputs $root/Rakefile $root/Gemfile.lock $root/config/** $root/lib/tasks/**
    set -l stamp (path mtime $inputs | sort -n | tail -1)
    if test "$(cat $dir/stamp 2>/dev/null)" != "$stamp"
        __rails_build_cache $root $dir.tmp || return
        echo $stamp >$dir.tmp/stamp
        rm -rf $dir
        mv $dir.tmp $dir
    end
    echo $dir
end

# Writes `commands`, `tasks`, and `options` into DIR. Fails if the app can't
# boot, so a broken environment isn't cached.
function __rails_build_cache -a root dir
    rm -rf $dir
    mkdir -p $dir
    # `--help` lists Rails commands and documented tasks; `-AT` adds the
    # undocumented tasks. Both boot the app, so run them concurrently.
    COLUMNS=1000 $root/bin/rails --help >$dir/help.txt 2>/dev/null &
    set -l help_pid $last_pid
    COLUMNS=1000 $root/bin/rails -AT >$dir/tasks.txt 2>/dev/null &
    set -l tasks_pid $last_pid
    COLUMNS=1000 $root/bin/rails -H >$dir/rake-help.txt 2>/dev/null
    or return
    wait $help_pid; or return
    wait $tasks_pid; or return

    string replace -rf '^bin/rails ([^\s\[]+).*' '$1' <$dir/tasks.txt >$dir/tasks

    begin
        # Aliases and hidden commands from railties/lib/rails/command.rb and
        # railties/lib/rails/commands/*, which `--help` doesn't list.
        printf '%s\t%s\n' \
            c 'Alias for console' s 'Alias for server' g 'Alias for generate' \
            d 'Alias for destroy' t 'Alias for test' r 'Alias for runner' \
            db 'Alias for dbconsole' help 'Show help' \
            unused_routes 'Show routes not referenced by any controller action'
        awk '/^In addition/{f=1;next} f && /^[a-z]/' $dir/help.txt \
            | string replace -r '^(\S+)\s+' '$1\t'
        string replace -rf '^bin/rails (\S+)\s+# ?(.*)$' '$1\t$2' <$dir/tasks.txt
    end | awk -F'\t' '!seen[$1]++' \
        | string replace -r '^([^\t\[]+)(\[[^\t]*\])\t(.*)' '$1\t$2 $3\n$1[\t$2 $3' \
        >$dir/commands

    # Rake's options, relabeling the ones Rails intercepts as the first argument.
    begin
        printf '%s\t%s\n' -h 'Rails help' --help 'Rails help' -H 'Rake help' \
            -v 'Rails version' --version 'Rails version'
        string match -r '^\s+-.*' <$dir/rake-help.txt | while read -l line
            set -l parts (string match -r '^\s*(\S.*?)(?:\s{2,}(.*))?$' -- $line)
            for flag in (string split -- ', ' $parts[2])
                set flag (string match -r -- '^-[^\s=,\[]+' $flag)
                contains -- $flag -h -H --help -v --version && continue
                printf '%s\t%s\n' $flag "$parts[3]"
            end
        end
    end >$dir/options
end

# Prints the named cache file (commands, tasks, or options).
function __rails_cached -a name
    set -l dir (__rails_cache) || return
    cat $dir/$name
end

# Prints the command (first non-option argument), failing if there is none yet.
function __rails_command
    set -l args (commandline -xpc)[2..]
    set -l i 1
    while test $i -le (count $args)
        if contains -- $args[$i] $__rails_rake_value_flags
            set i (math $i + 2)
        else if string match -q -- '-*' $args[$i]
            set i (math $i + 1)
        else
            echo $args[$i]
            return
        end
    end
    return 1
end

function __rails_prev_arg_in
    contains -- (commandline -xpc)[-1] $argv
end

function __rails_completing_option
    string match -q -- '-*' (commandline -ct)
end

# Options of the current Rails command, parsed from `rails CMD --help`, which
# doesn't boot the app. Rake tasks take no options, and `--help` on one would
# boot the app to describe it, so they are skipped.
function __rails_command_options
    set -l root (__rails_root) || return
    set -l cmd (__rails_command)
    contains -- $cmd (__rails_cached tasks) && return
    COLUMNS=1000 $root/bin/rails $cmd --help 2>/dev/null \
        | awk '/^Options:/{f=1;next} f && /^$/{exit} f' \
        | while read -l line
            set -l parts (string split -m1 -- '  # ' (string trim -- $line))
            for flag in (string split -- ', ' (string trim -- $parts[1]))
                set flag (string trim -c '[]' -- $flag | string replace -r '=.*' '=')
                printf '%s\t%s\n' $flag "$parts[2]"
            end
        end
end

for cmd in rails bin/rails
    complete -c $cmd -f
    # Before the command: rake options and their values, or the command itself.
    complete -c $cmd -n 'not __rails_command >/dev/null; and __rails_prev_arg_in -f --rakefile -r --require' -F
    complete -c $cmd -n 'not __rails_command >/dev/null; and __rails_prev_arg_in -C --directory -I --libdir -R --rakelibdir --rakelib' -xa '(__fish_complete_directories)'
    complete -c $cmd -n 'not __rails_command >/dev/null; and __rails_prev_arg_in -T -D -W -AT -AD --tasks --describe --where' -xa '(__rails_cached tasks)'
    complete -c $cmd -n 'not __rails_command >/dev/null; and not __rails_prev_arg_in $__rails_rake_value_flags -T -D -W -AT -AD --tasks --describe --where; and __rails_completing_option' -a '(__rails_cached options)'
    complete -c $cmd -n 'not __rails_command >/dev/null; and not __rails_prev_arg_in $__rails_rake_value_flags -T -D -W -AT -AD --tasks --describe --where; and not __rails_completing_option' -a '(__rails_cached commands)'
    # After the command: its own options.
    complete -c $cmd -n '__rails_command >/dev/null; and __rails_completing_option' -a '(__rails_command_options)'
end
