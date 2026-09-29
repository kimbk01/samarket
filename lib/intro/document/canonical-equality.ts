/**
 * DIBAY INTRO — CUT A
 * Canonical authored-document equality for Save → hard-reload proof.
 * Does not normalize away real mismatches.
 */

import type { IntroDocumentV1 } from "../contracts/document";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** Strip non-authoritative noise if any — currently identity for IntroDocumentV1. */
export function canonicalizeAuthoredDocument(
  doc: IntroDocumentV1,
): IntroDocumentV1 {
  return JSON.parse(JSON.stringify(doc)) as IntroDocumentV1;
}

export function authoredDocumentsEqual(
  a: IntroDocumentV1,
  b: IntroDocumentV1,
): boolean {
  return (
    stableStringify(canonicalizeAuthoredDocument(a)) ===
    stableStringify(canonicalizeAuthoredDocument(b))
  );
}

export type AuthoredEqualityDiff = {
  readonly equal: boolean;
  readonly path?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
};

function diffAt(
  path: string,
  expected: unknown,
  actual: unknown,
): AuthoredEqualityDiff | null {
  if (expected === actual) return null;
  if (
    expected != null &&
    actual != null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    if (Array.isArray(expected) || Array.isArray(actual)) {
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        return { equal: false, path, expected, actual };
      }
      if (expected.length !== actual.length) {
        return {
          equal: false,
          path: `${path}.length`,
          expected: expected.length,
          actual: actual.length,
        };
      }
      for (let i = 0; i < expected.length; i++) {
        const d = diffAt(`${path}[${i}]`, expected[i], actual[i]);
        if (d) return d;
      }
      return null;
    }
    const ek = Object.keys(expected as object).sort();
    const ak = Object.keys(actual as object).sort();
    if (ek.join("\0") !== ak.join("\0")) {
      return { equal: false, path: `${path}.keys`, expected: ek, actual: ak };
    }
    for (const k of ek) {
      const d = diffAt(
        `${path}.${k}`,
        (expected as Record<string, unknown>)[k],
        (actual as Record<string, unknown>)[k],
      );
      if (d) return d;
    }
    return null;
  }
  return { equal: false, path, expected, actual };
}

export function diffAuthoredDocuments(
  expected: IntroDocumentV1,
  actual: IntroDocumentV1,
): AuthoredEqualityDiff {
  const d = diffAt(
    "document",
    canonicalizeAuthoredDocument(expected),
    canonicalizeAuthoredDocument(actual),
  );
  return d ?? { equal: true };
}
