if [ -d /usr/local/share/nvm ]
    set -x NVM_DIR /usr/local/share/nvm
else
    set -x NVM_DIR ~/.config/nvm
end
