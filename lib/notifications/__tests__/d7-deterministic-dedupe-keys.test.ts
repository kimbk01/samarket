/**
 * 재감사 D-7 (P-9) — 알림 중복 방지 키는 결정적이어야 한다(`Date.now()` 금지).
 * 모임 승인·거절·강퇴·차단: 실제로 상태가 바뀐 행 id(+전이 시각) — 재시도·연타는 바뀐 행 0개라 알림 없음.
 * 매장 운영 공지: 작성 1회의 request_id 필수.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const MEETING = "app/api/community/meetings/[meetingId]";

describe("D-7 meeting notification keys", () => {
  it.each([
    ["approve", "approvedMemberId", "meeting_approved:${approvedMemberId}:${now}"],
    ["reject", "rejectedMemberId", "meeting_join_rejected:${rejectedMemberId}:${now}"],
    ["kick", "kickedMemberId", "meeting_kicked:${kickedMemberId}:${kickedAt}"],
    ["ban", "banId", "meeting_banned:${banId}"],
  ])("%s: key from the changed row, notify only when a row changed", (route, idVar, key) => {
    const src = read(`${MEETING}/${route}/route.ts`);
    expect(src).not.toContain("Date.now()");
    expect(src).toContain(`if (${idVar}) {`);
    expect(src).toContain(`dedupe_key: \`${key}\``);
    expect(src).toContain('.select("id")');
  });
});

describe("D-7 admin store notice key", () => {
  it("requires request_id and never falls back to Date.now()", () => {
    const src = read("app/api/admin/stores/[id]/notify/route.ts");
    expect(src).not.toContain("Date.now()");
    expect(src).toContain('error: "request_id_required"');
    expect(src).toContain("dedupe = `admin:store_ops_notice:${sid}:${requestId}`");
  });
});

describe("D-7 remaining time-based keys (re-audit 2026-10-27)", () => {
  it("meeting join request key = pending request row id", () => {
    const src = read(`${MEETING}/join/route.ts`);
    expect(src).toContain("dedupe_key: `meeting_join_request:${joinRequestId}`");
    expect(src).toContain("if (hostNotify && joinRequestId) {");
  });

  it.each([
    ["lib/admin-business/admin-store-decision.ts", "admin_store_decision:${input.storeId}:${input.action}:${decisionAt}"],
    ["lib/notifications/member-admin-notes-service.ts", "member_admin_note:${input.threadId}:${input.messageId}"],
    ["lib/stores/notify-owner-admin-order-intervention.ts", "admin_order_intervention:${input.orderId}:${input.action}:${String("],
    ["app/api/me/stores/[storeId]/route.ts", "store_core_info_changed:${sid}:${String(patch.core_info_changed_at ?? \"\")}"],
  ])("%s: key from the changed row, never Date.now()", (rel, key) => {
    const src = read(rel);
    expect(src).toContain(key);
    expect(src).not.toMatch(/dedupe[_A-Za-z]*[:=][^\n]*Date\.now\(\)/);
  });
});
