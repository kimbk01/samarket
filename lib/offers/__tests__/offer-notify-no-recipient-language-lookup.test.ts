/**
 * B1 (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §2) — 가격 제안 알림은 받는 사람 언어를 조회하지 않는다.
 * 알림 1건마다 user_settings·user_devices 조회 2건을 응답 전에 기다리던 것을 없앤다.
 * 알림함은 meta titleKey·messageKey+값으로 화면 언어로 그린다.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = fs.readFileSync(path.join(process.cwd(), "lib/offers/price-offers.server.ts"), "utf8");

describe("price offer notifications — no recipient language lookup (B1)", () => {
  it("does not load the recipient language", () => {
    expect(src).not.toContain("loadNotificationUserLanguage");
    expect(src).not.toContain("offerNotifyT");
  });

  it("keeps message keys and values in meta for accepted / rejected / received", () => {
    expect(src).toContain('titleKey: "offer_notif_received_title"');
    expect(src).toMatch(/titleKey: "offer_notif_accepted_title",\s*messageKey: "offer_notif_accepted_body",\s*vars: \{ amount \}/);
    expect(src).toMatch(/titleKey: "offer_notif_rejected_title",\s*messageKey: "offer_notif_rejected_body",\s*vars: \{ amount \}/);
  });
});
