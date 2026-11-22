/**
 * 2026-11-22 보내기 3b — 채팅 푸시 앱 아이콘 배지 묶음 계산 · 인계 대기 저장 합치기.
 * - 묶음 계산 = 사람마다 같은 입력으로 `computeMemberAppIconFromFacts`(전체 배지 계산과 같은 함수) 결과
 * - 미리 계산한 숫자가 있으면 배지 계산을 건너뛰고, 부재중 통화는 넘겨도 쓰지 않는다
 * - 인계 대기는 채팅 저장 입력에 시각이 있을 때만 저장 문장에 들어간다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchDomainBadgeAuthorityPayload = vi.fn();
const dispatchPushForUser = vi.fn();
const messengerFacts = vi.fn();
const tradeFacts = vi.fn();

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: (...a: unknown[]) => fetchDomainBadgeAuthorityPayload(...a),
}));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...a: unknown[]) => dispatchPushForUser(...a),
}));
vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/load-messenger-unread-room-facts-from-participants", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadMessengerUnreadRoomFactsFromParticipants: (...a: unknown[]) => messengerFacts(...a),
}));
vi.mock("@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadTradeStoreOrderUnreadRoomFactsFromParticipants: (...a: unknown[]) => tradeFacts(...a),
}));

type Res = { data: unknown; error: unknown };
function fakeSvc(opts: { inputs?: Res; bell?: Res }) {
  const calls: string[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const svc = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "order", "limit"]) chain[m] = () => chain;
      chain.then = (ok: (v: Res) => unknown) =>
        Promise.resolve(table === "member_unread_room_inputs" ? (opts.inputs ?? { data: [], error: null }) : { data: [], error: null }).then(ok);
      return chain;
    }),
    rpc: vi.fn(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return opts.bell ?? { data: [], error: null };
    }),
  };
  return { svc: svc as never, calls, rpcCalls };
}

const bellRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "trade_status",
  category: "trade",
  display_payload: {},
  room_id: null,
  dedupe_key: null,
  unread: true,
  read_at: null,
  muted_snapshot: false,
  ...extra,
});

beforeEach(() => {
  fetchDomainBadgeAuthorityPayload.mockReset();
  dispatchPushForUser.mockReset();
  dispatchPushForUser.mockResolvedValue({ outcome: "sent" });
  messengerFacts.mockReset();
  tradeFacts.mockReset();
});

describe("보내기 3b — 배지 묶음 계산", () => {
  it("받는 사람 여러 명이어도 표 1번 + DB 함수 1번 · 사람마다 같은 계산 함수 결과", async () => {
    const realMessenger = await vi.importActual<
      typeof import("@/lib/notifications/load-messenger-unread-room-facts-from-participants")
    >("@/lib/notifications/load-messenger-unread-room-facts-from-participants");
    const realTrade = await vi.importActual<
      typeof import("@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants")
    >("@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants");
    messengerFacts.mockImplementation(realMessenger.loadMessengerUnreadRoomFactsFromParticipants as never);
    tradeFacts.mockImplementation(realTrade.loadTradeStoreOrderUnreadRoomFactsFromParticipants as never);

    const bell = {
      data: [
        { user_id: "u1", rows: [bellRow("n1"), bellRow("n2")] },
        { user_id: "u2", rows: [] },
        { user_id: "u3", rows: [bellRow("n3")] },
      ],
      error: null,
    };
    const { svc, calls, rpcCalls } = fakeSvc({ inputs: { data: [], error: null }, bell });
    const { loadPushBadgeTotalsBatch } = await import("@/lib/push/dispatch/chat-push-facts-batch");
    const { computeMemberAppIconFromFacts } = await import(
      "@/lib/notifications/pipeline/build-domain-badge-authority-http"
    );
    const { resolveMemberAppIconTotalForNativeFcm } = await import(
      "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority"
    );
    const out = await loadPushBadgeTotalsBatch(svc, ["u1", "u2", "u3", "u1"]);
    expect(calls.filter((t) => t === "member_unread_room_inputs")).toHaveLength(1);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.name).toBe("notification_bell_unread_rows_many");
    expect((rpcCalls[0]?.args as { p_user_ids: string[] }).p_user_ids).toEqual(["u1", "u2", "u3"]);
    expect(out).not.toBeNull();

    for (const uid of ["u1", "u2", "u3"]) {
      const rows = bell.data.find((r) => r.user_id === uid)!.rows;
      const [m, t] = await Promise.all([
        realMessenger.loadMessengerUnreadRoomFactsFromParticipants(svc, uid, Promise.resolve([]) as never),
        realTrade.loadTradeStoreOrderUnreadRoomFactsFromParticipants(svc, uid, Promise.resolve([]) as never),
      ]);
      const expected = resolveMemberAppIconTotalForNativeFcm({
        memberAppIconWebTotal: computeMemberAppIconFromFacts({
          uid,
          bellExplainRows: rows as never,
          messengerRooms: m,
          tradeStoreRooms: t,
          revision: 1,
        }).memberAppIconAuthority.appIconTotal,
      });
      expect(out!.get(uid)).toBe(expected);
    }
    expect(out!.get("u1")).toBe(2);
    expect(out!.get("u2")).toBe(0);
  });

  it("사람마다 자기 입력만 로더에 들어간다", async () => {
    const realMessenger = await vi.importActual<
      typeof import("@/lib/notifications/load-messenger-unread-room-facts-from-participants")
    >("@/lib/notifications/load-messenger-unread-room-facts-from-participants");
    const realTrade = await vi.importActual<
      typeof import("@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants")
    >("@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants");
    messengerFacts.mockImplementation(realMessenger.loadMessengerUnreadRoomFactsFromParticipants as never);
    tradeFacts.mockImplementation(realTrade.loadTradeStoreOrderUnreadRoomFactsFromParticipants as never);
    const inputs = {
      data: [
        { user_id: "u1", room_id: "r1" },
        { user_id: "u2", room_id: "r2" },
      ],
      error: null,
    };
    const { svc } = fakeSvc({ inputs, bell: { data: [], error: null } });
    const { loadPushBadgeTotalsBatch } = await import("@/lib/push/dispatch/chat-push-facts-batch");
    const r = await loadPushBadgeTotalsBatch(svc, ["u1", "u2"]);
    expect(r).not.toBeNull();
    const byUser = new Map(messengerFacts.mock.calls.map((c) => [c[1] as string, c[2]]));
    const roomsOf = async (v: unknown) => ((await v) as { rooms: { id: string }[] }).rooms.map((x) => x.id);
    expect(await roomsOf(byUser.get("u1"))).toEqual(["r1"]);
    expect(await roomsOf(byUser.get("u2"))).toEqual(["r2"]);
    expect(messengerFacts).toHaveBeenCalledTimes(2);
  });

  it("DB 함수 오류 · 표 오류 → null(사람마다 기존 계산으로)", async () => {
    const { loadPushBadgeTotalsBatch } = await import("@/lib/push/dispatch/chat-push-facts-batch");
    const a = fakeSvc({ bell: { data: null, error: { message: "function does not exist" } } });
    expect(await loadPushBadgeTotalsBatch(a.svc, ["u1"])).toBeNull();
    const b = fakeSvc({ inputs: { data: null, error: { message: "x" } } });
    expect(await loadPushBadgeTotalsBatch(b.svc, ["u1"])).toBeNull();
  });
});

describe("보내기 3b — 발송에 미리 계산한 배지", () => {
  const row = {
    id: "ev-1",
    user_id: "user-1",
    type: "chat_message",
    room_id: "room-1",
    call_session_id: null,
    display_payload: {},
    push_suppressed_reason: null,
    created_at: new Date().toISOString(),
  } as never;
  const pre = { eventRow: row, safety: { allow: true } as const, preferences: { readFailed: true } as never, targets: [] };

  it("채팅: badgeTotal 이 있으면 배지 계산을 하지 않고 그 숫자로 보낸다", async () => {
    const { dispatchNotificationPushIfAllowed } = await import("@/lib/notifications/pipeline/notify-push-dispatcher");
    await dispatchNotificationPushIfAllowed({} as never, row, { preloadedChatFacts: { ...pre, badgeTotal: 7 } });
    expect(fetchDomainBadgeAuthorityPayload).not.toHaveBeenCalled();
    expect(dispatchPushForUser.mock.calls[0]?.[1]).toMatchObject({ badge_count: 7 });
  });

  it("badgeTotal 없으면 지금처럼 사람별 계산", async () => {
    fetchDomainBadgeAuthorityPayload.mockResolvedValue({ memberAppIconWebTotal: 4, projection: { appIconTotal: 4 } });
    const { dispatchNotificationPushIfAllowed } = await import("@/lib/notifications/pipeline/notify-push-dispatcher");
    await dispatchNotificationPushIfAllowed({} as never, { ...(row as object), id: "ev-2" } as never, {
      preloadedChatFacts: pre,
    });
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalledTimes(1);
    expect(dispatchPushForUser.mock.calls[0]?.[1]).toMatchObject({ badge_count: 4 });
  });

  it("부재중 통화는 badgeTotal 을 넘겨도 쓰지 않는다(지금 계산 그대로)", async () => {
    fetchDomainBadgeAuthorityPayload.mockResolvedValue({ memberAppIconWebTotal: 5, projection: { appIconTotal: 5 } });
    const { dispatchNotificationPushIfAllowed } = await import("@/lib/notifications/pipeline/notify-push-dispatcher");
    await dispatchNotificationPushIfAllowed(
      {} as never,
      { ...(row as object), id: "ev-3", type: "missed_call", call_session_id: "s-1" } as never,
      { callPushKind: "missed_call", preloadedChatFacts: { ...pre, badgeTotal: 99 } }
    );
    expect(fetchDomainBadgeAuthorityPayload).toHaveBeenCalledTimes(1);
    expect(dispatchPushForUser.mock.calls[0]?.[1]).toMatchObject({ badge_count: 5, call_push_kind: "missed_call" });
  });
});

describe("보내기 3b — 인계 대기 저장 합치기", () => {
  function insertSb() {
    const inserted: Record<string, unknown>[] = [];
    const sb = {
      from: () => ({
        insert: (obj: Record<string, unknown>) => {
          inserted.push(obj);
          return { select: () => ({ single: async () => ({ data: { id: "ev-9", ...obj }, error: null }) }) };
        },
      }),
    };
    return { sb: sb as never, inserted };
  }
  const base = {
    userId: "11111111-1111-4111-8111-111111111111",
    type: "chat_message",
    category: "chat",
    title: "t",
    body: "b",
    dedupeKey: "chat:room-1:msg-1",
  } as never;

  it("시각이 있으면 기존 저장 뒤 갱신과 같은 값이 저장 문장에 들어간다", async () => {
    const { createNotificationEvent } = await import("@/lib/notifications/core/notification-event-repository");
    const { sb, inserted } = insertSb();
    const at = "2026-11-22T01:01:00.000Z";
    await createNotificationEvent(sb, { ...(base as object), chatPushHandoffPendingNextAt: at } as never);
    expect(inserted[0]).toMatchObject({
      push_handoff_status: "pending",
      push_handoff_next_at: at,
      push_handoff_claimed_at: null,
      push_handoff_claim_token: null,
      push_handoff_last_error: null,
    });
  });

  it("시각이 없으면(부재중 통화 등) 인계 열을 넣지 않는다 — 지금 그대로", async () => {
    const { createNotificationEvent } = await import("@/lib/notifications/core/notification-event-repository");
    const { sb, inserted } = insertSb();
    await createNotificationEvent(sb, base);
    expect(Object.keys(inserted[0] ?? {}).some((k) => k.startsWith("push_handoff_"))).toBe(false);
  });

  it("다음 시도 시각 = 지금 + 60초(markChatPushHandoffPending 과 같음)", async () => {
    const { chatPushHandoffPendingNextAtIso, CHAT_PUSH_HANDOFF_FASTPATH_GRACE_MS } = await import(
      "@/lib/notifications/chat-notification-push-handoff"
    );
    expect(CHAT_PUSH_HANDOFF_FASTPATH_GRACE_MS).toBe(60_000);
    expect(chatPushHandoffPendingNextAtIso(Date.parse("2026-11-22T01:00:00.000Z"))).toBe("2026-11-22T01:01:00.000Z");
  });
});
