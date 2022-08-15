# Welcome to my dotfiles

Feel free to use anything here. This repository is designed to be managed with [dfm](https://github.com/CGamesPlay/dfm).

```
# Install on a new machine
./bootstrap.sh
# Add a new config file to the repo
dfm add ~/.config/fish/functions/cool.fish
git add files/.config/fish/functions/cool.fish
git commit -m "Added cool function"
git push
# Update config on other machines
git pull
dfm link
```

