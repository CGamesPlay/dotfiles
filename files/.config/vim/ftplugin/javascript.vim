" CommonJS modules omit the .js, so this allows gf to work
setlocal suffixesadd+=.js,.jsx
let b:prettier_ft_default_args = {
  \ 'parser': 'babel',
  \ }
call PrettierAutoenable()
