/**
 * 등록 후속 감사 B12 — 빈 계정 스스로 지우기:
 * (a) 응답에 내부 이유(표 이름)를 넣지 않는다 · 이유는 서버 감사 기록에만
 * (b) 삭제 직전 재확인에서 빈 계정이 아니면 지우지 않는다 · 같은 회원 동시 요청은 하나만 진행
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Check = { ok: true; empty: true } | { ok: true; empty: false; reasons: string[] } | { ok: false; error: string };

const state = vi.hoisted(() => ({
  checks: [] as Check[],
  purgeCalls: 0,
  audits: [] as Array<{ action: string; after_json: Record<string, unknown> | null | undefined }>,
  purgeGate: null as null | Promise<void>,
}));

vi.mock("@/lib/auth/discard-empty-account.server", () => ({
  checkEmptyAccountForDiscard: async () => state.checks.shift() ?? { ok: true, empty: true },
}));
vi.mock("@/lib/admin/admin-user-deletion", () => ({
  purgeAuthUserById: async () => {
    state.purgeCalls += 1;
    if (state.purgeGate) await state.purgeGate;
    return { ok: true };
  },
}));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateAllUserPushTokensForAccountRemoval: async () => ({ ok: true, errors: [] }),
}));
vi.mock("@/lib/auth/native/apple-siwa-token.server", () => ({
  revokeAppleSigninTokenForUser: async () => ({ status: "skipped" }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({
  appendAuditLog: async (_sb: unknown, row: { action: string; after_json?: Record<string, unknown> | null }) => {
    state.audits.push({ action: row.action, after_json: row.after_json });
  },
}));

import { isDiscardEmptyAccountInFlight, runDiscardEmptyAccount } from "@/lib/auth/discard-empty-account-run.server";

const sb = {} as never;

beforeEach(() => {
  state.checks = [];
  state.purgeCalls = 0;
  state.audits = [];
  state.purgeGate = null;
});

describe("B12 빈 계정 지우기", () => {
  it("빈 계정 아님 → 409 not_empty_account, 응답에 이유 없음 · 이유는 감사 기록에만", async () => {
    state.checks = [{ ok: true, empty: false, reasons: ["posts.user_id", "stores.owner_user_id"] }];
    const r = await runDiscardEmptyAccount(sb, "u1", "09170000000");
    expect(r).toEqual({ status: 409, body: { ok: false, error: "not_empty_account" } });
    expect(JSON.stringify(r)).not.toContain("posts");
    expect(state.purgeCalls).toBe(0);
    expect(state.audits).toEqual([
      expect.objectContaining({
        action: "user_discard_empty_account_refused",
        after_json: expect.objectContaining({ stage: "precheck", reasons: ["posts.user_id", "stores.owner_user_id"] }),
      }),
    ]);
  });

  it("번호 없음 → 409 not_empty_account (이유 미노출)", async () => {
    const r = await runDiscardEmptyAccount(sb, "u1", "  ");
    expect(r).toEqual({ status: 409, body: { ok: false, error: "not_empty_account" } });
    expect(state.purgeCalls).toBe(0);
  });

  it("삭제 직전 재확인에서 활동이 생겼으면 지우지 않는다", async () => {
    state.checks = [{ ok: true, empty: true }, { ok: true, empty: false, reasons: ["chat_messages.sender_id"] }];
    const r = await runDiscardEmptyAccount(sb, "u1", "09170000000");
    expect(r).toEqual({ status: 409, body: { ok: false, error: "not_empty_account" } });
    expect(state.purgeCalls).toBe(0);
    expect(state.audits[0]).toMatchObject({
      action: "user_discard_empty_account_refused",
      after_json: expect.objectContaining({ stage: "recheck", reasons: ["chat_messages.sender_id"] }),
    });
  });

  it("재확인 조회 실패 → 지우지 않고 503", async () => {
    state.checks = [{ ok: true, empty: true }, { ok: false, error: "lookup_failed" }];
    const r = await runDiscardEmptyAccount(sb, "u1", "09170000000");
    expect(r).toEqual({ status: 503, body: { ok: false, error: "lookup_failed" } });
    expect(state.purgeCalls).toBe(0);
  });

  it("두 번 모두 빈 계정 → 삭제 1회 · { ok: true }", async () => {
    const r = await runDiscardEmptyAccount(sb, "u1", "09170000000");
    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(state.purgeCalls).toBe(1);
    expect(state.audits.map((a) => a.action)).toEqual(["user_discard_empty_account"]);
    expect(isDiscardEmptyAccountInFlight("u1")).toBe(false);
  });

  it("같은 회원 동시 요청 → 하나만 진행(나머지 discard_in_progress), 끝나면 다시 가능", async () => {
    let release!: () => void;
    state.purgeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runDiscardEmptyAccount(sb, "u1", "09170000000");
    const second = await runDiscardEmptyAccount(sb, "u1", "09170000000");
    expect(second).toEqual({ status: 409, body: { ok: false, error: "discard_in_progress" } });
    release();
    expect(await first).toEqual({ status: 200, body: { ok: true } });
    expect(state.purgeCalls).toBe(1);
    expect(isDiscardEmptyAccountInFlight("u1")).toBe(false);
  });

  it("라우트는 실행 함수 결과만 돌려준다(reasons 직접 응답 없음)", () => {
    const route = readFileSync(join(process.cwd(), "app/api/me/registration/discard-empty-account/route.ts"), "utf8");
    expect(route).toContain("runDiscardEmptyAccount(sb, auth.userId, attemptedPhone)");
    expect(route).not.toContain("reasons");
    expect(route).not.toContain("purgeAuthUserById");
  });
});
