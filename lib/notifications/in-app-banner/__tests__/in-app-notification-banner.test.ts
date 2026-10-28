import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { adaptNotificationEventInsertToLegacyRow } from "@/lib/notifications/adapt-notification-event-realtime-row";
import {
  IN_APP_NOTIFICATION_BANNER_AUTO_DISMISS_MS,
  IN_APP_NOTIFICATION_BANNER_LOGO_SRC,
  inAppNotificationBannerImageSrc,
  inAppNotificationBannerRemainingMs,
  mergeInAppNotificationBanner,
  useInAppNotificationBannerStore,
} from "@/lib/notifications/in-app-banner/in-app-notification-banner-store";
import { resolveMemberInAppNotificationBanner } from "@/lib/notifications/in-app-banner/member-in-app-notification-banner";
import {
  pushMessengerInAppMessageBanner,
  useMessengerInAppMessageBannerStore,
} from "@/lib/community-messenger/notifications/messenger-in-app-banner-store";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function eventRow(over: Record<string, unknown>) {
  return adaptNotificationEventInsertToLegacyRow({
    id: "e1",
    user_id: "u",
    type: "order_status",
    category: "order_status",
    title: "주문이 접수됐어요",
    body: "맛집 · 김치찌개",
    created_at: "2026-10-29T03:00:00Z",
    read_at: null,
    dedupe_key: "d1",
    room_id: null,
    display_payload: {
      routeUrl: "/my/store-orders/o-1",
      legacyMeta: { kind: "store_order_status", order_id: "o-1", store_image_url: "https://img/s.png" },
    },
    ...over,
  });
}

const HOME = { pathname: "/home", visible: true };

describe("앱 안 알림 배너 — 회원 알림 (notification_events INSERT)", () => {
  it("주문 → order 종류 · 매장 사진(둥근 사각) · 주문 묶음 · 알림센터와 같은 목적지", () => {
    const d = resolveMemberInAppNotificationBanner(eventRow({}), HOME);
    expect(d.show).toBe(true);
    if (!d.show) return;
    expect(d.push.presentation).toMatchObject({
      kind: "order",
      title: "주문이 접수됐어요",
      body: "맛집 · 김치찌개",
      imageUrl: "https://img/s.png",
      imageShape: "rounded",
      threadKey: "order:o-1",
      bodyTone: "normal",
      occurredAt: "2026-10-29T03:00:00Z",
    });
    expect(d.push.target).toMatchObject({ type: "notification", notificationId: "e1", href: "/my/store-orders/o-1" });
  });

  it("매장 사진이 없거나 공지·시스템이면 DIBAY 로고", () => {
    const order = resolveMemberInAppNotificationBanner(
      eventRow({ display_payload: { routeUrl: "/my/store-orders/o-1", legacyMeta: { kind: "store_order_status", order_id: "o-1" } } }),
      HOME
    );
    const notice = resolveMemberInAppNotificationBanner(
      eventRow({ id: "e2", type: "admin_notice", category: "notice", title: "공지", body: "점검", display_payload: { campaignType: "notice" } }),
      HOME
    );
    expect(order.show && inAppNotificationBannerImageSrc(order.push.presentation)).toBe(IN_APP_NOTIFICATION_BANNER_LOGO_SRC);
    expect(notice.show && notice.push.presentation.kind).toBe("notice");
    expect(notice.show && inAppNotificationBannerImageSrc(notice.push.presentation)).toBe(IN_APP_NOTIFICATION_BANNER_LOGO_SRC);
  });

  it("건너뛰기 — 채팅(메신저 배너)·부재중·고객센터·친구 요청·음소거·legacy 행·백그라운드", () => {
    const skip = (row: Record<string, unknown>, ctx = HOME) => {
      const d = resolveMemberInAppNotificationBanner(row, ctx);
      return d.show ? "show" : d.reason;
    };
    expect(skip(eventRow({ type: "chat_message", category: "chat", room_id: "r1", display_payload: { roomKind: "direct" } }))).toBe(
      "chat_owned_by_messenger"
    );
    expect(skip(eventRow({ type: "missed_call", category: "missed_call", display_payload: {} }))).toBe("call_or_missed_call");
    expect(skip(eventRow({ type: "support_admin_replied", display_payload: { routeUrl: "/support/cases/c-1" } }))).toBe(
      "support_own_banner"
    );
    expect(skip(eventRow({ type: "system", display_payload: { legacyMeta: { kind: "friend_request" } } }))).toBe(
      "messenger_owned_kind"
    );
    expect(skip({ ...eventRow({}), muted_snapshot: true })).toBe("muted");
    expect(skip({ ...eventRow({}), source: undefined })).toBe("not_event_row");
    expect(skip(eventRow({}), { pathname: "/home", visible: false })).toBe("not_visible");
  });

  it("지금 보고 있는 화면 — 알림센터·같은 주문 상세면 띄우지 않는다", () => {
    const at = (pathname: string) => {
      const d = resolveMemberInAppNotificationBanner(eventRow({}), { pathname, visible: true });
      return d.show ? "show" : d.reason;
    };
    expect(at("/notifications")).toBe("notifications_center_open");
    expect(at("/notifications/abc")).toBe("notifications_center_open");
    expect(at("/my/store-orders/o-1")).toBe("destination_open");
    expect(at("/my/store-orders/o-2")).toBe("show");
  });

  it("같은 알림 Realtime 중복 수신은 개수를 올리지 않는다", () => {
    const d = resolveMemberInAppNotificationBanner(eventRow({}), { ...HOME, currentDedupeKey: "notification:e1" });
    expect(d.show ? "show" : d.reason).toBe("duplicate");
  });
});

