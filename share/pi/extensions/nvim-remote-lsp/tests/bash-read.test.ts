import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { extractBashReadPath } from "../bash-read.js";

const HOME = os.homedir();
const CWD = "/base/cwd";

const cases: Array<[command: string, expected: string | null]> = [
  // cat
  ["cat /tmp/foo.ts", "/tmp/foo.ts"],
  ["cat ~/Projects/foo.ts", path.join(HOME, "Projects/foo.ts")],
  ["cat relative/file.ts", "/base/cwd/relative/file.ts"],
  ["cat foo.ts | grep x", null],
  ["cat foo.ts && echo done", null],
  ["cat foo.ts bar.ts", null],
  // head
  ["head /tmp/foo.ts", "/tmp/foo.ts"],
  ["head -45 /tmp/foo.ts", "/tmp/foo.ts"],
  ["head -n 45 /tmp/foo.ts", "/tmp/foo.ts"],
  ["head -n 10 -v /tmp/foo.ts", null],
  // sed
  ["sed -n '1p' /tmp/foo.ts", "/tmp/foo.ts"],
  ["sed -n '1,80p' /tmp/foo.ts", "/tmp/foo.ts"],
  ['sed -n "1,80p" /tmp/foo.ts', "/tmp/foo.ts"],
  ["sed 's/a/b/' /tmp/foo.ts", null],
  ["sed -n 's/a/b/p' /tmp/foo.ts", null],
  // cd prefix
  [
    "cd /Users/rpatterson/Projects/dotfiles-dev/share/pi && head -45 extensions/presets/tools/subagent.ts",
    "/Users/rpatterson/Projects/dotfiles-dev/share/pi/extensions/presets/tools/subagent.ts",
  ],
  ["cd /some/dir; cat file.ts", "/some/dir/file.ts"],
  ["cd subdir && cat file.ts", "/base/cwd/subdir/file.ts"],
  ["cd /some/dir && cat ~/global.ts", path.join(HOME, "global.ts")],
  // unrecognized
  ["grep -r foo /tmp", null],
  ["ls /tmp", null],
  ["", null],
];

describe("extractBashReadPath", () => {
  for (const [command, expected] of cases) {
    it(`${JSON.stringify(command)} → ${expected ?? "null"}`, () => {
      assert.equal(extractBashReadPath(command, CWD), expected);
    });
  }
});
