if [ -d /usr/local/share/nvm ]
    set -x NVM_DIR /usr/local/share/nvm
else
    # Migration
    if [ -d ~/.config/nvm ]
        mkdir -p ~/.local/share
        mv ~/.config/nvm ~/.local/share/nvm
    end
    set -x NVM_DIR ~/.local/share/nvm
end
