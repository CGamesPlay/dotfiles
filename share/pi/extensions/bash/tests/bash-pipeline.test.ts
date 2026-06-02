import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  shouldBail,
  splitPipeline,
  tokenizeArgs,
  classifySegment,
  injectTee,
  formatSize,
  type Token,
} from "../lib/bash-pipeline.js";

/** Extract just the string values from tokens for simpler assertions */
function values(tokens: Token[]): string[] {
  return tokens.map((t) => t.value);
}

describe("shouldBail", () => {
  const cases: [string, string, boolean][] = [
    ["newlines", "cmd1\ncmd2", true],
    ["backticks", "echo `date`", true],
    ["$(", "echo $(date)", true],
    ["${", 'echo "${HOME}"', true],
    ["<(", "diff <(cmd1) <(cmd2)", true],
    [">(", "cmd >(tee log.txt)", true],
    ["<<", "cat <<EOF", true],
    ["simple command", "echo hello", false],
    ["pipe", "cmd | grep foo", false],
  ];
  for (const [label, input, expected] of cases) {
    it(label, () => assert.strictEqual(shouldBail(input), expected));
  }
});

describe("splitPipeline", () => {
  const bailCases: Record<string, string> = {
    "no pipes": "echo hello",
    "||": "cmd | grep foo || echo nope",
    "&& after pipe": "cmd | grep foo && echo yes",
    "; after pipe": "cmd | grep foo ; echo done",
    parentheses: "(cmd1; cmd2) | grep foo",
    "unmatched single quote": "cmd | grep 'unclosed",
    "unmatched double quote": 'cmd | grep "unclosed',
    '\\" inside double quotes': 'grep "say \\"hello\\"" | tail -3',
    "\\\\\\\\ inside double quotes": 'echo "path\\\\to" | grep foo',
  };
  for (const [label, input] of Object.entries(bailCases)) {
    it(`bails: ${label}`, () => assert.strictEqual(splitPipeline(input), null));
  }

  const splitCases: Record<string, [string, string[]]> = {
    "simple pipe": ["cmd | grep foo", ["cmd", "grep foo"]],
    "multiple pipes": [
      "cmd | grep foo | tail -5",
      ["cmd", "grep foo", "tail -5"],
    ],
    "&& before first pipe": [
      "cd foo && cmd | grep bar",
      ["cd foo && cmd", "grep bar"],
    ],
    "; before first pipe": [
      "cd foo; cmd | grep bar",
      ["cd foo; cmd", "grep bar"],
    ],
    "|& stderr redirect": ["cmd |& grep foo", ["cmd", "grep foo"]],
    "quoted pipes": ["grep 'a|b' | tail -3", ["grep 'a|b'", "tail -3"]],
    "double-quoted pipes": ['grep "a|b" | tail -3', ['grep "a|b"', "tail -3"]],
    "escaped pipe": ["echo a\\|b | grep a", ["echo a\\|b", "grep a"]],
    "' inside double quotes": [
      `grep "it's a test" | tail -3`,
      [`grep "it's a test"`, "tail -3"],
    ],
    '" inside single quotes': [
      `grep 'say "hello"' | tail -3`,
      [`grep 'say "hello"'`, "tail -3"],
    ],
  };
  for (const [label, [input, expectedTexts]] of Object.entries(splitCases)) {
    it(label, () => {
      const result = splitPipeline(input);
      assert.ok(result);
      assert.deepStrictEqual(
        result.map((s) => s.text),
        expectedTexts,
      );
    });
  }
});

describe("tokenizeArgs", () => {
  const cases: Record<string, [string, string[], boolean[]?]> = {
    "simple tokens": ["grep -i foo", ["grep", "-i", "foo"]],
    "single-quoted argument": [
      "grep 'hello world'",
      ["grep", "hello world"],
      [false, true],
    ],
    "double-quoted argument": [
      'grep "hello world"',
      ["grep", "hello world"],
      [false, true],
    ],
    "escaped spaces": [
      "grep hello\\ world",
      ["grep", "hello world"],
      [false, true],
    ],
    "empty input": ["", []],
    "leading/trailing ws": ["  grep  foo  ", ["grep", "foo"]],
  };
  for (const [label, [input, expected, quoted]] of Object.entries(cases)) {
    it(label, () => {
      const tokens = tokenizeArgs(input);
      assert.deepStrictEqual(values(tokens), expected);
      if (quoted) {
        assert.deepStrictEqual(
          tokens.map((t) => t.quoted),
          quoted,
        );
      }
    });
  }
});

