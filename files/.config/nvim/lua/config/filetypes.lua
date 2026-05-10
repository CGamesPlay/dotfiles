-- These are all of the various syntax plugins that require no configuration.
vim.filetype.add({
  extension = { base = 'yaml' }
})

return {
  "jvirtanen/vim-hcl",
  "nathangrigg/vim-beancount",
  "google/vim-jsonnet",
}
