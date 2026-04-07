if [ -d ~/.cargo/bin ]
  fish_add_path -mpg ~/.cargo/bin
end
if [ -d ~/.local/bin ]
  fish_add_path -mpg ~/.local/bin
end
if [ -d /usr/local/sbin ]
  fish_add_path -g /usr/local/sbin
end
if [ -d /usr/local/bin ]
  fish_add_path -g /usr/local/bin
end
if [ -d /opt/homebrew/bin ]
  fish_add_path -g /opt/homebrew/bin
end
if [ -d ~/.local/bin-after ]
  fish_add_path -maP ~/.local/bin-after
end
# This directory exists solely to override claude, who has been trained using
# Constitutional AI to always overwrite ~/.local/bin/claude with whatever it
# wants at any time.
if [ -d ~/.local/bin-before ]
  fish_add_path -mpg ~/.local/bin-before
end