describe("classifySegment", () => {
  const cases: Record<string, [string, "mutatable" | "abort" | "other"]> = {
    // grep — mutatable
    "grep with pattern": ["grep foo", "mutatable"],
    "grep -E with pattern": ["grep -E 'pattern'", "mutatable"],
    "grep -viE with pattern": ["grep -viE 'pattern'", "mutatable"],
    "grep with -A -B flags": ['grep -A 5 -B 2 "pattern"', "mutatable"],
    "grep with filename arg": ["grep -r pattern dir/", "other"],
    "grep with -r flag": ["grep -r pattern", "other"],
    // tail — mutatable
    "tail -5": ["tail -5", "mutatable"],
    "tail -n 20": ["tail -n 20", "mutatable"],
    "tail -n +5": ["tail -n +5", "mutatable"],
    "tail --lines=20": ["tail --lines=20", "mutatable"],
    "tail -f": ["tail -f", "other"],
    "tail with filename": ["tail -5 file.log", "other"],
    // abort
    tee: ["tee output.log", "abort"],
    // head — mutatable (stdin source, acts as eager truncation)
    "head -5": ["head -5", "mutatable"],
    "head -n 20": ["head -n 20", "mutatable"],
    "head -c 1024": ["head -c 1024", "mutatable"],
    "head --lines=10": ["head --lines=10", "mutatable"],
    "head --bytes=512": ["head --bytes=512", "mutatable"],
    "head with filename": ["head -5 file.log", "other"],
    "head with -q flag": ["head -q -5", "other"],
    "> redirect": ["grep foo > out.txt", "abort"],
    ">> redirect": ["grep foo >> out.txt", "abort"],
    "> inside quotes": ["grep '>'", "mutatable"],
    "2>&1 fd duplication": ["cmd 2>&1", "other"],
    ">&2 fd duplication": ["cmd >&2", "other"],
    // other
    sort: ["sort -r", "other"],
    wc: ["wc -l", "other"],
    sed: ["sed 's/foo/bar/'", "other"],
    awk: ["awk '{print $1}'", "other"],
    uniq: ["uniq", "other"],
  };
  for (const [label, [input, expected]] of Object.entries(cases)) {
    it(label, () => assert.strictEqual(classifySegment(input), expected));
  }
});

/** Helper: check that tee was injected and extract the tee path */
function assertTeeInjected(input: string, expectedPattern: RegExp): string {
  const result = injectTee(input);
  assert.ok(result, `Expected tee injection for: ${input}`);
  assert.match(result.modified, expectedPattern);
  assert.ok(result.teePath.includes("pi-bash-tee-"));
  return result.teePath;
}

function assertNotModified(input: string): void {
  const result = injectTee(input);
  assert.strictEqual(result, null, `Expected no modification for: ${input}`);
}

