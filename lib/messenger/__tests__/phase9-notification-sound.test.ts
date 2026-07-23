/**
 * Phase 9 — Domain Notification / Sound Architecture harness.
 * Production Push / Sound / Badge wiring 0.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";
import {
  MESSENGER_NOTIFICATION_SCHEMA_VERSION,
  PHASE9_NOTIFICATION_PRODUCTION_WIRING,
  parseMessengerNotificationEnvelope,
} from "@/lib/messenger/contracts/domain-notification-envelope-phase9";
import {
  PHASE9_DOMAIN_SOUND_KEYS,
  PHASE9_NATIVE_CALL_SOUND_KEYS_FORBIDDEN,
  assertPhase9DoesNotTouchNativeCallSound,
  resolvePhase9DomainSoundKey,
} from "@/lib/messenger/contracts/domain-sound-key-phase9";
import {
  adaptNotificationEventsToAppIconContribution,
  envelopesToUnreadBadgeEvents,
} from "@/lib/messenger/contracts/notification-app-icon-adapter-phase9";
import { MESSENGER_DOMAIN_BUILD_PHASE_ORDER } from "@/lib/messenger/contracts/phase-order";
import { buildGeneralDirectIdentity } from "@/lib/messenger/general-direct/identity";
import {
  applyGeneralDirectNotificationEnvelope,
  GeneralDirectNotificationCacheHarness,
} from "@/lib/messenger/general-direct/phase9-notification";
import { GENERAL_DIRECT_SOUND_EVENT_KEY } from "@/lib/messenger/general-direct/notification-sound";
import { buildGroupIdentity } from "@/lib/messenger/group/identity";
import {
  applyGroupNotificationEnvelope,
  GroupNotificationCacheHarness,
} from "@/lib/messenger/group/phase9-notification";
import { GROUP_SOUND_EVENT_KEY } from "@/lib/messenger/group/notification-sound";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import {
  applyTradeNotificationEnvelope,
  TradeNotificationCacheHarness,
} from "@/lib/messenger/trade/phase9-notification";
import { TRADE_SOUND_EVENT_KEY } from "@/lib/messenger/trade/notification-sound";
import { buildStoreOrderIdentityKey } from "@/lib/messenger/store-order/design-lock";
import {
  applyStoreOrderNotificationEnvelope,
  STORE_ORDER_STORE_IMAGE_PLACEHOLDER,
  StoreOrderNotificationCacheHarness,
} from "@/lib/messenger/store-order/phase9-notification";
import {
  STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
  STORE_ORDER_SOUND_EVENT_KEY_OWNER,
} from "@/lib/messenger/store-order/notification-sound";

const GD_ID = buildGeneralDirectIdentity("user-a", "user-b").identityKey;
const GROUP_ID = buildGroupIdentity("g1").identityKey;
const TRADE_ID = buildTradeIdentity({
  itemId: "item-1",
  sellerUserId: "seller-1",
  counterpartyUserId: "buyer-1",
}).identityKey;
const SO_ID = buildStoreOrderIdentityKey("order-1");

function baseEnvelope(overrides: Record<string, unknown>) {
  return {
    schemaVersion: MESSENGER_NOTIFICATION_SCHEMA_VERSION,
    roomId: "room-1",
    eventId: "evt-1",
    viewerUserId: "viewer-1",
    senderUserId: "sender-1",
    notificationType: "message_created",
    badgeTarget: "app_icon",
    occurredAt: "2026-07-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 9 — envelope reject", () => {
  it("rejects missing chatDomain / identity prefix mismatch / other viewer", () => {
    expect(() =>
      parseMessengerNotificationEnvelope(
        baseEnvelope({
          domainIdentityKey: GD_ID,
          soundKey: PHASE9_DOMAIN_SOUND_KEYS.general_direct,
          displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "hi" },
        })
      )
    ).toThrow(/chatDomain/);

    expect(() =>
      parseMessengerNotificationEnvelope(
        baseEnvelope({
          chatDomain: "general_direct",
          domainIdentityKey: "trade:item-1:seller-1:buyer-1",
          soundKey: PHASE9_DOMAIN_SOUND_KEYS.general_direct,
          displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "hi" },
        })
      )
    ).toThrow(/identity_prefix/);

    expect(() =>
      applyGeneralDirectNotificationEnvelope(
        baseEnvelope({
          chatDomain: "general_direct",
          domainIdentityKey: GD_ID,
          soundKey: PHASE9_DOMAIN_SOUND_KEYS.general_direct,
          displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "hi" },
        }),
        { viewerUserId: "other-viewer" }
      )
    ).toThrow(/viewer_mismatch/);
  });

  it("rejects reinference fields", () => {
    expect(() =>
      parseMessengerNotificationEnvelope(
        baseEnvelope({
          chatDomain: "general_direct",
          domainIdentityKey: GD_ID,
          soundKey: PHASE9_DOMAIN_SOUND_KEYS.general_direct,
          roomType: "direct",
          displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "hi" },
        })
      )
    ).toThrow(/reinference/);
  });
});

describe("Phase 9 — domain display identity", () => {
  it("general_direct shows peer name/avatar + message preview", () => {
    const r = applyGeneralDirectNotificationEnvelope(
      baseEnvelope({
        chatDomain: "general_direct",
        domainIdentityKey: GD_ID,
        soundKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
        displayContext: {
          peerDisplayName: "민수",
          peerAvatarUrl: "https://img/a.png",
          messagePreview: "안녕",
        },
      }),
      { viewerUserId: "viewer-1" }
    );
    expect(r.title).toBe("민수");
    expect(r.avatarUrl).toBe("https://img/a.png");
    expect(r.preview).toBe("안녕");
    expect(r.setsOsBadge).toBe(false);
  });

  it("group shows group name/image; sender is secondary", () => {
    const r = applyGroupNotificationEnvelope(
      baseEnvelope({
        chatDomain: "group",
        domainIdentityKey: GROUP_ID,
        roomId: "g1",
        soundKey: GROUP_SOUND_EVENT_KEY,
        displayContext: {
          groupName: "동네모임",
          groupImageUrl: "https://img/g.png",
          senderName: "보낸사람",
          messagePreview: "회식",
        },
      }),
      { viewerUserId: "viewer-1" }
    );
    expect(r.title).toBe("동네모임");
    expect(r.avatarUrl).toBe("https://img/g.png");
    expect(r.senderName).toBe("보낸사람");
    expect(r.preview).toBe("회식");
  });

  it("trade shows product context; status must not replace preview", () => {
    const r = applyTradeNotificationEnvelope(
      baseEnvelope({
        chatDomain: "trade",
        domainIdentityKey: TRADE_ID,
        soundKey: TRADE_SOUND_EVENT_KEY,
        displayContext: {
          productTitle: "자전거",
          productImageUrl: "https://img/p.png",
          peerDisplayName: "판매자",
          messagePreview: "네고 가능할까요",
          tradeStatusLabel: "예약중",
          productSummary: "상태요약",
        },
      }),
      { viewerUserId: "viewer-1" }
    );
    expect(r.title).toBe("자전거");
    expect(r.peerLabel).toBe("판매자");
    expect(r.preview).toBe("네고 가능할까요");
    expect(r.preview).not.toBe("예약중");
    expect(r.preview).not.toBe("상태요약");

    expect(() =>
      applyTradeNotificationEnvelope(
        baseEnvelope({
          chatDomain: "trade",
          domainIdentityKey: TRADE_ID,
          soundKey: TRADE_SOUND_EVENT_KEY,
          displayContext: {
            productTitle: "자전거",
            productImageUrl: null,
            peerDisplayName: null,
            messagePreview: "",
            tradeStatusLabel: "예약중",
          },
        }),
        { viewerUserId: "viewer-1" }
      )
    ).toThrow(/preview_must_be_message/);
  });

  it("store_order customer shows store; owner avatar forbidden; no store image → placeholder", () => {
    const r = applyStoreOrderNotificationEnvelope(
      baseEnvelope({
        chatDomain: "store_order",
        domainIdentityKey: SO_ID,
        soundKey: STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
        displayContext: {
          surfaceRole: "customer",
          orderId: "order-1",
          storeId: "store-1",
          storeName: "맛집",
          storeImageUrl: null,
          customerName: null,
          customerAvatarUrl: null,
          messagePreview: "배달 언제 와요",
        },
      }),
      { viewerUserId: "viewer-1", expectedSurfaceRole: "customer" }
    );
    expect(r.title).toBe("맛집");
    expect(r.avatarUrl).toBeNull();
    expect(r.avatarPlaceholder).toBe(STORE_ORDER_STORE_IMAGE_PLACEHOLDER);
    expect(r.preview).toBe("배달 언제 와요");

    expect(() =>
      applyStoreOrderNotificationEnvelope(
        baseEnvelope({
          chatDomain: "store_order",
          domainIdentityKey: SO_ID,
          soundKey: STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
          displayContext: {
            surfaceRole: "customer",
            orderId: "order-1",
            storeId: "store-1",
            storeName: "맛집",
            storeImageUrl: null,
            customerName: null,
            customerAvatarUrl: null,
            messagePreview: "hi",
            ownerMemberAvatarUrl: "https://owner.png",
          },
        }),
        { viewerUserId: "viewer-1", expectedSurfaceRole: "customer" }
      )
    ).toThrow(/owner_member/);
  });

  it("store_order owner shows customer; cross-surface cache FAIL", () => {
    const owner = applyStoreOrderNotificationEnvelope(
      baseEnvelope({
        chatDomain: "store_order",
        domainIdentityKey: SO_ID,
        soundKey: STORE_ORDER_SOUND_EVENT_KEY_OWNER,
        displayContext: {
          surfaceRole: "owner",
          orderId: "order-1",
          storeId: "store-1",
          storeName: null,
          storeImageUrl: null,
          customerName: "손님",
          customerAvatarUrl: "https://c.png",
          messagePreview: "주문 변경",
        },
      }),
      { viewerUserId: "viewer-1", expectedSurfaceRole: "owner" }
    );
    expect(owner.title).toBe("손님");
    expect(owner.avatarUrl).toBe("https://c.png");

    const cache = new StoreOrderNotificationCacheHarness();
    const payload = baseEnvelope({
      chatDomain: "store_order",
      domainIdentityKey: SO_ID,
      eventId: "same-evt",
      soundKey: STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
      displayContext: {
        surfaceRole: "customer",
        orderId: "order-1",
        storeId: "store-1",
        storeName: "맛집",
        storeImageUrl: "https://s.png",
        customerName: null,
        customerAvatarUrl: null,
        messagePreview: "hi",
      },
    });
    expect(cache.apply(payload, "viewer-1", "customer").applied).toBe(true);
    expect(() =>
      cache.apply(
        {
          ...payload,
          soundKey: STORE_ORDER_SOUND_EVENT_KEY_OWNER,
          displayContext: {
            surfaceRole: "owner",
            orderId: "order-1",
            storeId: "store-1",
            storeName: null,
            storeImageUrl: null,
            customerName: "손님",
            customerAvatarUrl: null,
            messagePreview: "hi",
          },
        },
        "viewer-1",
        "owner"
      )
    ).toThrow(/cross_surface/);
  });
});

describe("Phase 9 — eventId dedupe + sound + app icon", () => {
  it("same eventId applies once", () => {
    const cache = new GeneralDirectNotificationCacheHarness();
    const payload = baseEnvelope({
      chatDomain: "general_direct",
      domainIdentityKey: GD_ID,
      soundKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
      displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "x" },
    });
    expect(cache.apply(payload, "viewer-1").applied).toBe(true);
    expect(cache.apply(payload, "viewer-1").applied).toBe(false);
    expect(cache.size).toBe(1);

    const g = new GroupNotificationCacheHarness();
    const gp = baseEnvelope({
      chatDomain: "group",
      domainIdentityKey: GROUP_ID,
      roomId: "g1",
      soundKey: GROUP_SOUND_EVENT_KEY,
      displayContext: {
        groupName: "G",
        groupImageUrl: null,
        senderName: null,
        messagePreview: "m",
      },
    });
    expect(g.apply(gp, "viewer-1").applied).toBe(true);
    expect(g.apply(gp, "viewer-1").applied).toBe(false);

    const t = new TradeNotificationCacheHarness();
    const tp = baseEnvelope({
      chatDomain: "trade",
      domainIdentityKey: TRADE_ID,
      soundKey: TRADE_SOUND_EVENT_KEY,
      displayContext: {
        productTitle: "P",
        productImageUrl: null,
        peerDisplayName: null,
        messagePreview: "m",
      },
    });
    expect(t.apply(tp, "viewer-1").applied).toBe(true);
    expect(t.apply(tp, "viewer-1").applied).toBe(false);
  });

  it("sound keys match domain + role; Native Call untouched", () => {
    expect(resolvePhase9DomainSoundKey({ chatDomain: "general_direct" })).toBe(
      PHASE9_DOMAIN_SOUND_KEYS.general_direct
    );
    expect(resolvePhase9DomainSoundKey({ chatDomain: "group" })).toBe(
      PHASE9_DOMAIN_SOUND_KEYS.group
    );
    expect(resolvePhase9DomainSoundKey({ chatDomain: "trade" })).toBe(
      PHASE9_DOMAIN_SOUND_KEYS.trade
    );
    expect(
      resolvePhase9DomainSoundKey({ chatDomain: "store_order", receiverRole: "customer" })
    ).toBe(STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER);
    expect(
      resolvePhase9DomainSoundKey({ chatDomain: "store_order", receiverRole: "owner" })
    ).toBe(STORE_ORDER_SOUND_EVENT_KEY_OWNER);

    expect(() =>
      resolvePhase9DomainSoundKey({
        chatDomain: "trade",
        title: "fallback",
      })
    ).toThrow(/copy_forbidden/);

    // general sound must not be used as trade fallback — different keys
    expect(PHASE9_DOMAIN_SOUND_KEYS.general_direct).not.toBe(PHASE9_DOMAIN_SOUND_KEYS.trade);

    for (const k of Object.values(PHASE9_DOMAIN_SOUND_KEYS)) {
      assertPhase9DoesNotTouchNativeCallSound(k);
    }
    for (const banned of PHASE9_NATIVE_CALL_SOUND_KEYS_FORBIDDEN) {
      expect(Object.values(PHASE9_DOMAIN_SOUND_KEYS)).not.toContain(banned);
    }
  });

  it("App Icon contribution uses notificationEventCount only", () => {
    const env = parseMessengerNotificationEnvelope(
      baseEnvelope({
        chatDomain: "general_direct",
        domainIdentityKey: GD_ID,
        eventId: "e1",
        soundKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
        displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "x" },
      })
    );
    const envDup = parseMessengerNotificationEnvelope(
      baseEnvelope({
        chatDomain: "general_direct",
        domainIdentityKey: GD_ID,
        eventId: "e1",
        soundKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
        displayContext: { peerDisplayName: "A", peerAvatarUrl: null, messagePreview: "x" },
      })
    );
    const env2 = parseMessengerNotificationEnvelope(
      baseEnvelope({
        chatDomain: "general_direct",
        domainIdentityKey: GD_ID,
        eventId: "e2",
        soundKey: GENERAL_DIRECT_SOUND_EVENT_KEY,
        displayContext: { peerDisplayName: "B", peerAvatarUrl: null, messagePreview: "y" },
      })
    );
    const badge = adaptNotificationEventsToAppIconContribution(
      envelopesToUnreadBadgeEvents([env, envDup, env2])
    );
    expect(badge.unit).toBe("notificationEventCount");
    expect(badge.count).toBe(2);
    expect(badge.setsOsBadge).toBe(false);

    expect(() =>
      adaptNotificationEventsToAppIconContribution([
        {
          eventId: "x",
          unread: true,
          readAt: null,
          chatDomain: "general_direct",
          setsOsBadgeDirectly: true,
        },
      ])
    ).toThrow(/must_not_set_os_badge/);
  });
});

describe("Phase 9 — wiring / isolation", () => {
  it("production wiring OFF, cutover OFF, phase order done", () => {
    expect(PHASE9_NOTIFICATION_PRODUCTION_WIRING).toBe(false);
    expect(PHASE1_DEFAULT_CUTOVER.every((c) => c.mode === "off")).toBe(true);
    const p9 = MESSENGER_DOMAIN_BUILD_PHASE_ORDER.find((p) => Number(p.phase) === 9);
    expect(p9?.status).toBe("done");
    expect(p9?.domain).toBe("notification_sound_architecture");

    const root = process.cwd();
    // production push dispatcher must not import phase9 envelope (wiring 0)
    const pushDispatcher = fs.readFileSync(
      path.join(root, "lib/notifications/pipeline/notify-push-dispatcher.ts"),
      "utf8"
    );
    expect(pushDispatcher).not.toContain("domain-notification-envelope-phase9");
    expect(pushDispatcher).not.toContain("phase9-notification");

    const badgeShell = fs.readFileSync(
      path.join(root, "lib/messenger/contracts/badge-shell-phase8a.ts"),
      "utf8"
    );
    // OS setter still forbidden until cutover
    expect(badgeShell).toContain("dibay_phase8b_app_icon_setter_forbidden_until_cutover");
  });
});
