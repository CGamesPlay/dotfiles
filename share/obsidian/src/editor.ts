// Typing-events approach from https://github.com/alangrainger/obsidian-frontmatter-modified-date/pull/60

import {
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { editorInfoField, TFile } from "obsidian";
import DotfilesPlugin from "main";

/**
 * `UserChangeListener` wrapper, registered via `plugin.registerEditorExtension()`.
 * Only fires on explicit user typing/deletion, ignoring programmatic or external changes.
 */
export const userChangeListenerExtension = (plugin: DotfilesPlugin) =>
  ViewPlugin.define((view) => {
    return new UserChangeListener(plugin, view);
  });

class UserChangeListener implements PluginValue {
  plugin: DotfilesPlugin;
  file: TFile | null;

  constructor(plugin: DotfilesPlugin, view: EditorView) {
    this.plugin = plugin;
    this.file = view.state.field(editorInfoField).file;
  }

  update(update: ViewUpdate) {
    if (!this.file) return;
    if (isUserChange(update)) {
      this.plugin.updateModified(update.view, this.file);
    }
  }
}

function isUserChange(update: ViewUpdate): boolean {
  // Ignore non-changes and note-switching ('set' events)
  if (
    !update.docChanged ||
    update.transactions.some((tr) => tr.isUserEvent("set"))
  ) {
    return false;
  }
  return update.transactions.some((tr) => {
    return (
      tr.isUserEvent("input") ||
      tr.isUserEvent("delete") ||
      tr.isUserEvent("move")
    );
  });
}
