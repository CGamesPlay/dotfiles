# Set up virtualenv, if installed.

if begin; command -qs python; and python -c 'import pkgutil; exit(0 if pkgutil.find_loader("virtualfish") else 1)'; end
  python -m virtualfish auto_activation 2>/dev/null | source
end
