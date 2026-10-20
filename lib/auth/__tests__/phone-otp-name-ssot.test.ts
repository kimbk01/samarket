import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server-guards", () => ({ getCurrentProfile: async () => null }));

import { patchProfileDisplayName, precheckProfileDisplayName } from "@/lib/auth/phone-otp-server-sync";

/** 감사 #4 — 전화 인증 화면의 이름도 공개 이름 SSOT(nickname)로 같은 검증을 거쳐 저장 */

function fakeSb(rows: Array<{ id: string; nickname: string | null; display_name: string | null }>) {
  const updates: Array<Record<string, unknown>> = [];
  const ilikeArgs: string[] = [];
  const sb = {
    from: () => {
      let mode: "select" | "update" = "select";
      let patch: Record<string, unknown> = {};
      const filters: Array<(r: (typeof rows)[number]) => boolean> = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (p: Record<string, unknown>) => {
        mode = "update";
        patch = p;
        return q;
      };
      q.eq = (c: string, v: unknown) => {
        filters.push((r) => (r as Record<string, unknown>)[c] === v);
        if (mode === "update") {
          updates.push(patch);
          return Promise.resolve({ error: null });
        }
        return q;
      };
      q.neq = (c: string, v: unknown) => {
        filters.push((r) => (r as Record<string, unknown>)[c] !== v);
        return q;
      };
      q.ilike = (c: string, pattern: string) => {
        ilikeArgs.push(pattern);
        const literal = pattern.replace(/\\(.)/g, "$1").toLowerCase();
        filters.push((r) => String((r as Record<string, unknown>)[c] ?? "").toLowerCase() === literal);
        return q;
      };
      q.limit = async () => ({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
      q.maybeSingle = async () => ({ data: rows.filter((r) => filters.every((f) => f(r)))[0] ?? null, error: null });
      return q;
    },
  };
  return { sb: sb as never, updates, ilikeArgs };
}

describe("phone verification name → nickname SSOT", () => {
  it("writes nickname and display_name together", async () => {
    const { sb, updates } = fakeSb([{ id: "u1", nickname: "dibay_F7176B", display_name: "Mando" }]);
    expect(await patchProfileDisplayName(sb, "u1", "Mando")).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ nickname: "Mando", display_name: "Mando" });
  });

  it("rejects a nickname used by another member (case-insensitive, escaped)", async () => {
    const { sb, updates, ilikeArgs } = fakeSb([
      { id: "u1", nickname: "old", display_name: "old" },
      { id: "u2", nickname: "Kim_A1", display_name: "Kim_A1" },
    ]);
    const res = await patchProfileDisplayName(sb, "u1", "kim_a1");
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(updates).toEqual([]);
    expect(ilikeArgs).toContain("kim\\_a1");
  });

  it("precheck blocks too-short names before an OTP is sent", async () => {
    const { sb } = fakeSb([{ id: "u1", nickname: "old", display_name: "old" }]);
    expect(await precheckProfileDisplayName(sb, "u1", "a")).toMatchObject({ ok: false, status: 400 });
    expect(await precheckProfileDisplayName(sb, "u1", "old")).toEqual({ ok: true });
  });
});
