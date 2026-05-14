import { getFrontMatterInfo, Keymap, MarkdownView, Notice, Plugin, TAbstractFile, TFile, TFolder } from "obsidian";
import type {
  PropertyRenderContext,
  PropertyWidget,
  PropertyWidgetComponentBase,
} from "obsidian-typings";
import { EditorView } from "@codemirror/view";
import { userChangeListenerExtension } from "./editor";

const SIDEBAR_FILE = "Common/Metawiki/Sidebar.md";
const CREATED_FIELD = "created";
const MODIFIED_FIELD = "modified";
const STATUS_FIELD = "status";
const ARCHIVED_VALUE = "archived";
const THROTTLE_MS = 60 * 1000;
const WIDGET_TYPE = "utc-timestamp";
const TITLE_FIELD = "title";
const FAKE_TITLE_ATTR = "data-dotfiles-fake-title";

function nowISO(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 59 * 60_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 12 * 3_600_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (diff < 2 * 86_400_000)
    return `yesterday, ${new Date(ms).toLocaleTimeString(undefined, { timeStyle: "short" })}`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} d ago`;
  return new Date(ms).toLocaleDateString();
}

const utcTimestampWidget: PropertyWidget = {
  type: WIDGET_TYPE,
  icon: "lucide-clock",
  name: () => "UTC Timestamp",
  validate: (value: unknown) =>
    typeof value === "string" && !isNaN(Date.parse(value)),
  render: (
    containerEl: HTMLElement,
    data: unknown,
    _ctx: PropertyRenderContext,
  ): PropertyWidgetComponentBase => {
    if (typeof data === "string" && data) {
      const ms = Date.parse(data);
      if (!isNaN(ms)) {
        const div = containerEl.createDiv({
          cls: "metadata-input-longtext",
          text: formatRelativeTime(ms),
        });
        div.setAttr(
          "title",
          new Date(ms).toLocaleString(undefined, { timeZoneName: "short" }),
        );
      }
    }
    return { type: WIDGET_TYPE, focus: () => {} };
  },
};

export default class DotfilesPlugin extends Plugin {
  private lastUpdateTimes: Record<string, number> = {};
  private renamingPaths = new Set<string>();
  private folderObserver: MutationObserver | null = null;
  private initializedFolderEls = new WeakSet<HTMLElement>();

  async onload() {
    this.registerEditorExtension(userChangeListenerExtension(this));

    this.app.workspace.onLayoutReady(() => this.initFolderClickHandlers());
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.initFolderClickHandlers()),
    );

    this.registerEvent(
      this.app.vault.on("rename", (abstractFile, oldPath) => {
        void this.handleFolderIndexRename(abstractFile, oldPath);
      }),
    );

    this.addRibbonIcon("panel-left-open", "Open sidebar note", () => {
      void this.openSidebarFile();
    });

    this.addCommand({
      id: "open-sidebar-file",
      name: "Open sidebar note",
      callback: () => { void this.openSidebarFile(); },
    });

    this.addCommand({
      id: "expand-note-into-folder",
      name: "Expand note into folder",
      callback: () => { void this.expandNoteIntoFolder(); },
    });

    this.addCommand({
      id: "collapse-note-from-folder",
      name: "Collapse note from folder",
      callback: () => { void this.collapseNoteFromFolder(); },
    });

    this.addCommand({
      id: "create-note-in-same-folder",
      name: "Create new note in same folder",
      callback: () => { void this.createNoteInSameFolder(); },
    });

    this.addCommand({
      id: "toggle-archived",
      name: "Toggle archived status",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return;
        void this.app.fileManager.processFrontMatter(
          file,
          (frontmatter: Record<string, unknown>) => {
            if (frontmatter[STATUS_FIELD] === ARCHIVED_VALUE) {
              delete frontmatter[STATUS_FIELD];
            } else {
              frontmatter[STATUS_FIELD] = ARCHIVED_VALUE;
            }
          },
        );
      },
    });

    this.registerEvent(
      this.app.vault.on("create", (abstractFile) => {
        if (!(abstractFile instanceof TFile) || abstractFile.extension !== "md")
          return;
        void this.app.fileManager.processFrontMatter(
          abstractFile,
          (frontmatter: Record<string, unknown>) => {
            const now = nowISO();
            if (!frontmatter[CREATED_FIELD]) frontmatter[CREATED_FIELD] = now;
            if (!frontmatter[MODIFIED_FIELD]) frontmatter[MODIFIED_FIELD] = now;
          },
        );
      }),
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.refreshInlineTitleForFile(file.path);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.refreshAllInlineTitles();
      }),
    );

    const mtm = this.app.metadataTypeManager;
    mtm.registeredTypeWidgets[WIDGET_TYPE] = utcTimestampWidget;
    await mtm.setType(CREATED_FIELD, WIDGET_TYPE);
    await mtm.setType(MODIFIED_FIELD, WIDGET_TYPE);

    this.refreshAllInlineTitles();
  }

  private async openSidebarFile(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(SIDEBAR_FILE);
    if (!(file instanceof TFile)) {
      new Notice(`Sidebar file not found: ${SIDEBAR_FILE}`);
      return;
    }

    const existing = this.app.workspace.getLeavesOfType("markdown").find(
      (leaf) => (leaf.view as MarkdownView).file?.path === SIDEBAR_FILE &&
        (leaf.getRoot() as unknown) === this.app.workspace.leftSplit,
    );

    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }

    const leaf = this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.openFile(file, { state: { mode: "preview" } });
    leaf.setPinned(true);
    await this.app.workspace.revealLeaf(leaf);
  }

  private initFolderClickHandlers(): void {
    document
      .querySelectorAll<HTMLElement>(".nav-folder-title-content")
      .forEach((el) => this.setupFolderTitleEl(el));

    if (this.folderObserver) return;
    this.folderObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(".nav-folder-title-content")) {
            this.setupFolderTitleEl(node);
          }
          node
            .querySelectorAll<HTMLElement>(".nav-folder-title-content")
            .forEach((el) => this.setupFolderTitleEl(el));
        });
      });
    });
    this.folderObserver.observe(document.body, { childList: true, subtree: true });
  }

  private setupFolderTitleEl(el: HTMLElement): void {
    if (this.initializedFolderEls.has(el)) return;
    this.initializedFolderEls.add(el);

    this.registerDomEvent(el, "click", (e: MouseEvent) => {
      const folderEl = el.closest(".nav-folder-title");
      if (!folderEl) return;
      const folderPath = folderEl.getAttribute("data-path");
      if (!folderPath) return;

      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) return;

      const indexFile = folder.children.find(
        (f): f is TFile => f instanceof TFile && f.basename === folder.name,
      );
      if (!indexFile) return;

      e.stopImmediatePropagation();
      e.preventDefault();

      const leaf = this.app.workspace.getLeaf(Keymap.isModEvent(e) || false);
      void leaf.openFile(indexFile);
    });
  }

  onunload() {
    this.folderObserver?.disconnect();
    this.folderObserver = null;

    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      this.setFakeTitle(view, null);
    });

    const mtm = this.app.metadataTypeManager;
    delete mtm.registeredTypeWidgets[WIDGET_TYPE];
    void mtm.unsetType(CREATED_FIELD);
    void mtm.unsetType(MODIFIED_FIELD);
  }

  private refreshAllInlineTitles(): void {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      const title = this.getFrontmatterTitle(view);
      this.setFakeTitle(view, title);
    });
  }

  private refreshInlineTitleForFile(path: string): void {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view as MarkdownView;
      if (view.file?.path !== path) return;
      const title = this.getFrontmatterTitle(view);
      this.setFakeTitle(view, title);
    });
  }

  private getFrontmatterTitle(view: MarkdownView): string | null {
    if (!view.file) return null;
    const fm = this.app.metadataCache.getCache(view.file.path)?.frontmatter;
    const value: unknown = fm?.[TITLE_FIELD];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private setFakeTitle(view: MarkdownView, title: string | null): void {
    const original = view.inlineTitleEl;
    if (!original) return;

    const existing = original.parentElement?.querySelector<HTMLElement>(
      `[${FAKE_TITLE_ATTR}]`,
    );

    if (!title) {
      existing?.remove();
      original.hidden = false;
      return;
    }

    if (existing) {
      existing.setText(title);
      return;
    }

    const fake = original.parentElement!.createEl(original.tagName as "div", {
      cls: original.className,
      attr: { [FAKE_TITLE_ATTR]: "", tabindex: "0" },
    });
    fake.setText(title);
    original.parentElement!.insertBefore(fake, original);

    // Hide original unless it's currently focused (user may be mid-rename)
    if (!original.isActiveElement()) {
      original.hidden = true;
    } else {
      fake.hidden = true;
    }

    fake.addEventListener("click", () =>
      this.showOriginalTitle(fake, original),
    );
    fake.addEventListener("focus", () =>
      this.showOriginalTitle(fake, original),
    );
    original.addEventListener("blur", () => {
      if (!title) return;
      original.hidden = true;
      fake.hidden = false;
    });
  }

  private showOriginalTitle(fake: HTMLElement, original: HTMLElement): void {
    fake.hidden = true;
    original.hidden = false;
    original.focus();
  }

  private async createNoteInSameFolder(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const folder = activeFile?.parent ?? this.app.vault.getRoot();
    const folderPath = folder.isRoot() ? "" : folder.path;

    let name = "Untitled";
    let filePath = folderPath ? `${folderPath}/${name}.md` : `${name}.md`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(filePath)) {
      name = `Untitled ${counter}`;
      filePath = folderPath ? `${folderPath}/${name}.md` : `${name}.md`;
      counter++;
    }

    const file = await this.app.vault.create(filePath, "");
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { state: { mode: "source" } });
  }

  private async expandNoteIntoFolder(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return;

    const parentPath = file.parent?.path ?? "";
    const folderPath = parentPath ? `${parentPath}/${file.basename}` : file.basename;
    const newFilePath = `${folderPath}/${file.basename}.md`;

    if (this.app.vault.getAbstractFileByPath(folderPath)) {
      new Notice(`Cannot expand: "${folderPath}" already exists`);
      return;
    }

    await this.app.vault.createFolder(folderPath);
    await this.app.fileManager.renameFile(file, newFilePath);
  }

  private async collapseNoteFromFolder(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return;

    const folder = file.parent;
    if (!folder || file.basename !== folder.name) {
      new Notice("Cannot collapse: note is not a folder index file");
      return;
    }

    if (folder.children.length !== 1) {
      new Notice("Cannot collapse: folder is not empty");
      return;
    }

    const grandparentPath = folder.parent?.path ?? "";
    const newFilePath = grandparentPath
      ? `${grandparentPath}/${file.basename}.md`
      : `${file.basename}.md`;

    if (this.app.vault.getAbstractFileByPath(newFilePath)) {
      new Notice(`Cannot collapse: "${newFilePath}" already exists`);
      return;
    }

    await this.app.fileManager.renameFile(file, newFilePath);
    await this.app.vault.delete(folder);
  }

  private async handleFolderIndexRename(
    abstractFile: TAbstractFile,
    oldPath: string,
  ): Promise<void> {
    const newPath = abstractFile.path;

    if (this.renamingPaths.has(newPath)) {
      this.renamingPaths.delete(newPath);
      return;
    }

    if (abstractFile instanceof TFile && abstractFile.extension === "md") {
      const oldParent = oldPath.substring(0, oldPath.lastIndexOf("/"));
      const newParent = abstractFile.parent?.path ?? "";
      if (oldParent !== newParent) return;

      const oldBasename = oldPath
        .substring(oldPath.lastIndexOf("/") + 1)
        .replace(/\.md$/, "");
      const folderBasename = oldParent.substring(oldParent.lastIndexOf("/") + 1);
      if (oldBasename !== folderBasename) return;

      const grandparent = oldParent.includes("/")
        ? oldParent.substring(0, oldParent.lastIndexOf("/"))
        : "";
      const newFolderPath = grandparent
        ? `${grandparent}/${abstractFile.basename}`
        : abstractFile.basename;

      if (this.app.vault.getAbstractFileByPath(newFolderPath)) {
        new Notice(`Cannot rename folder: "${newFolderPath}" already exists`);
        return;
      }

      const folder = this.app.vault.getAbstractFileByPath(oldParent);
      if (!(folder instanceof TFolder)) return;

      this.renamingPaths.add(newFolderPath);
      await this.app.fileManager.renameFile(folder, newFolderPath);
    } else if (abstractFile instanceof TFolder) {
      const oldFolderBasename = oldPath.substring(oldPath.lastIndexOf("/") + 1);
      const indexFile = abstractFile.children.find(
        (f): f is TFile =>
          f instanceof TFile && f.basename === oldFolderBasename,
      );
      if (!indexFile) return;

      const newFilePath = `${newPath}/${abstractFile.name}.md`;
      if (this.app.vault.getAbstractFileByPath(newFilePath)) {
        new Notice(`Cannot rename index file: "${newFilePath}" already exists`);
        return;
      }

      this.renamingPaths.add(newFilePath);
      await this.app.fileManager.renameFile(indexFile, newFilePath);
    }
  }

  updateModified(_view: EditorView, file: TFile): void {
    const now = Date.now();
    const lastUpdate = this.lastUpdateTimes[file.path] ?? 0;
    if (now - lastUpdate < THROTTLE_MS) return;

    this.lastUpdateTimes[file.path] = now;

    // Dispatch must be deferred — calling view.dispatch() inside ViewPlugin.update() is forbidden.
    // Re-read doc state at dispatch time so offsets are correct if the user typed in the interim.
    // Always use the main MarkdownView's CM instance, not the passed view — the passed view may be
    // a table cell sub-editor with an isolated document rather than the full file.
    activeWindow.setTimeout(() => {
      const mainView =
        this.app.workspace.getActiveViewOfType(MarkdownView)?.editMode.cm;
      if (!mainView) return;
      const doc = mainView.state.doc.toString();
      const fmInfo = getFrontMatterInfo(doc);
      const newLine = `${MODIFIED_FIELD}: ${nowISO()}`;

      if (!fmInfo.exists) {
        mainView.dispatch({
          changes: { from: 0, to: 0, insert: `---\n${newLine}\n---\n` },
        });
        return;
      }

      const match = /^modified:.*$/m.exec(fmInfo.frontmatter);
      if (match?.index !== undefined) {
        const start = fmInfo.from + match.index;
        mainView.dispatch({
          changes: {
            from: start,
            to: start + match[0].length,
            insert: newLine,
          },
        });
      } else {
        mainView.dispatch({
          changes: { from: fmInfo.to, to: fmInfo.to, insert: `${newLine}\n` },
        });
      }
    }, 0);
  }
}
