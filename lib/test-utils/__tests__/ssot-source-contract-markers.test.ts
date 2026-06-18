import { describe, expect, it } from "vitest";
import { SSOT_SOURCE_CONTRACT_REGISTRY } from "@/lib/test-utils/ssot-source-contract-registry";
import { assertSsotSourceContract } from "@/lib/test-utils/ssot-source-contract";

describe("SSOT source contract markers", () => {
  for (const entry of SSOT_SOURCE_CONTRACT_REGISTRY) {
    it(`${entry.id} — ${entry.file}`, () => {
      expect(() => assertSsotSourceContract(entry)).not.toThrow();
    });
  }
});
