import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");

describe("Slice1 Trust writer authority (structural)", () => {
  it("Admin trust-score route uses requireAdminApiUser + applyTrustScoreDelta only", () => {
    const src = readFileSync(path.join(root, "app/api/admin/trust-score/route.ts"), "utf8");
    expect(src).toContain("requireAdminApiUser");
    expect(src).toContain("applyTrustScoreDelta");
    expect(src).toContain('sourceType: "admin_adjust"');
    expect(src).not.toMatch(/\.from\(["']profiles["']\)\.update\(\s*\{\s*trust_score/);
    // Non-admin / unauthenticated must fail before writer (gate order)
    const gateIdx = src.indexOf("requireAdminApiUser");
    const writerIdx = src.indexOf("applyTrustScoreDelta");
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(writerIdx).toBeGreaterThan(gateIdx);
  });

  it("requireAdminApiUser chains requireAuth → validateActiveSession → requireAdmin", () => {
    const src = readFileSync(path.join(root, "lib/admin/require-admin-api.ts"), "utf8");
    expect(src).toContain("requireAuth");
    expect(src).toContain("validateActiveSession");
    expect(src).toContain("requireAdmin");
  });

  it("Admin member PATCH does not accept trust_score in body patch path", () => {
    const src = readFileSync(path.join(root, "app/api/admin/users/[id]/route.ts"), "utf8");
    // PATCH builds patch from nickname/phone/email/memberType — not trust_score
    const patchSection = src.slice(src.indexOf("const patch: Record<string, unknown>"));
    expect(patchSection).not.toContain("trust_score");
    expect(src).toContain("trust_score"); // GET select/payload only
  });
});
