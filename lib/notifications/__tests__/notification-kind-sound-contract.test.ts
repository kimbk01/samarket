/**
 * C1 이벤트 종류 · C5 소리 1회 계약 HARD LOCK (docs/audit/notification-system-ssot-hardlock-reaudit-2026-11-01.md §3·§4).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENT_DEFINITIONS } from "@/lib/notifications/core/notification-event-registry";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/core/notification-event-types";
import { ROUTE_OWNED_BY_PIPELINE_TYPES } from "@/lib/notifications/core/notification-event-final-route";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 방·통화 경로를 해석기 키로 정하는 종류 — 저장 시 목적지 확정(C2)이 이 경로를 바꾸면 안 된다 */
const ROOM_OR_CALL_RESOLVER_KEYS = new Set([
  "chat_room",
  "group_room",
  "trade_room",
  "store_order_room",
  "missed_call",
  "call_authority",
]);

describe("C1 event kind contract", () => {
  it("every event type has exactly one registry definition with destination·sound·category", () => {
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const def = (NOTIFICATION_EVENT_DEFINITIONS as Record<string, { type: string; deepLinkResolverKey: string; eventCategory: string }>)[type];
      expect({ type, has: Boolean(def) }).toEqual({ type, has: true });
      expect(def.type).toBe(type);
      expect(def.deepLinkResolverKey).toBeTruthy();
      expect(def.eventCategory).toBeTruthy();
    }
  });

  it("C1↔C2: room/call-routed kinds keep their pipeline route; all others get a stored final route", () => {
    for (const type of NOTIFICATION_EVENT_TYPES) {
      const def = (NOTIFICATION_EVENT_DEFINITIONS as Record<string, { deepLinkResolverKey: string }>)[type];
      if (ROOM_OR_CALL_RESOLVER_KEYS.has(def.deepLinkResolverKey)) {
        expect({ type, owned: ROUTE_OWNED_BY_PIPELINE_TYPES.has(type) }).toEqual({ type, owned: true });
      }
    }
  });
});

describe("C5 one sound per event", () => {
  it("Android draws no system notification while the app is visible unless the push has no in-app row (envelope)", () => {
    const svc = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(svc).toContain("if (appVisible && FcmPayloadResolver.isStandardRouteType(type)) {");
    expect(svc).toContain("if (appVisible && !FcmPayloadResolver.isPushEnvelopePresent(data)) return;");
  });

  it("campaign pushes with an in-app row carry no envelope → foreground sound only from the web (once)", () => {
    const pres = read("lib/admin/notification-campaigns/campaign-notification-presentation.ts");
    expect(pres).toContain("const envelope: Record<string, unknown> = hasInboxRow\n    ? {}");
  });

  it("iOS shows no OS banner/sound in foreground (Capacitor presentationOptions unset) → web only", () => {
    const cfg = read("capacitor.config.ts");
    expect(cfg).not.toContain("presentationOptions");
  });
});
