import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  deleteSidecar,
  isPrefixOf,
  loadSidecar,
  saveSidecar,
  sidecarPathFor,
  type SidecarV1,
} from "../src/sidecar.js";

describe("sidecarPathFor", () => {
  it("replaces .jsonl with .claude-agent-sdk.json", () => {
    assert.equal(
      sidecarPathFor("/a/b/sess_abc.jsonl"),
      "/a/b/sess_abc.claude-agent-sdk.json",
    );
  });
  it("appends suffix when the file has no .jsonl extension", () => {
    assert.equal(
      sidecarPathFor("/a/b/sess_abc"),
      "/a/b/sess_abc.claude-agent-sdk.json",
    );
  });
  it("returns undefined for undefined input", () => {
    assert.equal(sidecarPathFor(undefined), undefined);
  });
});

describe("loadSidecar / saveSidecar", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sidecar-test-"));
    path = join(dir, "sess.claude-agent-sdk.json");
  });

  afterEach(async () => {
    await deleteSidecar(path);
  });

  it("returns undefined when file does not exist", async () => {
    assert.equal(await loadSidecar(path), undefined);
  });

  it("round-trips a sidecar", async () => {
    const data: SidecarV1 = {
      version: 1,
      sdkSessionId: "abc-123",
      signatures: ["u:1:a", "a:2:b", "t:tc1:c"],
      sdkUuidByPiIndex: [
        [0, "uuid-0"],
        [2, "uuid-2"],
      ],
    };
    await saveSidecar(path, data);
    const loaded = await loadSidecar(path);
    assert.deepEqual(loaded, data);
  });

  it("round-trips without the optional uuid map", async () => {
    const data: SidecarV1 = {
      version: 1,
      sdkSessionId: "abc-123",
      signatures: ["u:1:x"],
    };
    await saveSidecar(path, data);
    const loaded = await loadSidecar(path);
    assert.deepEqual(loaded, data);
  });

  it("returns undefined for an unknown version", async () => {
    await writeFile(
      path,
      JSON.stringify({ version: 99, sdkSessionId: "x", signatures: [] }),
      "utf8",
    );
    assert.equal(await loadSidecar(path), undefined);
  });

  it("returns undefined when required fields are missing", async () => {
    await writeFile(path, JSON.stringify({ version: 1 }), "utf8");
    assert.equal(await loadSidecar(path), undefined);
  });

  it("returns undefined when signatures is not a string array", async () => {
    await writeFile(
      path,
      JSON.stringify({ version: 1, sdkSessionId: "x", signatures: [1, 2] }),
      "utf8",
    );
    assert.equal(await loadSidecar(path), undefined);
  });

  it("saveSidecar is atomic: leaves no .tmp file behind", async () => {
    await saveSidecar(path, {
      version: 1,
      sdkSessionId: "a",
      signatures: ["x"],
    });
    const files = await readdir(dir);
    assert.deepEqual(
      files.filter((f) => f.endsWith(".tmp")),
      [],
      "no .tmp files should remain after a successful save",
    );
  });

  it("deleteSidecar is idempotent on missing files", async () => {
    await deleteSidecar(path);
    await deleteSidecar(path);
  });

  it("loadSidecar reads what saveSidecar wrote even if file is read raw", async () => {
    const data: SidecarV1 = {
      version: 1,
      sdkSessionId: "abc",
      signatures: ["s1"],
    };
    await saveSidecar(path, data);
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.sdkSessionId, "abc");
    assert.deepEqual(parsed.signatures, ["s1"]);
  });
});

describe("isPrefixOf", () => {
  it("accepts equal arrays", () => {
    assert.equal(isPrefixOf(["a", "b"], ["a", "b"]), true);
  });
  it("accepts a strict prefix", () => {
    assert.equal(isPrefixOf(["a", "b"], ["a", "b", "c"]), true);
  });
  it("accepts an empty persisted array", () => {
    assert.equal(isPrefixOf([], ["a"]), true);
    assert.equal(isPrefixOf([], []), true);
  });
  it("rejects when persisted is longer than current", () => {
    assert.equal(isPrefixOf(["a", "b"], ["a"]), false);
  });
  it("rejects when any element differs", () => {
    assert.equal(isPrefixOf(["a", "b"], ["a", "X"]), false);
    assert.equal(isPrefixOf(["a"], ["X", "a"]), false);
  });
});
