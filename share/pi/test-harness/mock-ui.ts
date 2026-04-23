import type { MockUIConfig, UICallRecord } from "./types.js";

export function createMockUIContext(
  config: MockUIConfig = {},
  uiLog: UICallRecord[],
): any {
  function record(
    method: string,
    args: unknown[],
    returnValue?: unknown,
  ): void {
    uiLog.push({ method, args, returnValue });
  }

  return {
    async select(
      title: string,
      options: string[],
      _opts?: unknown,
    ): Promise<string | undefined> {
      let result: string | undefined;
      const handler = config.select;
      if (handler === undefined || handler === null) {
        result = options[0];
      } else if (typeof handler === "number") {
        result = options[handler];
      } else if (typeof handler === "string") {
        result = options.find((o) => o === handler) ?? options[0];
      } else if (typeof handler === "function") {
        result = handler(title, options);
      }
      record("select", [title, options], result);
      return result;
    },

    async confirm(
      title: string,
      message: string,
      _opts?: unknown,
    ): Promise<boolean> {
      let result: boolean;
      const handler = config.confirm;
      if (handler === undefined || handler === null) {
        result = true;
      } else if (typeof handler === "boolean") {
        result = handler;
      } else if (typeof handler === "function") {
        result = handler(title, message);
      } else {
        result = true;
      }
      record("confirm", [title, message], result);
      return result;
    },

    async input(
      title: string,
      placeholder?: string,
      _opts?: unknown,
    ): Promise<string | undefined> {
      let result: string | undefined;
      const handler = config.input;
      if (handler === undefined || handler === null) {
        result = "";
      } else if (typeof handler === "string") {
        result = handler;
      } else if (typeof handler === "function") {
        result = handler(title, placeholder);
      }
      record("input", [title, placeholder], result);
      return result;
    },

    async editor(title: string, prefill?: string): Promise<string | undefined> {
      let result: string | undefined;
      const handler = config.editor;
      if (handler === undefined || handler === null) {
        result = "";
      } else if (typeof handler === "string") {
        result = handler;
      } else if (typeof handler === "function") {
        result = handler(title, prefill);
      }
      record("editor", [title, prefill], result);
      return result;
    },

    notify(message: string, type?: string): void {
      record("notify", [message, type]);
    },

    onTerminalInput(): () => void {
      return () => {};
    },

    setStatus(key: string, text: string | undefined): void {
      record("setStatus", [key, text]);
    },
    setWorkingMessage(message?: string): void {
      record("setWorkingMessage", [message]);
    },
    setWidget(key: string, content: unknown, _options?: unknown): void {
      record("setWidget", [key, content]);
    },
    setFooter(...args: unknown[]): void {
      record("setFooter", args);
    },
    setHeader(...args: unknown[]): void {
      record("setHeader", args);
    },
    setTitle(title: string): void {
      record("setTitle", [title]);
    },

    async custom<T>(): Promise<T> {
      return undefined as never;
    },

    pasteToEditor(...args: unknown[]): void {
      record("pasteToEditor", args);
    },
    setEditorText(...args: unknown[]): void {
      record("setEditorText", args);
    },
    getEditorText(): string {
      return "";
    },
    setEditorComponent(...args: unknown[]): void {
      record("setEditorComponent", args);
    },

    get theme(): any {
      return {
        fg: (_c: string, t: string) => t,
        bold: (t: string) => t,
        italic: (t: string) => t,
        strikethrough: (t: string) => t,
      };
    },
    getAllThemes(): unknown[] {
      return [];
    },
    getTheme(): unknown {
      return undefined;
    },
    setTheme(): { success: boolean; error?: string } {
      return { success: false, error: "Test mode" };
    },
    getToolsExpanded(): boolean {
      return false;
    },
    setToolsExpanded(): void {},
  };
}
