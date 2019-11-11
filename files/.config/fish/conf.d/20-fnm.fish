if [ ! -d ~/.fnm ]
  exit
end

set PATH ~/.fnm $PATH
fnm env --multi --shell=fish | source
# FNM can't be set to use the system by default, brilliant.
fnm use system >/dev/null
