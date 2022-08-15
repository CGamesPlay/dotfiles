#!/bin/sh

if [ -z "$GITPOD_INSTANCE_ID" ]; then
    exit 0
fi

sudo add-apt-repository -y ppa:jonathonf/vim
sudo apt-get update
sudo apt-get install -y tmux vim

cat <<'EOF' > ~/start
#!/bin/sh
cd $GITPOD_REPO_ROOT
tmux attach || tmux new-session 'tmux set-option -g status off; exec vim'
EOF
chmod +x ~/start

# Save fish history between workspace starts
touch /workspace/.fish_history
ln -sf /workspace/.fish_history ~/.local/share/fish/fish_history
