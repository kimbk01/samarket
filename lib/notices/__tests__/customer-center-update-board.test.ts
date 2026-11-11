/**
 * S7 「업데이트 소식」 (Owner DB 변경 승인 2026-11-01) — 게시판 종류 update · 앱 버전 · 시스템 알림 연결.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOARD_LABEL,
  CUSTOMER_CENTER_CONTENT_TYPES,
  isCustomerCenterContentType,
} from "@/lib/notices/customer-center-content";
import { validateOfficialCampaignSource } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { resolveCampaignCreateType } from "@/lib/admin/notification-campaigns/campaign-create-form";
import { resolveCampaignTargetPayload } from "@/lib/admin/notification-campaigns/resolve-campaign-target-payload";
import { resolveNotificationDestinationHintKey } from "@/lib/notifications/notification-destination-hint-key";
import { resolveNotificationDetailPresentation } from "@/lib/notifications/notification-detail-presentation";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const ID = "11111111-1111-1111-1111-111111111111";

describe("update board", () => {
  it("content type + label", () => {
    expect(CUSTOMER_CENTER_CONTENT_TYPES).toContain("update");
    expect(isCustomerCenterContentType("update")).toBe(true);
    // 앱 업데이트 v2 (D-V0): 업데이트 = 자동 업데이트 내역 페이지
    expect(BOARD_LABEL.update.ko).toBe("업데이트 내역");
  });

  it("update post is sent as a system notification and lands on the update board", () => {
    expect(resolveCampaignCreateType({ destination: "post", targetType: "all", postContentType: "update" })).toBe("system");
    const v = validateOfficialCampaignSource({
      campaign_type: "system",
      app_notice_id: ID,
      target_payload: { content_type: "update" },
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.canonical_route).toBe(`/mypage/customer-center/update/${ID}`);
    const tp = resolveCampaignTargetPayload({
      app_notice_id: ID,
      campaign_type: "system",
      target_payload: { content_type: "update" },
    } as never);
    expect(tp.ok && tp.target_payload.content_type).toBe("update");
    // notice 알림에 업데이트 글은 묶을 수 없다
    expect(
      validateOfficialCampaignSource({ campaign_type: "notice", app_notice_id: ID, target_payload: { content_type: "update" } }).ok
    ).toBe(false);
  });

  it("bell hint + detail list button + empty shortcut point at the update history page (v2)", () => {
    expect(resolveNotificationDestinationHintKey(`/mypage/customer-center/update/${ID}`)).toBe("notif_dest_hint_app_release");
    expect(
      resolveNotificationDetailPresentation({
        domain: "system",
        meta: { content_type: "update" },
        hasExternalUrl: false,
        originUnavailable: false,
      }).listCta.href
    ).toBe("/mypage/app-updates");
    expect(read("components/notifications/NotificationBellEmptyShortcuts.tsx")).toContain("/mypage/app-updates");
  });

  it("detail shows version + 「지금 업데이트」; migration adds update + app_version only", () => {
    const detail = read("components/mypage/cs/CustomerCenterBoardDetailClient.tsx");
    expect(detail).toContain('data-testid="cc-update-now"');
    expect(detail).toContain('href="/mypage/section/settings/version"');
    const mig = read("supabase/migrations/20271101050000_app_notices_update_content_type.sql");
    expect(mig).toContain("CHECK (content_type IN ('notice', 'system', 'marketing', 'update'))");
    expect(mig).toContain("ADD COLUMN IF NOT EXISTS app_version text NULL");
  });
});
