#set -x PATH ./node_modules/.bin $PATH
set -x PATH /usr/local/sbin /usr/local/bin $PATH
if [ -d /Applications/MacVim.app/Contents/bin/ ]
  set -x PATH /Applications/MacVim.app/Contents/bin/ $PATH
end
if [ -d /opt/pkg/bin ]
  set -x PATH /opt/pkg/bin $PATH
end
if [ -d /usr/local/opt/sqlite/bin ]
  set -x PATH /usr/local/opt/sqlite/bin $PATH
end
if [ -d ~/.cargo/bin ]
  set -x PATH ~/.cargo/bin $PATH
end
if [ -d ~/.local/bin ]
  set -x PATH ~/.local/bin $PATH
end
