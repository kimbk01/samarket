/**
 * P1 (Owner 2026-11-03 「DB 2건 승인」) — 포인트 충전 신청 서버 중복 방지 키.
 * DB 고유 인덱스 동작은 scripts/qa/finance-p0-local-pg (P1-C1~C3) 에서 검증.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserIdStrict: () => auth() }));

let existing: Record<string, unknown> | null = null;
let insertError: { code?: string; message: string } | null = null;
const inserts: Array<Record<string, unknown>> = [];

function sbMock() {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, { select: chain, eq: chain });
      if (table === "point_plans") {
        q.maybeSingle = async () => ({
          data: { id: "plan-1", is_active: true, point_amount: 1000, bonus_amount: 0, payment_amount: 100, rate_version: 1, name_ko: "1000P", name_en: "1000P" },
          error: null,
        });
      } else if (table === "profiles") {
        q.maybeSingle = async () => ({ data: { nickname: "회원" }, error: null });
      } else {
        q.maybeSingle = async () => ({ data: existing, error: null });
        q.insert = (row: Record<string, unknown>) => {
          inserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () =>
                insertError ? { data: null, error: insertError } : { data: { id: "req-new", ...row }, error: null },
            }),
          };
        };
      }
      return q;
    },
  };
}
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sbMock() }));

import { POST } from "@/app/api/me/points/charge/route";

const req = (body: unknown) =>
  new Request("https://x.test/api/me/points/charge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  existing = null;
  insertError = null;
  inserts.length = 0;
  auth.mockResolvedValue({ ok: true, userId: "u1" });
});

describe("POST /api/me/points/charge — idempotency", () => {
  it("requires a key", async () => {
    const res = await POST(req({ planId: "plan-1", paymentMethod: "manual_confirm", depositorName: "홍" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("idempotency_required");
    expect(inserts).toHaveLength(0);
  });

  it("first submit inserts with the key", async () => {
    const res = await POST(req({ planId: "plan-1", paymentMethod: "manual_confirm", depositorName: "홍", idempotencyKey: "point_charge:abc12345" }));
    expect(res.status).toBe(200);
    expect(inserts[0]).toMatchObject({ idempotency_key: "point_charge:abc12345" });
  });

  it("retry with the same key returns the existing request (no second insert)", async () => {
    existing = { id: "req-1", user_id: "u1", plan_id: "plan-1", payment_method: "manual_confirm", request_status: "waiting_confirm" };
    const res = await POST(req({ planId: "plan-1", paymentMethod: "manual_confirm", depositorName: "홍", idempotencyKey: "point_charge:abc12345" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, idempotent: true });
    expect(inserts).toHaveLength(0);
  });

  it("same key with a different plan is refused", async () => {
    existing = { id: "req-1", user_id: "u1", plan_id: "plan-OTHER", payment_method: "manual_confirm" };
    const res = await POST(req({ planId: "plan-1", paymentMethod: "manual_confirm", depositorName: "홍", idempotencyKey: "point_charge:abc12345" }));
    expect(res.status).toBe(409);
    expect(inserts).toHaveLength(0);
  });
});

describe("POST /api/me/points/charge — iOS app (Apple 3.1.1)", () => {
  const iosReq = (headers: Record<string, string>) =>
    new Request("https://x.test/api/me/points/charge", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ planId: "plan-1", paymentMethod: "manual_confirm", depositorName: "홍", idempotencyKey: "point_charge:ios12345" }),
    }) as never;

  it("refuses a bank-transfer charge from the iOS app shell before any write", async () => {
    const res = await POST(iosReq({ "x-dibay-shell": "ios" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("ios_digital_purchase_unavailable");
    expect(inserts).toHaveLength(0);
  });

  it("refuses the iOS app WKWebView user agent even without the shell header", async () => {
    const res = await POST(
      iosReq({
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      })
    );
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  it("keeps Safari on iPhone (web user) working", async () => {
    const res = await POST(
      iosReq({
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
      })
    );
    expect(res.status).toBe(200);
  });
});
