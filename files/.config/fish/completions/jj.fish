function __fish_jj_complete_custom_aliases
    set -g _argc_completer_words
    _argc_completer_parse_line
    set _argc_completer_words[1] ~/.config/jj/Argcfile.sh
    set jj_aliases (jj --ignore-working-copy config list aliases -T 'name.replace("aliases.", "") ++ "\n"')
    # If the command name is already finalized, skip generating completions if the command is not a jj alias.
    if test (count $_argc_completer_words) -gt 2
        # If the command isn't a jj alias, don't attempt custom completions
        if not contains $_argc_completer_words[2] $jj_aliases
            return 0
        end
        # We are completing arguments for a custom alias
        argc --argc-compgen fish "" $_argc_completer_words
        return 1
    else
        set completions (argc --argc-compgen fish "" $_argc_completer_words)
        if test (count $_argc_completer_words) -eq 2
            # We are completing the actual custom alias name
            for comp in $completions
                set -l cmd (string match -r "^[^\t]+" -- $comp)
                if contains -- $cmd $jj_aliases
                    echo "$comp"
                end
            end
        end
        return 0 # Mix with regular jj completions
    end
end

# The reason for `__fish_dynamic_completion_test` is that, if dynamic
# completion is not implemented, we'd like to get an error reliably. However,
# the behavior of `jj` without arguments depends on the value of a config, see
# https://jj-vcs.github.io/jj/latest/config/#default-command
if set -l completion (COMPLETE=fish jj __fish_dynamic_completion_test 2>/dev/null)
    # jj is new enough for dynamic completions to be implemented (0.24.0 - 2024-12-04)
    # Inject the custom completion into the command
    printf %s\n $completion | string replace -r '\(COMPLETE=fish' '(__fish_jj_complete_custom_aliases; and COMPLETE=fish' | source
else
    jj util completion fish | source
end
