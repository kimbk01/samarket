"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { supportRequesterStatusPill } from "@/lib/support/support-status-label";
import { useSupportCategoryLabels } from "@/lib/support/use-support-category-settings";

/**
 * 문의 행 단일 모양 (최종 감사 U-10 · 2026-11-28) — 쓰기 화면 「진행 중인 문의」와 내 문의 목록(회원·사장님)이 같은 행.
 * 60px — 1줄: 「분야 · 세부」(말줄임) / 2줄: 접수 번호 · 마지막 글 시각(UI U3) · 오른쪽 상태 알약(UI U1·U2) + ›.
 * 숫자 뱃지는 고객센터 FAB 아이콘에만(Owner 2026-11-10) — 행 안에는 숫자를 그리지 않는다.
 * `surface` 는 색 토큰만 바꾼다(문의 창 = overlay 토큰, 목록 화면 = sam 토큰). 배치·크기는 같다.
 */
export function SupportCaseRowButton({
  c,
  surface,
  onOpen,
}: {
  c: SupportCaseRow;
  surface: "overlay" | "page";
  onOpen: (caseId: string) => void;
}) {
  const { t } = useI18n();
  // 분야·세부 이름 = 어드민 「문의 유형 관리」 이름 우선, 없으면 코드 기본 이름. `subject` 는 쓰지 않는다(B5).
  const labels = useSupportCategoryLabels();
  const pill = supportRequesterStatusPill(c.status, c.requester_unread_count);
  const title = [labels.categoryLabel(c.audience, c.category), labels.issueLabel(c.audience, c.category, c.issue_type)]
    .filter(Boolean)
    .join(" · ");
  const meta = [c.public_case_no, c.last_message_at ? formatMypageDate(c.last_message_at, { style: "datetime" }) : ""]
    .filter(Boolean)
    .join(" · ");
  const overlay = surface === "overlay";
  const rowAttrs = overlay
    ? { "data-support-ticket-active-row": c.id }
    : { "data-support-history-row": c.id, "data-support-history-answered": pill.tone === "answered" ? "1" : "0" };
  return (
    <button
      type="button"
      {...rowAttrs}
      data-support-case-row="1"
      onClick={() => onOpen(c.id)}
      className={`grid h-[60px] w-full grid-cols-[minmax(0,1fr)_auto_16px] grid-rows-[22px_18px] content-center gap-x-2 px-4 text-left ${
        overlay
          ? "border-b border-[var(--overlay-border)] last:border-b-0 active:bg-[var(--overlay-secondary)]"
          : "transition active:bg-sam-surface-muted"
      }`}
    >
      <span
        className={`truncate text-[14px] font-semibold ${overlay ? "text-[var(--overlay-text-primary)]" : "text-sam-fg"}`}
      >
        {title}
      </span>
      <span className={`row-span-2 self-center rounded-ui-rect px-2 py-0.5 text-[11px] font-bold ${pill.className}`}>
        {t(pill.key)}
      </span>
      <span
        className={`row-span-2 flex items-center justify-end ${
          overlay ? "text-[var(--overlay-text-secondary)]" : "text-sam-muted"
        }`}
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" strokeWidth={2} />
      </span>
      <span
        className={`col-start-1 truncate text-[12px] ${overlay ? "text-[var(--overlay-text-secondary)]" : "text-sam-muted"}`}
      >
        {meta}
      </span>
    </button>
  );
}
