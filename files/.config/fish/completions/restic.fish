if command -q restic
    set -l tmpfile (mktemp)
    restic generate --fish-completion $tmpfile >/dev/null 2>&1
    source $tmpfile
    rm -f $tmpfile
end
