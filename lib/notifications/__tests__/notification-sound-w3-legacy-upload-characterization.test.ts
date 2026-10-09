/** @vitest-environment node */
/**
 * W3 — 매장 주문음·주문 매칭음 레거시 업로드 ↔ SSOT 연결 특성화(characterization) 계약.
 *
 * D2(레거시 업로드를 SSOT 로 연결/폐기/병행 중 무엇으로 할지) 미결정 → 동작 변경 BLOCKED.
 * 이 테스트는 정책과 무관한 현재 사실만 고정한다. D2 결정 후 의도적으로 갱신해야 하며,
 * 결정 없이 이 계약이 깨지면 승인되지 않은 동작 변경이다.
 *
 * 고정 사실:
 *  1) 레거시 업로드 라우트 2개는 admin_settings 만 쓰고 SSOT 테이블(notification_sound_*)은 쓰지 않는다.
 *  2) 재생 경로(주문 매칭 채팅)는 SSOT eventKey(delivery_order_match_chat)로만 재생한다.
 *  3) 레지스트리 자산 DIBAY-SND-030/031 은 legacy_source 로 해당 admin_settings 키를 가리킨다(참조만).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ORDER_MATCH_CHAT_ALERT_SOUND_KEY } from "@/lib/stores/order-match-alert-sound";
import { STORE_DELIVERY_ALERT_SOUND_KEY } from "@/lib/stores/store-delivery-alert-sound";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const LEGACY_UPLOAD_ROUTES = [
  "app/api/admin/order-match-chat-alert-sound/route.ts",
  "app/api/admin/store-delivery-alert-sound/route.ts",
] as const;

describe("W3 characterization (D2 BLOCKED — no behavior change)", () => {
  it("legacy keys are stable", () => {
    expect(ORDER_MATCH_CHAT_ALERT_SOUND_KEY).toBe("order_match_chat_alert_sound");
    expect(STORE_DELIVERY_ALERT_SOUND_KEY).toBe("store_delivery_alert_sound");
  });

  for (const rel of LEGACY_UPLOAD_ROUTES) {
    it(`${rel} writes admin_settings only (no SSOT table write)`, () => {
      const src = read(rel);
      expect(src).toMatch(/\.from\("admin_settings"\)\.upsert\(/);
      expect(src).not.toMatch(/notification_sound_(events|mappings|assets)/);
    });
  }

  it("order-match chat playback uses SSOT eventKey only", () => {
    const src = read("lib/notifications/play-order-match-alert.ts");
    expect(src).toContain('"delivery_order_match_chat"');
    expect(src).toContain("playEventNotificationSound(");
    expect(src).not.toContain("getOrderMatchAlertSoundUrl");
  });

  it("registry assets reference legacy keys as legacy_source only", () => {
    const src = read("lib/notifications/notification-sound-registry.ts");
    expect(src).toMatch(/DIBAY-SND-030[\s\S]{0,600}key: "store_delivery_alert_sound"/);
    expect(src).toMatch(/DIBAY-SND-031[\s\S]{0,600}key: "order_match_chat_alert_sound"/);
  });
});
