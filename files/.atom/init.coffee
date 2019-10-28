# Your init script
#
# Atom will evaluate this file each time a new window is opened. It is run
# after packages are loaded/activated and after the previous editor state
# has been restored.
#
# An example hack to make opened Markdown files always be soft wrapped:
#
# path = require 'path'
#
# atom.workspaceView.eachEditorView (editorView) ->
#   editor = editorView.getEditor()
#   if path.extname(editor.getPath()) is '.md'
#     editor.setSoftWrap(true)

child_process = require 'child_process'

atom.commands.add 'atom-text-editor', 'custom:refresh-browser', ->
  editor = atom.workspace.getActiveTextEditor()
  editorView = atom.views.getView(editor)
  atom.commands.dispatch(editorView, 'window:save-all')
  script = 'tell application "Google Chrome" to set URL of active tab of its first window to "javascript:void(typeof Jupyter !== \\"undefined\\" ? Jupyter.notebook.execute_all_cells() : location.reload())"'
  child = child_process.spawn("osascript", [ "-e", script ])
  child.on 'error', (err) ->
    console.log 'Failed to start child process.'
