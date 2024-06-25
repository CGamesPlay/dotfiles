if [ -d /usr/local/sbin ]
  fish_add_path -g /usr/local/sbin
end
if [ -d /usr/local/bin ]
  fish_add_path -g /usr/local/bin
end
if [ -d /Applications/MacVim.app/Contents/bin/ ]
  fish_add_path -g /Applications/MacVim.app/Contents/bin/
end
if [ -d /Applications/MacVim.app/Contents/bin/ ]
  fish_add_path -g /Applications/MacVim.app/Contents/bin/
end
if [ -d /opt/homebrew/bin ]
  fish_add_path -g /opt/homebrew/bin
end
if [ -d ~/.cargo/bin ]
  fish_add_path -g ~/.cargo/bin
end
if [ -d ~/.local/bin ]
  fish_add_path -g ~/.local/bin
end
if [ -d ~/.local/bin-after ]
  fish_add_path -maP ~/.local/bin-after
end
