/** @vitest-environment node */
/**
 * W2 — 이벤트 식별 정정 회귀 계약 (운영 DB 형태 116종 고정 픽스처).
 *
 * W2-a: 인앱 포그라운드 fallback 에 event type 단계 추가 → 푸시 dispatch 와 동일 키.
 * W2-b: mention_message → community_mention_received (인앱·푸시 공통).
 * W2-c(전용 항목 없음·포인트·리뷰 답글)는 D1 결정 전 BLOCKED — 이 테스트는 해당 형태의
 *       결정 키가 W2 이전과 동일함(임의 매핑 금지)을 고정한다.
 */
import { describe, expect, it } from "vitest";
import { adaptNotificationEventInsertToLegacyRow } from "@/lib/notifications/adapt-notification-event-realtime-row";
import {
  notificationSoundRowInputFromRecord,
  resolveNotificationSoundEventKeyFromRowWithFallback,
} from "@/lib/notifications/notification-sound-event-key-from-row";
import { NOTIFICATION_SOUND_EVENT_KEYS } from "@/lib/notifications/notification-sound-registry";
import { resolveEventKeyForPushDispatch } from "@/lib/push/dispatch/push-sound-ssot-enrichment";
import {
  W2_EVENT_SHAPES,
  W2_LEGACY_SHAPES,
  type W2EventShape,
} from "@/lib/notifications/__tests__/fixtures/notification-sound-w2-116-shapes";

const REGISTRY = new Set<string>(NOTIFICATION_SOUND_EVENT_KEYS);

function adaptEventShape(s: W2EventShape): Record<string, unknown> {
  const legacyMeta: Record<string, unknown> = {};
  if (s.kind) legacyMeta.kind = s.kind;
  if (s.role) legacyMeta.receiverRole = s.role;
  const display_payload: Record<string, unknown> = {};
  if (s.lnt) display_payload.legacyNotificationType = s.lnt;
  if (s.lpk) display_payload.legacyPushKind = s.lpk;
  if (Object.keys(legacyMeta).length) display_payload.legacyMeta = legacyMeta;
  if (s.ldom) display_payload.legacyDomain = s.ldom;
  if (s.rk) display_payload.roomKind = s.rk;
  if (s.ct) display_payload.campaignType = s.ct;
  const ev = {
    id: "e1",
    user_id: "u1",
    type: s.type,
    category: s.category,
    display_payload,
    room_id: s.rk ? "r1" : null,
    title: "t",
    body: "b",
    created_at: "2026-10-06T00:00:00.000Z",
    dedupe_key: null,
    read_at: null,
  };
  return adaptNotificationEventInsertToLegacyRow(ev as never) as Record<string, unknown>;
}

function inAppKeyForEventShape(s: W2EventShape): string {
  return resolveNotificationSoundEventKeyFromRowWithFallback(
    notificationSoundRowInputFromRecord(adaptEventShape(s))
  );
}

function pushKeyForEventShape(s: W2EventShape): string {
  const row = adaptEventShape(s);
  const meta = (row.meta && typeof row.meta === "object" ? row.meta : {}) as Record<string, unknown>;
  return resolveEventKeyForPushDispatch(
    {
      user_id: "u1",
      notification_type: row.notification_type,
      title: "t",
      body: "b",
      meta: { ...meta, domain: row.domain ?? undefined, category: s.category },
    } as never,
    { event_type: s.type } as never
  );
}

function label(s: W2EventShape): string {
  return [s.type, s.category, s.lnt, s.lpk, s.kind, s.role, s.ldom, s.rk, s.ct].join("|");
}

describe("W2 fixture integrity", () => {
  it("covers exactly 116 shapes (87 event + 29 legacy) without duplicates", () => {
    expect(W2_EVENT_SHAPES.length).toBe(87);
    expect(W2_LEGACY_SHAPES.length).toBe(29);
    expect(new Set(W2_EVENT_SHAPES.map(label)).size).toBe(87);
    expect(
      new Set(W2_LEGACY_SHAPES.map((s) => [s.nt, s.dom, s.kind, s.pk].join("|"))).size
    ).toBe(29);
  });

  it("every expected key is a registry key (36 SSOT)", () => {
    for (const s of [...W2_EVENT_SHAPES, ...W2_LEGACY_SHAPES]) {
      expect(REGISTRY.has(s.expected), s.expected).toBe(true);
    }
  });
});

describe("W2-a/W2-b — notification_events shapes (87)", () => {
  for (const s of W2_EVENT_SHAPES) {
    it(`in-app == push == expected :: ${label(s)}`, () => {
      const inApp = inAppKeyForEventShape(s);
      const push = pushKeyForEventShape(s);
      expect(inApp).toBe(s.expected);
      expect(push).toBe(s.expected);
    });
  }

  it("changes exactly the 15 audited shapes vs pre-W2 (14 W2-a + 1 W2-b)", () => {
    const changed = W2_EVENT_SHAPES.filter((s) => s.before !== s.expected);
    expect(changed.length).toBe(15);
    const mention = changed.filter((s) => s.type === "mention_message");
    expect(mention.length).toBe(1);
    expect(mention[0]!.expected).toBe("community_mention_received");
  });
});

describe("legacy notifications shapes (29) — unchanged by W2", () => {
  for (const s of W2_LEGACY_SHAPES) {
    it(`in-app == expected == before :: ${[s.nt, s.dom, s.kind, s.pk].join("|")}`, () => {
      const meta: Record<string, unknown> = {};
      if (s.kind) meta.kind = s.kind;
      if (s.pk) meta.push_kind = s.pk;
      const key = resolveNotificationSoundEventKeyFromRowWithFallback({
        notification_type: s.nt,
        domain: s.dom || null,
        meta: Object.keys(meta).length ? meta : null,
        ref_id: null,
      });
      expect(key).toBe(s.expected);
      expect(s.expected).toBe(s.before);
    });
  }
});
