/**
 * 전체 수정 §4 · 재감사 S-6 — 고객 알림 저장이 응답 전에 두 번 다 실패하면 영구 재시도 대기열에 넣고,
 * 5분 작업자가 다시 만든다(지운 답변이면 만들지 않음). 동작 시험 — 기준 트리 d2e0fc07f 에서는 모듈이 없어 실패한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: () => {
    throw new Error("outside request");
  },
}));
vi.mock("@/lib/push/keep-alive-after-response", () => ({ keepAliveAfterResponse: () => undefined }));
const notify = vi.hoisted(() => ({ fail: 0, calls: [] as { dedupeKey: string }[] }));
vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(async (_sb: unknown, ev: { dedupeKey: string }) => {
    notify.calls.push({ dedupeKey: ev.dedupeKey });
    if (notify.fail > 0) {
      notify.fail -= 1;
      return { ok: false, error: "insert_failed" };
    }
    return { ok: true, row: { id: "ne-1", unread: true } };
  }),
  dispatchNotificationEvent: vi.fn(async () => "sent"),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: vi.fn(async () => "ko"),
}));

type RpcCall = { name: string; args: Record<string, unknown> };

function fakeSb(opts: { deletedReply?: boolean; outbox?: unknown[] } = {}) {
  const rpcCalls: RpcCall[] = [];
  const sb = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ name, args });
      if (name === "admin_notification_outbox_enqueue") return { data: true, error: null };
      if (name === "admin_notification_replay_support_replies") return { data: 0, error: null };
      if (name === "admin_notification_outbox_claim") return { data: opts.outbox ?? [], error: null };
      if (name === "admin_notification_outbox_finish") return { data: args.p_ok ? "delivered" : "retry", error: null };
      if (name === "admin_notification_push_claim") return { data: [], error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        lt: () => chain,
        limit: () => chain,
        delete: () => chain,
        maybeSingle: async () =>
          table === "support_messages"
            ? { data: { deleted_at: opts.deletedReply ? "2026-12-01T00:00:00Z" : null }, error: null }
            : { data: null, error: null },
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
      };
      return chain;
    },
  };
  return { sb: sb as never, rpcCalls };
}

const input = {
  userId: "u1",
  type: "support_admin_replied" as const,
  title: "t",
  body: "답",
  caseId: "c1",
  publicCaseNo: "SC-1",
  audience: "MEMBER" as const,
  dedupeKey: "support_admin_replied:m1",
};

beforeEach(() => {
  notify.fail = 0;
  notify.calls.length = 0;
});

describe("S-6 고객 알림 영구 재시도 (동작)", () => {
  it("응답 전 저장이 두 번 다 실패 → 대기열에 고객 알림 사건을 넣는다(키 requester:<dedupe>)", async () => {
    const { recordRequesterSupportNotification } = await import("@/lib/support/support-notification-ledger");
    const { sb, rpcCalls } = fakeSb();
    notify.fail = 2;
    const r = await recordRequesterSupportNotification(sb, () => input, { requesterUserId: "u1", replyMessageId: "m1" });
    expect(r.ok).toBe(false);
    const enq = rpcCalls.filter((c) => c.name === "admin_notification_outbox_enqueue");
    expect(enq).toHaveLength(1);
    expect(enq[0].args.p_source_key).toBe("requester:support_admin_replied:m1");
    expect(enq[0].args.p_kind).toBe("support_requester_notification");
    expect((enq[0].args.p_payload as { replyMessageId: string }).replyMessageId).toBe("m1");
  });

  it("작업자가 꺼내면 같은 dedupe 키로 다시 만들고 처리됨으로 닫는다", async () => {
    const { runAdminNotificationDeliveryWorker } = await import("@/lib/admin/notifications/admin-notification-service");
    const { SUPPORT_REQUESTER_OUTBOX_KIND } = await import("@/lib/support/support-requester-outbox");
    const payload = {
      kind: SUPPORT_REQUESTER_OUTBOX_KIND,
      event: { userId: "u1", type: "support_admin_replied", dedupeKey: "support_admin_replied:m1", title: "t", body: "답" },
      requesterUserId: "u1",
      replyMessageId: "m1",
    };
    const { sb, rpcCalls } = fakeSb({ outbox: [{ id: "o1", claim_token: "k", source_key: "requester:x", payload }] });
    const sum = await runAdminNotificationDeliveryWorker(sb);
    expect(notify.calls.map((c) => c.dedupeKey)).toEqual(["support_admin_replied:m1"]);
    const fin = rpcCalls.find((c) => c.name === "admin_notification_outbox_finish");
    expect(fin?.args.p_ok).toBe(true);
    expect(sum.outboxDelivered).toBe(1);
  });

  it("그사이 답변이 지워졌으면 만들지 않고 처리됨으로 닫는다(지운 원문이 알림함에 남지 않음)", async () => {
    const { runAdminNotificationDeliveryWorker } = await import("@/lib/admin/notifications/admin-notification-service");
    const { SUPPORT_REQUESTER_OUTBOX_KIND } = await import("@/lib/support/support-requester-outbox");
    const payload = {
      kind: SUPPORT_REQUESTER_OUTBOX_KIND,
      event: { userId: "u1", type: "support_admin_replied", dedupeKey: "support_admin_replied:m1", title: "t", body: "답" },
      requesterUserId: "u1",
      replyMessageId: "m1",
    };
    const { sb, rpcCalls } = fakeSb({ deletedReply: true, outbox: [{ id: "o1", claim_token: "k", source_key: "requester:x", payload }] });
    await runAdminNotificationDeliveryWorker(sb);
    expect(notify.calls).toHaveLength(0);
    expect(rpcCalls.find((c) => c.name === "admin_notification_outbox_finish")?.args.p_ok).toBe(true);
  });
});
