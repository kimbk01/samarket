/**
 * C2 — Intro packageIntegrity canonical contract corpus.
 * SSOT: lib/intro/integrity.ts (ES JSON.stringify(sortKeys)).
 * This file locks server-side literals; Android/iOS harnesses must match the same bytes.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeIntroJson, integrityOfCanonicalJson } from "@/lib/intro/integrity";

type Case = { id: string; value: unknown; expectCanonIncludes?: string[] };

const CASES: Case[] = [
  { id: "null", value: { a: null }, expectCanonIncludes: ['"a":null'] },
  { id: "bool_true", value: { b: true }, expectCanonIncludes: ['"b":true'] },
  { id: "bool_false", value: { c: false }, expectCanonIncludes: ['"c":false'] },
  { id: "integer", value: { n: 42 }, expectCanonIncludes: ['"n":42'] },
  {
    id: "integer_valued_double",
    value: { m: 42.0 },
    expectCanonIncludes: ['"m":42'],
  },
  {
    id: "fractional_double",
    value: { f: 0.82 },
    expectCanonIncludes: ['"f":0.82'],
  },
  {
    id: "small_decimal_cluster",
    value: {
      a: 0.46125,
      b: 0.09000000000000002,
      c: 0.26937500000000003,
    },
  },
  { id: "negative", value: { n: -3.5 }, expectCanonIncludes: ['"n":-3.5'] },
  { id: "zero", value: { z: 0 }, expectCanonIncludes: ['"z":0'] },
  { id: "negative_zero", value: { z: -0 }, expectCanonIncludes: ['"z":0'] },
  { id: "string", value: { s: "hello" }, expectCanonIncludes: ['"s":"hello"'] },
  {
    id: "escaped_string",
    value: { s: 'path/with/slash"quote\n' },
    expectCanonIncludes: ["path/with/slash", '\\"quote'],
  },
  {
    id: "unicode",
    value: { s: "한글🌟" },
    expectCanonIncludes: ["한글"],
  },
  {
    id: "array",
    value: { e: [1, 2.5, 0.82, { z: 0.46125, a: 0.09000000000000002 }] },
  },
  {
    id: "nested_array",
    value: { e: [[1, 2], [3, { x: 4.0 }]] },
    expectCanonIncludes: ['"x":4'],
  },
  {
    id: "object_key_order",
    value: { z: 1, a: 2, m: 3 },
    expectCanonIncludes: ['{"a":2,"m":3,"z":1}'],
  },
  {
    id: "nested_object",
    value: { f: { nested: { x: 0.26937500000000003 } } },
  },
  {
    id: "float_pack_geometry",
    value: {
      packageId: "fix",
      releaseId: "r1",
      frames: [
        { x: 0.82, y: 0.46125, w: 0.09000000000000002, h: 0.26937500000000003 },
      ],
    },
  },
];

describe("intro canonical contract corpus (server SSOT)", () => {
  for (const c of CASES) {
    it(`case ${c.id}`, () => {
      const canon = canonicalizeIntroJson(c.value);
      const hash = integrityOfCanonicalJson(c.value);
      expect(hash).toBe(
        createHash("sha256").update(canon, "utf8").digest("hex"),
      );
      for (const frag of c.expectCanonIncludes ?? []) {
        expect(canon).toContain(frag);
      }
      // integer-valued double must never emit trailing .0
      if (c.id === "integer_valued_double") {
        expect(canon).not.toContain("42.0");
      }
    });
  }

  it("solidus not escaped", () => {
    const canon = canonicalizeIntroJson({ p: "a/b" });
    expect(canon).toContain('"a/b"');
    expect(canon).not.toContain("\\/");
  });
});
