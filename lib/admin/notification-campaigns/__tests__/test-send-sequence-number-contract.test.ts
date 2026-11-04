import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ensureCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";

/** PostgreSQL `integer` / int4 upper bound. */
const PG_INT4_MAX = 2_147_483_647;

/**
 * 확정 설계 B-12 (2026-11-04) — 회차 번호는 DB 함수 `ensure_admin_notification_campaign_occurrence` 가
 * 캠페인 행을 잠그고 배정한다(「최대값 읽고 +1」 경쟁 제거 · 마이그레이션 20271105090000).
 */
describe("occurrence sequence number contract", () => {
  it("test-send never computes a sequence (no Date.now(), no client max+1)", () => {
    const src = readFileSync(
      // 테스트 발송 본문은 서비스 1곳 (`[campaignId]/test-send` · v3 `test-send` 두 경로가 공유).
      join(process.cwd(), "lib/admin/notification-campaigns/campaign-test-send-service.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/getNextOccurrenceSequenceNumber/);
    expect(src).not.toMatch(/sequenceNumber\s*[:=]/);
    expect(src).not.toMatch(/Date\.now\s*\(\)\s*,?\s*\/\/?\s*sequence/);
  });

  it("Date.now() epoch ms exceeds PostgreSQL integer (must not be used as sequence)", () => {
    expect(Date.now()).toBeGreaterThan(PG_INT4_MAX);
  });

  it("ensureCampaignOccurrence without a number asks the DB to assign one (p_sequence_number null)", async () => {
    const rpc = vi.fn(async () => ({ data: { id: "occ-1", sequence_number: 42 }, error: null }));
    const out = await ensureCampaignOccurrence({ rpc } as never, {
      campaignId: "c1",
      triggerType: "test",
      campaign: {
        title: "t",
        body: "b",
        type: "notice",
        channel: "push_and_in_app",
        target_type: "all",
        deeplink_url: null,
        web_url: null,
        push_image_url: null,
        in_app_image_url: null,
      },
    });
    expect(out.ok).toBe(true);
    const args = (rpc.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(args.p_sequence_number).toBeNull();
  });

  it("migration assigns the number under a campaign row lock and rejects a different trigger type on the same number", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20271105090000_admin_push_stage_c.sql"),
      "utf8"
    );
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/occurrence_sequence_conflict/);
  });
});
