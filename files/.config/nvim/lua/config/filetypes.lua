local augroup = vim.api.nvim_create_augroup("config.filetypes", { clear = true })

vim.api.nvim_create_autocmd('FileType', {
  desc = "Use treesitter when available",
  group = augroup,
  callback = function(ev)
    local lang = vim.treesitter.language.get_lang(vim.bo[ev.buf].filetype)
    if lang and vim.treesitter.language.add(lang) then
      vim.treesitter.start(ev.buf, lang)
      vim.b[ev.buf].undo_ftplugin = (vim.b[ev.buf].undo_ftplugin or '') .. '\n call v:lua.vim.treesitter.stop()'
      vim.wo.foldmethod = 'expr'
      vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'
    end
  end,
})

-- These are my custom filetype definitions
vim.filetype.add({
  extension = {
    base = 'yaml' -- obsidian base
  }
})

-- These are the mappings between ftdetect and the tree sitter parser.
local filetypes = {
  angular = { 'htmlangular' },
  bash = { 'sh' },
  bibtex = { 'bib' },
  c_sharp = { 'cs', 'csharp' },
  commonlisp = { 'lisp' },
  cooklang = { 'cook' },
  devicetree = { 'dts' },
  diff = { 'gitdiff' },
  eex = { 'eelixir' },
  elixir = { 'ex' },
  embedded_template = { 'eruby' },
  erlang = { 'erl' },
  facility = { 'fsd' },
  faust = { 'dsp' },
  gdshader = { 'gdshaderinc' },
  git_config = { 'gitconfig' },
  git_rebase = { 'gitrebase' },
  glimmer = { 'handlebars', 'html.handlebars' },
  godot_resource = { 'gdresource' },
  haskell = { 'hs' },
  haskell_persistent = { 'haskellpersistent' },
  idris = { 'idris2' },
  ini = { 'confini', 'dosini' },
  janet_simple = { 'janet' },
  javascript = { 'javascriptreact', 'ecma', 'ecmascript', 'jsx', 'js' },
  json = { 'jsonc' },
  glimmer_javascript = { 'javascript.glimmer' },
  latex = { 'tex' },
  linkerscript = { 'ld' },
  m68k = { 'asm68k' },
  make = { 'automake' },
  markdown = { 'pandoc' },
  muttrc = { 'neomuttrc' },
  ocaml_interface = { 'ocamlinterface' },
  perl = { 'pl' },
  poe_filter = { 'poefilter' },
  powershell = { 'ps1' },
  properties = { 'jproperties' },
  python = { 'py', 'gyp' },
  qmljs = { 'qml' },
  runescript = { 'clientscript' },
  scala = { 'sbt' },
  slang = { 'shaderslang' },
  sqp = { 'mysqp' },
  ssh_config = { 'sshconfig' },
  starlark = { 'bzl' },
  surface = { 'sface' },
  systemverilog = { 'verilog' },
  t32 = { 'trace32' },
  tcl = { 'expect' },
  terraform = { 'terraform-vars' },
  textproto = { 'pbtxt' },
  tlaplus = { 'tla' },
  tsx = { 'typescriptreact', 'typescript.tsx' },
  typescript = { 'ts' },
  glimmer_typescript = { 'typescript.glimmer' },
  typst = { 'typ' },
  udev = { 'udevrules' },
  uxntal = { 'tal', 'uxn' },
  v = { 'vlang' },
  vhs = { 'tape' },
  xml = { 'xsd', 'xslt', 'svg' },
  xresources = { 'xdefaults' },
}

for lang, ft in pairs(filetypes) do
  vim.treesitter.language.register(lang, ft)
end

-- These are all of the various syntax plugins that require no configuration.
return {
  "jvirtanen/vim-hcl",
  "nathangrigg/vim-beancount",
  "google/vim-jsonnet",
}