describe("injectTee", () => {
  // Test case 1: grep+tail mutatable
  it("case 1: terraform | grep | tail → injects tee before grep", () => {
    assertTeeInjected(
      "terraform apply -auto-approve -no-color 2>&1 | grep -E '(Plan:|Apply|Error|created|destroyed|changed)' | tail -5",
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 2: && before first pipe + tail
  it("case 2: cd && terraform | tail → injects tee before tail", () => {
    assertTeeInjected(
      "cd tf/k8s && terraform apply -auto-approve -target=kubectl_manifest.registry 2>&1 | tail -10",
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| tail/,
    );
  });

  // Test case 3: prefix && + grep + tail
  it("case 3: cd && cargo test | grep | tail → injects tee before grep", () => {
    assertTeeInjected(
      'cd /path && cargo test -p jj-cli --test runner 2>&1 | grep -E "test result:|FAILED" | tail -3',
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 4: tee already present → abort
  it("case 4: existing tee → not modified", () => {
    assertNotModified(
      "terraform apply -auto-approve -no-color 2>&1 | tee /tmp/tf-k8s-apply.log | tail -50",
    );
  });

  // Test case 5: head → mutatable, tee injected before grep
  it("case 5: head in pipeline → injects tee", () => {
    assertTeeInjected(
      "marimo tutorial fileformat 2>&1 | grep -v '^\\[' | head -5",
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  it("curl | head → injects tee (eager truncation)", () => {
    assertTeeInjected(
      "curl -fsSL https://raw.githubusercontent.com/systemd/systemd/refs/heads/main/docs/CONTAINER_INTERFACE.md 2>&1 | head -300",
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| head/,
    );
  });

  // Test case 6: $() → bail in step 1
  it("case 6: $() command substitution → not modified", () => {
    assertNotModified(
      'grep -r "fn handshake" $(find . -path "*/nvim-rs*" -name "*.rs" 2>/dev/null | head -20) 2>/dev/null | head -5',
    );
  });

  // Test case 7: no pipes
  it("case 7: no pipes → not modified", () => {
    assertNotModified("echo hello");
  });

  // Test case 8: sort | uniq (both "other")
  it("case 8: cmd | sort | uniq → not modified (no mutatable)", () => {
    assertNotModified("cmd | sort -r | uniq");
  });

  // Test case 9: || bail
  it("case 9: || → not modified", () => {
    assertNotModified('cmd | grep foo || echo "not found"');
  });

  // Test case 10: quoted pattern in grep
  it("case 10: grep with quoted pattern → injects tee", () => {
    assertTeeInjected(
      "cmd | grep 'hello world' | tail -3",
      /cmd \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 11: grep with -A -B flags
  it("case 11: grep -A 5 -B 2 | tail → injects tee", () => {
    assertTeeInjected(
      'cmd | grep -A 5 -B 2 "pattern" | tail -10',
      /cmd \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 12: wc is "other"
  it("case 12: cmd | wc -l → not modified", () => {
    assertNotModified("cmd | wc -l");
  });

  // Test case 13: tee in pipeline → abort
  it("case 13: grep | tee → not modified", () => {
    assertNotModified("cmd | grep foo | tee log.txt");
  });

  // Test case 14: ; after first pipe → bail
  it("case 14: ; after pipe → not modified", () => {
    assertNotModified("cmd1 | cmd2 ; cmd3 | grep foo");
  });

  // Test case 15: tail -n 20
  it("case 15: tail -n 20 → injects tee", () => {
    assertTeeInjected(
      "long-cmd 2>&1 | tail -n 20",
      /2>&1 \| tee \/.*pi-bash-tee-.*\.log \| tail/,
    );
  });

  // Test case 16: grep with filename arg → other
  it("case 16: grep -r pattern dir/ → not modified", () => {
    assertNotModified("cmd | grep -r pattern dir/");
  });

  // Test case 17: single quote inside double quotes
  it("case 17: grep with single quote inside double quotes → injects tee", () => {
    assertTeeInjected(
      `cmd | grep "it's a test" | tail -3`,
      /cmd \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 18: double quote inside single quotes
  it("case 18: grep with double quote inside single quotes → injects tee", () => {
    assertTeeInjected(
      `cmd | grep 'say "hello"' | tail -3`,
      /cmd \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Test case 19: \" inside double quotes → bail
  it('case 19: \\" inside double quotes → not modified', () => {
    assertNotModified('cmd | grep "say \\"hello\\"" | tail -3');
  });

  // Test case 20: \\\\ inside double quotes → bail
  it("case 20: \\\\\\\\ inside double quotes → not modified", () => {
    assertNotModified('echo "path\\\\to" | grep foo');
  });

  // Additional: all segments mutatable — first segment is free source → not modified
  it("grep | tail → not modified (grep at pos 0 is free source)", () => {
    assertNotModified("grep -i foo | tail -5");
  });

  // Free source: cat with filename
  it("cat file | tail → not modified", () => {
    assertNotModified(
      "cat /Users/rpatterson/Projects/dotfiles-dev/share/pi/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js | tail -80",
    );
  });

  it("cat -n file | grep → not modified", () => {
    assertNotModified("cat -n /var/log/syslog | grep ERROR");
  });

  it("cat no args | tail → injects tee (stdin source)", () => {
    assertTeeInjected(
      "cat | tail -5",
      /cat \| tee \/.*pi-bash-tee-.*\.log \| tail/,
    );
  });

  // Free source: grep/egrep/fgrep with file
  it("grep file | tail → not modified", () => {
    assertNotModified("grep foo /var/log/syslog | tail -20");
  });

  it("egrep file | tail → not modified", () => {
    assertNotModified("egrep 'pat' file.txt | tail -5");
  });

  it("fgrep file | tail → not modified", () => {
    assertNotModified("fgrep 'pat' file.txt | tail -5");
  });

  // Free source: tail with filename (but not -f/--follow)
  it("tail file | grep → not modified", () => {
    assertNotModified("tail /var/log/syslog | grep ERROR");
  });

  it("tail -5 file | grep → not modified", () => {
    assertNotModified("tail -5 /var/log/syslog | grep ERROR");
  });

  it("tail -f file | grep → injects tee (streaming)", () => {
    assertTeeInjected(
      "tail -f /var/log/syslog | grep ERROR",
      /syslog \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });

  // Compound source with && — conservative: not treated as free source
  it("cd && cat file | tail → injects tee (compound source not analyzed)", () => {
    assertTeeInjected(
      "cd /path && cat file | tail -5",
      /cat file \| tee \/.*pi-bash-tee-.*\.log \| tail/,
    );
  });

  // Additional: other then mutatable
  it("other then mutatable → injects after other", () => {
    assertTeeInjected(
      "cmd | sort | grep foo | tail -5",
      /sort \| tee \/.*pi-bash-tee-.*\.log \| grep/,
    );
  });
});

describe("formatSize", () => {
  const cases: Record<string, [number, string]> = {
    bytes: [500, "500 B"],
    KiB: [69 * 1024, "69.0 KiB"],
    MiB: [1.2 * 1024 * 1024, "1.2 MiB"],
    GiB: [2.5 * 1024 * 1024 * 1024, "2.5 GiB"],
  };
  for (const [label, [input, expected]] of Object.entries(cases)) {
    it(label, () => assert.strictEqual(formatSize(input), expected));
  }
});
