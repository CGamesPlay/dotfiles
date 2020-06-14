# ~/.config/vim

This is where all of my vim configuration lives. This entire directory is added to the `runtimepath`, which means that these things will happen:

- `plugins/**/*.vim` will be loaded immediately after the `vimrc` has finished.
- `ftplugin/{filetype}.vim` will be loaded each time a buffer is set to `{filetype}`.

See [here](https://learnvimscriptthehardway.stevelosh.com/chapters/42.html) for more information about the folder structure.

I've organized the files in `plugins` like this:

- `basic.vim` sets all of the common vim options, including GUI options and defaults for editing files.
- `commands.vim` defines my custom user commands.
- `mappings.vim` sets up all of my mappings, including remaps of vim built-in functions and custom mappings for plugins.
