/** 운영자 알림 최종 감사 수정 (Owner 「수정 승인」 2026-11-04) — docs/audit/admin-push-final-audit-2026-11-04.md */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memberOutcomes, memberStatsFromOutcomes } from "@/lib/admin/notification-campaigns/campaign-list-service";
import { resolveFinalOccurrenceStatusByMembers } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("M-1 방해금지 칸 분리", () => {
  it("quiet_hours 는 「설정 꺼짐」이 아니라 「방해금지」로 센다", () => {
    const stats = memberStatsFromOutcomes(
      memberOutcomes([
        { user_id: "a", channel: "push", status: "skipped", skip_reason: "quiet_hours" },
        { user_id: "b", channel: "push", status: "skipped", skip_reason: "notice_disabled" },
        { user_id: "c", channel: "push", status: "skipped", skip_reason: "token_missing" },
      ])
    );
    expect(stats.push_quiet).toBe(1);
    expect(stats.push_setting_off).toBe(1);
    expect(stats.push_none).toBe(1);
  });
});

describe("M-3 실패 회차를 같은 회차로 다시 보내지 않음", () => {
  it("발송 회차 찾기는 대기(queued)만 · 지정 회차가 failed 면 거부", () => {
    const src = read("lib/admin/notification-campaigns/campaign-create-service.ts");
    const fn = src.slice(src.indexOf("export async function resolveActiveOccurrenceForSend"));
    expect(fn.slice(0, 1600)).toContain('if (String(row.status ?? "") === "failed") return null;');
    expect(fn.slice(0, 1600)).toContain('.eq("status", "queued")');
    expect(src).not.toContain("resolveLatestQueuedOccurrenceId");
  });
});

describe("M-4 회차 상태 = 회원 단위", () => {
  it("기기 1대 실패 + 같은 회원 다른 기기 성공 = 전부 성공", () => {
    expect(
      resolveFinalOccurrenceStatusByMembers([
        { user_id: "a", status: "sent" },
        { user_id: "a", status: "failed" },
      ])
    ).toBe("sent");
  });
  it("받은 회원 + 못 받은 회원 = 일부 실패 · 못 받은 회원만 = 실패", () => {
    expect(
      resolveFinalOccurrenceStatusByMembers([
        { user_id: "a", status: "sent" },
        { user_id: "b", status: "failed" },
      ])
    ).toBe("partially_failed");
    expect(resolveFinalOccurrenceStatusByMembers([{ user_id: "b", status: "failed" }])).toBe("failed");
  });
  it("열람·닫음도 받은 것", () => {
    expect(
      resolveFinalOccurrenceStatusByMembers([
        { user_id: "a", status: "opened" },
        { user_id: "a", status: "failed" },
        { user_id: "b", status: "dismissed" },
      ])
    ).toBe("sent");
  });
});

describe("E-1 이미 읽은 알림의 푸시 탭도 열람 · 본인 기록만", () => {
  it("읽음이 안 바뀌어도 열람을 남기고, 열람·닫음 기록은 user_id 로 거른다", () => {
    const route = read("app/api/me/notifications/read/route.ts");
    expect(route).toMatch(/if \(!ok\) \{[\s\S]*?markCampaignDeliveryOpened\(sb, eventId, userId\)[\s\S]*?return NextResponse\.json\(\{ ok: false \}\);/);
    const rec = read("lib/admin/notification-campaigns/campaign-delivery-recorder.ts");
    for (const name of ["markCampaignDeliveryOpened", "markCampaignDeliveryDismissed"]) {
      const fn = rec.slice(rec.indexOf(`export async function ${name}`));
      expect(fn.slice(0, 700)).toContain('.eq("user_id", userId)');
    }
  });
});

describe("M-2 옛 동의 열 읽지 않음", () => {
  it("/api/me/settings 선택 열에 marketing_push_enabled 없음", () => {
    expect(read("lib/me/user-settings-select.ts")).not.toMatch(/"[^"]*marketing_push_enabled/);
  });
});
