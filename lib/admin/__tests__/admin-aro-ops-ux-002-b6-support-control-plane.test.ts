import { describe, expect, it } from "vitest";
import { copyAdminB4Ops1Messages } from "@/lib/i18n/catalog/copy-admin-b4-ops1";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldPlayAdminOpsSound } from "@/lib/admin/admin-ops-sound-decision";
import { ADMIN_OPS_SOUND_FALLBACK_SOURCES } from "@/lib/admin/admin-ops-sound-event-key";
import { isAdminSoundEligible } from "@/lib/notifications/admin-notification-sound-policy";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("ARO-OPS-UX-002-B6 support / notification control plane", () => {
  it("control plane (구조 확인): 호출처 0 인 read-model·API 는 삭제됨(고객 문의 최종 점검 L11) · 문구 키는 그대로", () => {
    expect(existsSync(resolve(process.cwd(), "lib/admin/support-control-plane/load-support-control-plane.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "app/api/admin/support-control-plane/route.ts"))).toBe(false);
    expect(copyAdminB4Ops1Messages.en.admin_support_member_2).toBe("Member");
    expect(copyAdminB4Ops1Messages.en.admin_support_owner).toBe("Owner");
  });

  it("mounts on canonical /admin/support (no support-v2)", () => {
    const page = read("components/admin/support/AdminSupportPage.tsx");
    // Console redesign (Owner-approved 2026-10-05): the duplicated control-plane card sections
    // are no longer mounted on the console — status tabs with counts replace them.
    expect(page).not.toContain("<AdminSupportControlPlane");
    expect(page).toContain("ADMIN_SUPPORT_TABS");
    expect(page).toContain("data-admin-support-tab");
    // 탭 이름 표는 공용 정의로 옮김 (고객센터 최종 감사 2026-11-28 U-6)
    expect(page).toContain("ADMIN_SUPPORT_TAB_LABEL_KEY");
    expect(read("components/admin/support/admin-support-status.ts")).toContain("ACTIONABLE");
    expect(page).toContain("waitingAgeLabel");
    expect(existsSync(resolve(process.cwd(), "app/admin/support-v2"))).toBe(false);
  });

  it("preserves Support ≠ Messenger and reply≠resolve contracts", () => {
    const svc = read("lib/support/support-case-service.ts");
    // Phase 2 (DEF-05): reply→WAITING_USER now lives in the atomic support_append_message RPC.
    expect(svc).toContain('sb.rpc("support_append_message"');
    expect(read("supabase/migrations/20270415120000_support_audit_phase2_atomic_append.sql")).toContain("SET status = 'WAITING_USER'");
    expect(svc).toContain("adminReplySupportCase");
    expect(svc).toContain("adminUpdateSupportCaseStatus");
    // 고객 문의 SSOT §8 F10 (2026-11-27): 답변과 종료는 별도 동작 — 답변 안에 종료 옵션이 없다.
    expect(svc).not.toContain("closeAfter");
    // 전체 수정 D-2 (2026-11-29): 목록 기준 = 탭 하나 — 옛 filter 는 화면과 같은 변환으로 탭
    expect(svc).toContain("adminSupportTabFromLegacyFilter(input.filter)");
    expect(copyAdminB4Ops1Messages.en.admin_support_support_messenger_notifications_are_not_support).toContain(
      "Support ≠ Messenger"
    );
  });

  it("notification RT + deeplinks use existing sound authority", () => {
    // Phase 3 A1 — awareness source = customer PUBLIC message; case row never sounds/toasts.
    expect(ADMIN_OPS_SOUND_FALLBACK_SOURCES).toContain("support_messages");
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "support_messages",
        newRow: { sender_type: "MEMBER", message_type: "PUBLIC" },
      })
    ).toBe(true);
    expect(
      shouldPlayAdminOpsSound({
        eventType: "INSERT",
        sourceTable: "support_messages",
        newRow: { sender_type: "OWNER", message_type: "PUBLIC" },
      })
    ).toBe(true);
    for (const newRow of [
      { sender_type: "ADMIN", message_type: "PUBLIC" },
      { sender_type: "ADMIN", message_type: "INTERNAL_NOTE" },
      { sender_type: "SYSTEM", message_type: "PUBLIC" },
    ]) {
      expect(
        shouldPlayAdminOpsSound({ eventType: "INSERT", sourceTable: "support_messages", newRow })
      ).toBe(false);
    }
    // Admin assign / priority / read / reopen only UPDATE the case row → never a toast.
    for (const [eventType, oldRow, newRow] of [
      ["INSERT", null, { status: "OPEN" }],
      ["UPDATE", { id: "x" }, { status: "WAITING_ADMIN" }],
      ["UPDATE", { id: "x" }, { status: "OPEN" }],
      ["UPDATE", { status: "WAITING_USER" }, { status: "WAITING_ADMIN" }],
    ] as const) {
      expect(
        shouldPlayAdminOpsSound({ eventType, sourceTable: "support_cases", oldRow, newRow })
      ).toBe(false);
    }
    expect(isAdminSoundEligible("support_messages")).toBe(true);

    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    expect(provider).toContain('table: "support_cases"');
    expect(provider).toContain('table: "support_messages"');
    expect(provider).toContain("/admin/support/");
    expect(provider).toContain("markSupportMessageAlert");
    expect(provider).not.toContain("markSupportCaseAlert");

    const ac = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ac).toContain("filter=ACTIONABLE#action-required");
  });
});
