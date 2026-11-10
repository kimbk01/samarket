/**
 * 언어 SSOT S9 (Owner 「권장대로 승인」 2026-11-08) — 어드민 영어만 고쳤다.
 * 두 카탈로그의 **한국어 값은 S9 전과 같아야 한다**(미사용 40키 삭제 외 변경 0). 지문 = 정렬한 [키, 값] 의 SHA-256.
 * 계획·결과: `docs/audit/i18n-s9-admin-english-plan-2026-11-08.md`
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminMiscMessages } from "@/lib/i18n/catalog/admin-misc";
import { adminOpsToolsMessages } from "@/lib/i18n/catalog/admin-ops-tools";
import { adminMemberSharedMessages } from "@/lib/i18n/catalog/admin-member-shared";

/**
 * D 단계 (2026-11-10): 회원 화면이 쓰는 키는 `admin-member-shared.ts` 로 옮겼다(값 무변경).
 * 지문은 「원래 파일 + 옮긴 키」 합집합으로 본다 — S9 계약(한국어 값 무변경)은 그대로.
 */
const MOVED_FROM_ADMIN_MISC = ["admin_api_failure", "admin_auth_failure", "admin_chat_failure", "admin_db_failure", "admin_dr_chat", "admin_dr_k02e6bf26", "admin_dr_k057a6873", "admin_dr_k4804459c", "admin_dr_k8440d176", "admin_dr_kf8751b47", "admin_exposure_k6349265b", "admin_exposure_k8ff58636", "admin_feed_emergency_k8ff58636", "admin_home_feed_k287e29e9", "admin_member_benefit_k05a628f6", "admin_member_benefit_k8ff58636", "admin_member_benefit_shop", "admin_payment_failure", "admin_personalized_feed_k287e29e9", "admin_qa_conditional_go", "admin_qa_domain_admin_console", "admin_qa_domain_chat", "admin_qa_domain_feed", "admin_qa_domain_ops", "admin_qa_domain_product", "admin_qa_domain_unknown", "admin_qa_k08ab4a3d", "admin_qa_k0c5ec3ea", "admin_qa_k1ba44067", "admin_qa_k3dc5d8a6", "admin_qa_k4b948195", "admin_qa_k628b7a8d", "admin_qa_k74a23ff7", "admin_qa_kb5fd8983", "admin_qa_open_2", "admin_qa_wont_fix", "admin_rec_deploy_rollback_2", "admin_review_k40524c64", "admin_security_ke5b6b308", "admin_security_safe", "admin_storage_failure"] as const;
const MOVED_FROM_ADMIN_OPS_TOOLS = ["admin_ops_tools_action_open", "admin_ops_tools_action_src_manual", "admin_ops_tools_board_btn_skip", "admin_ops_tools_board_today_items", "admin_ops_tools_checklist_skipped", "admin_ops_tools_kg_panel_related_default", "admin_ops_tools_learn_src_manual", "admin_ops_tools_rb_link_manual", "admin_ops_tools_rb_step_skipped", "admin_ops_tools_runbook_btn_skip", "admin_ops_tools_suggest_proposed"] as const;

function withMoved(ko: Record<string, string>, moved: readonly string[]): Record<string, string> {
  const shared = adminMemberSharedMessages.ko as Record<string, string>;
  const out: Record<string, string> = { ...ko };
  for (const k of moved) out[k] = shared[k]!;
  return out;
}

function fingerprint(ko: Record<string, string>): string {
  const entries = Object.entries(ko).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

describe("S9 어드민 카탈로그 한국어 무변경", () => {
  it("admin-misc 한국어 706키 = S9 전과 같음", () => {
    const ko = withMoved(adminMiscMessages.ko, MOVED_FROM_ADMIN_MISC);
    expect(Object.keys(ko)).toHaveLength(706);
    expect(fingerprint(ko)).toBe("ff8bae480f82d672e9e6a216ec2859efe93c57af66cee6fd587bece813e831aa");
  });

  it("admin-ops-tools 한국어 492키 = S9 전 532키 − 미사용 40키, 값 같음", () => {
    const ko = withMoved(adminOpsToolsMessages.ko, MOVED_FROM_ADMIN_OPS_TOOLS);
    expect(Object.keys(ko)).toHaveLength(492);
    expect(fingerprint(ko)).toBe("9a481c0a4cb0ae507e4ae45ee1b1d493b13e03afbbb72695979f60cf1a567381");
  });

  it("두 카탈로그 ko·en 키 집합이 같다", () => {
    for (const m of [adminMiscMessages, adminOpsToolsMessages]) {
      expect(Object.keys(m.en).sort()).toEqual(Object.keys(m.ko).sort());
    }
  });
});
