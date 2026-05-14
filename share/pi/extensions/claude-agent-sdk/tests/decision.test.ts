import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tryWarmResume } from "../src/decision.js";
import type { SidecarV1 } from "../src/sidecar.js";

function sidecar(signatures: string[]): SidecarV1 {
  return { version: 1, sdkSessionId: "sdk-abc", signatures };
}

describe("tryWarmResume", () => {
  it("returns cold-seed/no-sidecar when sidecar is undefined", () => {
    const d = tryWarmResume({
      sidecar: undefined,
      sdkJsonlExists: true,
      newSigs: ["a"],
    });
    assert.equal(d.kind, "cold-seed");
    if (d.kind === "cold-seed") assert.equal(d.reason, "no-sidecar");
  });

  it("returns cold-seed/sdk-jsonl-missing when the SDK file is gone", () => {
    const d = tryWarmResume({
      sidecar: sidecar(["a"]),
      sdkJsonlExists: false,
      newSigs: ["a"],
    });
    assert.equal(d.kind, "cold-seed");
    if (d.kind === "cold-seed") assert.equal(d.reason, "sdk-jsonl-missing");
  });

  it("returns cold-seed/signature-mismatch when persisted is not a prefix", () => {
    const d = tryWarmResume({
      sidecar: sidecar(["a", "b"]),
      sdkJsonlExists: true,
      newSigs: ["a", "DIFFERENT", "c"],
    });
    assert.equal(d.kind, "cold-seed");
    if (d.kind === "cold-seed") assert.equal(d.reason, "signature-mismatch");
  });

  it("returns cold-seed/signature-mismatch when persisted is longer than current", () => {
    // Pi rolled back below the sidecar's high-water-mark.
    const d = tryWarmResume({
      sidecar: sidecar(["a", "b", "c"]),
      sdkJsonlExists: true,
      newSigs: ["a", "b"],
    });
    assert.equal(d.kind, "cold-seed");
    if (d.kind === "cold-seed") assert.equal(d.reason, "signature-mismatch");
  });

  it("returns warm-resume on exact-equal signatures (no tail)", () => {
    const d = tryWarmResume({
      sidecar: sidecar(["a", "b"]),
      sdkJsonlExists: true,
      newSigs: ["a", "b"],
    });
    assert.equal(d.kind, "warm-resume");
    if (d.kind === "warm-resume") {
      assert.equal(d.sdkSessionId, "sdk-abc");
      assert.equal(d.tailStartPiIdx, 2);
    }
  });

  it("returns warm-resume on strict prefix (tail to replay)", () => {
    const d = tryWarmResume({
      sidecar: sidecar(["a", "b"]),
      sdkJsonlExists: true,
      newSigs: ["a", "b", "c", "d"],
    });
    assert.equal(d.kind, "warm-resume");
    if (d.kind === "warm-resume") assert.equal(d.tailStartPiIdx, 2);
  });

  it("seeds sdkUuidByPiIndex map from the sidecar entries", () => {
    const s: SidecarV1 = {
      version: 1,
      sdkSessionId: "sdk-abc",
      signatures: ["a"],
      sdkUuidByPiIndex: [
        [0, "uuid-0"],
        [3, "uuid-3"],
      ],
    };
    const d = tryWarmResume({
      sidecar: s,
      sdkJsonlExists: true,
      newSigs: ["a"],
    });
    assert.equal(d.kind, "warm-resume");
    if (d.kind === "warm-resume") {
      assert.equal(d.sdkUuidByPiIndex.get(0), "uuid-0");
      assert.equal(d.sdkUuidByPiIndex.get(3), "uuid-3");
    }
  });

  it("returns an empty uuid map when the sidecar omits it", () => {
    const d = tryWarmResume({
      sidecar: sidecar(["a"]),
      sdkJsonlExists: true,
      newSigs: ["a"],
    });
    assert.equal(d.kind, "warm-resume");
    if (d.kind === "warm-resume") assert.equal(d.sdkUuidByPiIndex.size, 0);
  });
});
