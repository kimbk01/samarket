/**
 * S2 (2026-11-09) — 주문 채팅 읽음 응답의 배지 스냅샷(`badgeAck`)을 읽은 기기에 적용할 때
 * 이벤트 역전·중복·동시 읽음·재연결 재조회가 안전한지.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/startup-api-scheduler", () => ({
  scheduleStartupApiDeferred: (_id: string, run: () => void) => {
    run();
    return () => {};
  },
}));

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

/** 기존 notification-badge-count-store 테스트와 같은 Domain 배지 응답 모양 */
function domainBadge(versionMs: number, n: number) {
  return {
    ok: true,
    authority: "domain_badge",
    projectionVersionMs: versionMs,
    badgeGeneration: versionMs,
    domainUnreadRooms: { general_direct: n, group: 0, trade: 0, store_order: 0 },
    domainAppIcon: { messenger: n, trade: 0, storeOrder: 0, missedCall: 0 },
    nonChatEventAttention: { tradeStatus: 0, orderStatus: 0, deliveryStatus: 0, communityActivity: 0, adminNotice: 0 },
    notificationAttentionTotal: n,
    total: n,
    chatMessage: n,
    groupMessage: 0,
    tradeMessage: 0,
    tradeStatus: 0,
    orderStatus: 0,
    deliveryStatus: 0,
    communityActivity: 0,
    adminMarketingBanner: 0,
    adminNotice: 0,
    chat: n,
    group: 0,
    trade: 0,
    store: 0,
    missedCall: 0,
  };
}

async function bootStore(initial: ReturnType<typeof domainBadge>, later: Array<ReturnType<typeof domainBadge>> = []) {
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { visibilityState: "visible" });
  const fetchMock = vi.fn().mockResolvedValueOnce({ status: 200, json: async () => initial });
  for (const p of later) fetchMock.mockResolvedValueOnce({ status: 200, json: async () => p });
  vi.stubGlobal("fetch", fetchMock);
  const store = await import("@/lib/notifications/notification-badge-count-store");
  const { applyDomainBadgeAuthorityFromReadAck } = await import(
    "@/lib/notifications/client/notification-events-read-resync"
  );
  const unsubscribe = store.subscribeNotificationBadgeCount(() => {});
  await flush();
  return { store, apply: applyDomainBadgeAuthorityFromReadAck, unsubscribe, fetchMock };
}

describe("S2 주문 읽음 ACK 적용 — 순서·중복 안전", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("새 버전 적용 · 이전 버전(역전) 무시 · 같은 버전(중복) 무시", async () => {
    const { store, apply, unsubscribe } = await bootStore(domainBadge(100, 5));
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(5);

    expect(apply(domainBadge(200, 3), "room_open_mark_read")).toBe(true);
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(3);

    // 늦게 도착한 이전 읽음 응답 — 무시
    expect(apply(domainBadge(150, 9), "room_open_mark_read")).toBe(true);
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(3);

    // 같은 응답 중복 — 무시
    expect(apply(domainBadge(200, 9), "room_open_mark_read")).toBe(true);
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(3);
    unsubscribe();
  });

  it("동시 읽음 2건이 거꾸로 도착해도 최신 버전이 남는다", async () => {
    const { store, apply, unsubscribe } = await bootStore(domainBadge(100, 5));
    apply(domainBadge(400, 1), "room_open_mark_read");
    apply(domainBadge(350, 2), "room_open_mark_read");
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(1);
    unsubscribe();
  });

  it("ACK 뒤 재연결·복귀 재조회 — 더 새 값이면 적용, 더 오래된 값이면 유지", async () => {
    const { store, apply, unsubscribe } = await bootStore(domainBadge(100, 5), [
      domainBadge(250, 7), // ACK(300) 보다 오래된 재조회 응답
      domainBadge(500, 0), // 더 새 재조회 응답
    ]);
    apply(domainBadge(300, 2), "room_open_mark_read");
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(2);

    store.requestNotificationBadgeCountResync("realtime_read_sync");
    await flush();
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(2);

    store.requestNotificationBadgeCountResync("realtime_read_sync");
    await flush();
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(0);
    unsubscribe();
  });

  it("응답에 스냅샷이 없으면(구 서버) 아무것도 바꾸지 않는다", async () => {
    const { store, apply, unsubscribe } = await bootStore(domainBadge(100, 5));
    expect(apply(undefined, "room_open_mark_read")).toBe(false);
    expect(apply({ ok: true, authority: "room_unread_v1" }, "room_open_mark_read")).toBe(false);
    expect(store.getNotificationBadgeCountSnapshot()?.total).toBe(5);
    unsubscribe();
  });
});

describe("S2 주문 읽음 계약 (소스)", () => {
  const root = process.cwd();
  const server = readFileSync(join(root, "lib/order-domain/read-order-chat.ts"), "utf8");
  const client = readFileSync(
    join(root, "lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts"),
    "utf8"
  );

  it("서버: 이미 계산한 Domain 스냅샷을 badgeAck 로 응답, 최상위 authority 계약 유지", () => {
    expect(server).toContain("badgeAck: domainBadgeReadMutationAckFields(domain)");
    expect(server).toContain('authority: "room_unread_v1"');
    // 배지 계산은 읽음 1회당 1번
    expect(server.match(/fetchDomainBadgeAuthorityPayload\(/g)?.length).toBe(1);
  });

  it("클라이언트: 읽음 성공 시 badgeAck 를 ACK 계약 함수로 적용", () => {
    const okBranch = client.slice(client.indexOf("const json = await postOrderChatRead"), client.indexOf("order_read_api_done"));
    expect(okBranch).toContain('applyDomainBadgeAuthorityFromReadAck(json.badgeAck, "room_open_mark_read")');
  });
});
