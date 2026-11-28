/**
 * 고객센터 접수형 — 실기 결함 수정 (Owner 「수정 진행」 2026-11-10, Samsung SM-M156S 실기 08:43~08:52 PHT).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/i18n/messages";
import { SUPPORT_TICKET_ACTIVE_LIST_MAX, sortActiveSupportTickets } from "@/lib/support/support-ticket-form";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("실기 결함 수정", () => {
  it("1 상단 줄 라벨은 자르지 않는다(칸 = 글자 길이)", () => {
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(v).toContain('whitespace-nowrap text-[12px] text-[var(--overlay-text-secondary)]">{label}');
    expect(v).not.toContain("grid-cols-[64px_minmax(0,1fr)_auto]");
  });

  it("2 창을 닫고 다른 화면으로 갈 때 back 대신 기록 교체(내 문의·로그인·회원가입·매장 채팅)", () => {
    const h = read("components/support/SupportModalHost.tsx");
    expect(h).toContain("if (pushed) routerRef.current.replace(reason.href);");
    expect(h).toContain("closeAndNavigate(supportTicketMineHref(v.info))");
    expect(h).toContain("closeAndNavigate(`${path}?next=");
    expect(h).toContain("onOpenStoreChat={closeAndNavigate}");
    expect(h).not.toMatch(/closeSupportModal\(\);\s*router\.push/);
    expect(h).toContain('dispatchSupportModalIntent({ type: "navigate", href })');
  });

  it("3 쓰기 화면 맨 위 「진행 중인 문의」 — 답변 완료 먼저·최근 순·종료 제외·최대 5줄, 누르면 상세(뒤로 = 쓰기)", () => {
    const rows = [
      { id: "a", status: "WAITING_ADMIN", last_message_at: "2026-11-10T01:00:00Z" },
      { id: "b", status: "WAITING_USER", last_message_at: "2026-11-09T01:00:00Z" },
      { id: "c", status: "RESOLVED", last_message_at: "2026-11-10T02:00:00Z" },
      { id: "d", status: "WAITING_USER", last_message_at: "2026-11-10T03:00:00Z" },
    ];
    expect(sortActiveSupportTickets(rows).map((r) => r.id)).toEqual(["d", "b", "a"]);
    expect(SUPPORT_TICKET_ACTIVE_LIST_MAX).toBe(5);
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toMatch(/<ActiveTicketList\s+viewId=\{viewId\}\s+audience=\{state\.audience\}/);
    // 최종 감사 U-10: 행 = 공용 행(SupportCaseRowButton)
    expect(v).toContain('<SupportCaseRowButton key={c.id} c={c} surface="overlay" disabled={busy} onOpen={onOpenCase} />');
    expect(read("components/support/SupportCaseRow.tsx")).toContain("onClick={() => onOpen(c.id)}");
    const h = read("components/support/SupportModalHost.tsx");
    // 계약 §5: 진행 중 행 = open_case intent(쓰기 화면은 아래에 유지 · 뒤로 = back intent 로 상세만 뺌)
    expect(h).toMatch(/onOpenCase=\{\(caseId\) => \{\s*lastActiveRowCaseId\.current = caseId;\s*dispatchSupportModalIntent\(\{ type: "open_case", caseId \}\);/);
  });

  it("4 알림함 문구 = 「내 문의」", () => {
    expect(MESSAGES.ko.notif_dest_hint_support).toBe("내 문의에서 보기");
    expect(MESSAGES.ko.notif_detail_list_support).toBe("내 문의");
    expect(MESSAGES.ko.notif_bell_shortcut_support).toBe("내 문의");
  });

  it("5 매장 화면 비활성 「문의 접수」는 갈색이 아니라 기본 비활성 색", () => {
    // 최종 점검 M3(2026-11-28): 전송 중도 갈색 — 정말 비활성일 때만 회색. 동작 시험 = support-ui-final-check-2026-11-28.test.tsx
    expect(read("components/support/SupportTicketViews.tsx")).toContain(
      "supportPrimaryCtaToneClass(isOwner, { disabled: !canSubmit, loading: submitting })"
    );
  });

  it("관련 줄 = 매장명 먼저", () => {
    for (const f of ["components/mypage/MyStoreOrderDetailView.tsx", "components/mypage/MyStoreOrderExpandPanel.tsx"]) {
      expect(read(f), f).toContain("[order.store_name, order.order_no]");
    }
  });
});
