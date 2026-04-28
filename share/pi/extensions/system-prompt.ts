/**
 * Provides /dump-system-prompt, which captures the fully serialized system
 * prompt by triggering a turn, intercepting it in `before_provider_request`,
 * aborting the request, and viewing the captured payload in $PAGER.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Capture = {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
};

function extractSystemAndTools(payload: unknown): {
  system: string;
  tools: unknown;
} {
  const p = (payload ?? {}) as Record<string, unknown>;

  let system = "";
  if (typeof p.system === "string") {
    system = p.system;
  } else if (Array.isArray(p.system)) {
    system = p.system
      .map((b) =>
        typeof b === "string" ? b : ((b as { text?: string }).text ?? ""),
      )
      .join("\n\n");
  } else if (Array.isArray(p.messages)) {
    const sys = (
      p.messages as Array<{ role?: string; content?: unknown }>
    ).find((m) => m.role === "system");
    if (sys) {
      system =
        typeof sys.content === "string"
          ? sys.content
          : Array.isArray(sys.content)
            ? sys.content
                .map((c) =>
                  typeof c === "string"
                    ? c
                    : ((c as { text?: string }).text ?? ""),
                )
                .join("\n\n")
            : "";
    }
  }

  return { system, tools: p.tools ?? [] };
}

export default function (pi: ExtensionAPI) {
  let pendingCapture: Capture | undefined;
  let listenerInstalled = false;

  function installListenerOnce() {
    if (listenerInstalled) return;
    listenerInstalled = true;

    pi.on("before_provider_request", (event, ctx) => {
      if (!pendingCapture) return;
      const capture = pendingCapture;
      pendingCapture = undefined;
      capture.resolve(event.payload);
      ctx.abort();
    });
  }

  pi.registerCommand("dump-system-prompt", {
    description:
      "Dump the fully serialized system prompt and open it in $PAGER",
    handler: async (_args, ctx) => {
      installListenerOnce();

      if (pendingCapture) {
        ctx.ui.notify(
          "A previous /dump-system-prompt is still running",
          "warning",
        );
        return;
      }

      await ctx.waitForIdle();

      const payload = await new Promise<unknown>((resolve, reject) => {
        pendingCapture = { resolve, reject };
        try {
          pi.sendUserMessage("hello");
        } catch (err) {
          pendingCapture = undefined;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      const { system, tools } = extractSystemAndTools(payload);
      const rendered = `${system}\n\n## Tools\n\n\`\`\`json\n${JSON.stringify(tools, null, 2)}\n\`\`\`\n`;

      const path = join(tmpdir(), `pi-system-prompt-${Date.now()}.md`);
      writeFileSync(path, rendered);

      const pager = process.env.PAGER || "less";

      await ctx.ui.custom<void>((tui, _theme, _kb, done) => {
        tui.stop();
        process.stdout.write("\x1b[2J\x1b[H");

        spawnSync(pager, [path], {
          stdio: "inherit",
          env: process.env,
          shell: true,
        });

        tui.start();
        tui.requestRender(true);
        done();

        return { render: () => [], invalidate: () => {} };
      });

      ctx.ui.notify(`Provider payload written to ${path}`, "info");
    },
  });
}
