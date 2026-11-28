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
const notify = vi.hoisted(() => ({ fail: 0, calls: [] as { dedupeKey: string; body?: string }[] }));
vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: vi.fn(async (_sb: unknown, ev: { dedupeKey: string; body?: string }) => {
    notify.calls.push({ dedupeKey: ev.dedupeKey, body: ev.body });
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

function fakeSb(
  opts: {
    deletedReply?: boolean;
    outbox?: unknown[];
    replyBody?: string;
    existingNotification?: boolean;
    caseUnread?: number;
    /** 이 답변과 그 뒤 어드민 공개 답변 수 */
    repliesFromThis?: number;
    caseStatus?: string;
  } = {}
) {
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
        is: () => chain,
        gte: () => chain,
        lt: () => chain,
        limit: () => chain,
        delete: () => chain,
        maybeSingle: async () =>
          table === "support_messages"
            ? {
                data: {
                  deleted_at: opts.deletedReply ? "2026-12-01T00:00:00Z" : null,
                  body: opts.replyBody ?? "답",
                  ...(opts.caseUnread != null ? { case_id: "c1" } : {}),
                },
                error: null,
              }
            : table === "notification_events"
              ? { data: opts.existingNotification ? { id: "ne-old" } : null, error: null }
              : table === "support_cases"
                ? { data: { requester_unread_count: opts.caseUnread ?? 1, status: opts.caseStatus ?? "WAITING_USER" }, error: null }
                : { data: null, error: null },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: table === "support_messages" ? (opts.repliesFromThis ?? 1) : null }).then(ok),
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

describe("재감사 2 — 대기열 다시 만들기는 만들기 직전 다시 읽는다 (동작)", () => {
  const payloadOf = (kind: string) => ({
    kind,
    event: { userId: "u1", type: "support_admin_replied", dedupeKey: "support_admin_replied:m1", title: "t", body: "옛 답" },
    requesterUserId: "u1",
    replyMessageId: "m1",
  });
  const run = async (opts: Parameters<typeof fakeSb>[0]) => {
    const { runAdminNotificationDeliveryWorker } = await import("@/lib/admin/notifications/admin-notification-service");
    const { SUPPORT_REQUESTER_OUTBOX_KIND } = await import("@/lib/support/support-requester-outbox");
    const { sb, rpcCalls } = fakeSb({
      ...opts,
      outbox: [{ id: "o1", claim_token: "k", source_key: "requester:x", payload: payloadOf(SUPPORT_REQUESTER_OUTBOX_KIND) }],
    });
    await runAdminNotificationDeliveryWorker(sb);
    return rpcCalls.find((c) => c.name === "admin_notification_outbox_finish")?.args.p_ok;
  };

  it("고친 답변이면 저장해 둔 옛 본문이 아니라 지금 본문으로 만든다", async () => {
    expect(await run({ replyBody: "고친 답" })).toBe(true);
    expect(notify.calls.map((c) => c.body)).toEqual(["고친 답"]);
  });

  it("그 고객의 같은 키 알림이 이미 있으면 만들지 않고 처리됨", async () => {
    expect(await run({ existingNotification: true })).toBe(true);
    expect(notify.calls).toHaveLength(0);
  });

  it("고객이 이미 봤으면(그 문의 고객 미읽음 0) 안 읽은 행을 만들지 않고 처리됨", async () => {
    expect(await run({ caseUnread: 0 })).toBe(true);
    expect(notify.calls).toHaveLength(0);
  });
});

describe("재감사 2차 3 — 「봤나」는 답변마다 · 종료·재오픈 알림은 지금 상태 확인 (동작)", () => {
  const run = async (payload: Record<string, unknown>, opts: Parameters<typeof fakeSb>[0]) => {
    const { runAdminNotificationDeliveryWorker } = await import("@/lib/admin/notifications/admin-notification-service");
    const { SUPPORT_REQUESTER_OUTBOX_KIND } = await import("@/lib/support/support-requester-outbox");
    const { sb, rpcCalls } = fakeSb({
      ...opts,
      outbox: [{ id: "o1", claim_token: "k", source_key: "requester:x", payload: { kind: SUPPORT_REQUESTER_OUTBOX_KIND, requesterUserId: "u1", ...payload } }],
    });
    await runAdminNotificationDeliveryWorker(sb);
    return rpcCalls.find((c) => c.name === "admin_notification_outbox_finish")?.args.p_ok;
  };
  const reply = {
    event: { userId: "u1", type: "support_admin_replied", dedupeKey: "support_admin_replied:a", title: "t", body: "A", displayPayload: { supportCaseId: "c1" } },
    replyMessageId: "a",
  };

  it("고객이 답변 A 를 본 뒤 B 가 와서 미읽음 1 이면 — A(그 뒤 답변 2개)는 만들지 않는다", async () => {
    expect(await run(reply, { caseUnread: 1, repliesFromThis: 2 })).toBe(true);
    expect(notify.calls).toHaveLength(0);
  });

  it("A 와 B 모두 안 봤으면(미읽음 2 · A 부터 2개) A 를 만든다", async () => {
    expect(await run(reply, { caseUnread: 2, repliesFromThis: 2 })).toBe(true);
    expect(notify.calls.map((c) => c.dedupeKey)).toEqual(["support_admin_replied:a"]);
  });

  it("종료 알림: 그사이 재오픈돼 진행 중이면 만들지 않는다 · 아직 종료면 만든다", async () => {
    const resolved = {
      event: { userId: "u1", type: "support_case_resolved", dedupeKey: "support_case_resolved:c1:t", title: "t", body: "b", displayPayload: { supportCaseId: "c1" } },
      replyMessageId: null,
    };
    expect(await run(resolved, { caseStatus: "OPEN" })).toBe(true);
    expect(notify.calls).toHaveLength(0);
    expect(await run(resolved, { caseStatus: "RESOLVED" })).toBe(true);
    expect(notify.calls).toHaveLength(1);
  });

  it("재오픈 알림: 그사이 다시 종료됐으면 만들지 않는다 · 진행 중이면 만든다", async () => {
    const reopened = {
      event: { userId: "u1", type: "support_case_reopened", dedupeKey: "support_case_reopened:c1:t", title: "t", body: "b", displayPayload: { supportCaseId: "c1" } },
      replyMessageId: null,
    };
    expect(await run(reopened, { caseStatus: "RESOLVED" })).toBe(true);
    expect(notify.calls).toHaveLength(0);
    expect(await run(reopened, { caseStatus: "WAITING_ADMIN" })).toBe(true);
    expect(notify.calls).toHaveLength(1);
  });
});