describe("앱 안 알림 배너 — 단일 store 병합·소멸", () => {
  beforeEach(() => useInAppNotificationBannerStore.getState().dismiss());

  it("메신저 같은 방은 개수 +1 · 다른 방은 교체 (기존 규칙)", () => {
    pushMessengerInAppMessageBanner({ roomId: "r1", title: "철수", preview: "안녕", dedupeKey: "k1" });
    pushMessengerInAppMessageBanner({ roomId: "r1", title: "철수", preview: "또", dedupeKey: "k2" });
    let b = useInAppNotificationBannerStore.getState().banner;
    expect(b?.count).toBe(2);
    expect(b?.presentation).toMatchObject({ kind: "message", body: "또", imageShape: "circle", threadKey: "room:r1" });
    expect(useMessengerInAppMessageBannerStore.getState().banner?.roomId).toBe("r1");

    pushMessengerInAppMessageBanner({ roomId: "r2", title: "영희", preview: "hi", dedupeKey: "k3" });
    b = useInAppNotificationBannerStore.getState().banner;
    expect(b?.count).toBe(1);
    expect(useMessengerInAppMessageBannerStore.getState().banner?.roomId).toBe("r2");
  });

  it("부재중 통화는 원형 사진 · 본문색은 E(통화 규정) 승인 전까지 기본", () => {
    pushMessengerInAppMessageBanner({ roomId: "r1", title: "철수", preview: "부재중 음성통화", kind: "missed_call", dedupeKey: "k" });
    expect(useInAppNotificationBannerStore.getState().banner?.presentation).toMatchObject({
      kind: "missed_call",
      bodyTone: "normal",
      imageShape: "circle",
    });
  });

  it("종류 이름뿐인 묶음(공지·시스템)은 서로 합치지 않는다", () => {
    const base = {
      kind: "system" as const,
      body: "",
      imageUrl: null,
      imageShape: "rounded" as const,
      threadKey: "system",
      bodyTone: "normal" as const,
      occurredAt: null,
    };
    const target = { type: "notification" as const, notificationId: "n", inboxRow: {} as never, href: "/mypage/points" };
    const first = mergeInAppNotificationBanner(null, { presentation: { ...base, title: "충전됐어요" }, target, dedupeKey: "a" }, 1);
    const second = mergeInAppNotificationBanner(first, { presentation: { ...base, title: "반려됐어요" }, target, dedupeKey: "b" }, 2);
    expect(second.count).toBe(1);
    expect(second.presentation.title).toBe("반려됐어요");
  });

  it("메신저 dismiss 는 회원 알림 배너를 닫지 않는다", () => {
    const d = resolveMemberInAppNotificationBanner(eventRow({}), HOME);
    if (!d.show) throw new Error("expected show");
    useInAppNotificationBannerStore.getState().pushOrMerge(d.push);
    expect(useMessengerInAppMessageBannerStore.getState().banner).toBeNull();
    useMessengerInAppMessageBannerStore.getState().dismiss();
    expect(useInAppNotificationBannerStore.getState().banner?.presentation.kind).toBe("order");
  });

  it("빈 새 문구는 이전 값 유지 · 지정 count 우선", () => {
    const base = {
      kind: "message" as const,
      title: "a",
      body: "b",
      imageUrl: "https://x/a.png",
      imageShape: "circle" as const,
      threadKey: "room:r",
      bodyTone: "normal" as const,
      occurredAt: null,
    };
    const target = { type: "messenger_room" as const, roomId: "r" };
    const first = mergeInAppNotificationBanner(null, { presentation: base, target, dedupeKey: "1" }, 1000);
    const next = mergeInAppNotificationBanner(
      first,
      { presentation: { ...base, title: "", body: "", imageUrl: null }, target, dedupeKey: "2", count: 5 },
      2000
    );
    expect(next.presentation).toMatchObject({ title: "a", body: "b", imageUrl: "https://x/a.png" });
    expect(next.count).toBe(5);
    expect(next.updatedAt).toBe(2000);
  });

  it("4초 자동 소멸 — 갱신 시각 기준 남은 시간", () => {
    expect(IN_APP_NOTIFICATION_BANNER_AUTO_DISMISS_MS).toBe(4_000);
    expect(inAppNotificationBannerRemainingMs(1_000, 1_000)).toBe(4_000);
    expect(inAppNotificationBannerRemainingMs(1_000, 3_500)).toBe(1_500);
    expect(inAppNotificationBannerRemainingMs(1_000, 9_000)).toBe(0);
  });
});

describe("앱 안 알림 배너 — 배선", () => {
  it("단일 호스트가 전역 크롬에 장착되고 기존 Realtime 브리지에서 회원 알림을 넣는다", () => {
    expect(read("components/layout/providers/MessagingGlobalChrome.tsx")).toContain("<InAppNotificationBannerHost />");
    expect(read("components/notifications/NotificationsBadgeRealtimeBridge.tsx")).toContain(
      "pushMemberInAppNotificationBannerFromRealtimeRow(row)"
    );
    const host = read("components/notifications/InAppNotificationBannerHost.tsx");
    expect(host).toContain("activateNotificationDestination");
    expect(host).not.toContain(">\n          닫기");
  });
});
