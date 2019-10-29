# Set up GOPATH and optionally virtualgo, if go is installed.

if ! hash go 2>/dev/null
  exit
end

mkdir -p ~/.go
set -x GOPATH ~/.go
set -x PATH ~/.go/bin $PATH

if hash vg 2>/dev/null
  set -x VIRTUALGO_DISABLE_PROMPT 1
  vg eval --shell fish | source
end
