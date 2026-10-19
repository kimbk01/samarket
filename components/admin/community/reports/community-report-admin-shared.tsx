"use client";

/**
 * 커뮤니티 신고·제한 Admin 화면 공용 조각 — 결과 배너 · 오른쪽 처리 시트(드로어) · 조치 요청 래퍼 · 오류 문구.
 * 원시 오류 코드·DB 메시지는 화면에 내보내지 않는다 (설계 §C-0-1 공통 규칙).
 */
import { useEffect, type ReactNode } from "react";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

export const COMMUNITY_STALE_TEXT = "다른 관리자가 먼저 변경했습니다 — 최신 내용으로 다시 불러왔습니다";
export const COMMUNITY_AUDIT_WARNING_TEXT =
  "처리는 완료됐지만 운영 기록 저장에 실패했습니다. 시스템 관리자에게 알려 주세요.";
export const COMMUNITY_SIDE_EFFECT_WARNING_TEXT =
  "처리는 완료됐지만 알림 발송 또는 포인트 회수 일부가 실패했습니다. 회원 화면에서 확인해 주세요.";

const COMMUNITY_ERROR_TEXT: Record<string, string> = {
  use_decision_endpoint: "신고 인정·기각은 「신고 인정」/「신고 기각」 버튼으로 처리해 주세요.",
  status_conflict: COMMUNITY_STALE_TEXT,
  conflict: COMMUNITY_STALE_TEXT,
  reopen_super_admin_only: "다시 열기는 최고 관리자만 할 수 있습니다.",
  invalid_transition: "현재 신고 상태에서는 할 수 없는 처리입니다.",
  invalid_decision: "처리 결과를 다시 선택해 주세요.",
  invalid_target_action: "콘텐츠 조치를 다시 선택해 주세요.",
  invalid_kind: "회원 조치 종류를 다시 선택해 주세요.",
  invalid_restriction: "제한 범위를 선택해 주세요.",
  invalid_days: "제한 기간을 다시 선택해 주세요.",
  invalid_sanction: "회원 조치를 다시 선택해 주세요.",
  dismiss_with_action: "신고 기각에는 콘텐츠·회원 조치를 함께 할 수 없습니다.",
  invalid_user_id: "회원을 다시 선택해 주세요.",
  user_not_found: "회원을 찾을 수 없습니다.",
  not_active: "이미 해제되었거나 기간이 끝난 제한입니다.",
  invalid_status: "선택한 상태 값이 올바르지 않습니다.",
  invalid_period: "기간을 다시 선택해 주세요.",
  invalid_date: "날짜를 다시 확인해 주세요.",
  range_reversed: "시작일이 종료일보다 늦습니다.",
  range_too_long: "기간이 너무 깁니다. 400일 이내로 지정해 주세요.",
  nothing_to_update: "바뀐 내용이 없습니다.",
};

/** DB 메시지 같은 원시 문자열은 일반 코드로 바꾼다 */
export function communitySafeCode(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  return /^[a-z][a-z0-9_]*$/i.test(c) ? c : "action_failed";
}

export function communityAdminErrorText(code: string | null | undefined, ko = true): string {
  const c = communitySafeCode(code);
  return COMMUNITY_ERROR_TEXT[c] ?? adminOperatorErrorMessage(c, ko);
}

export type CommunityBanner = { tone: "success" | "warning" | "error"; text: string; extra?: string[] } | null;

export function CommunityBannerView({ banner, onClose }: { banner: CommunityBanner; onClose?: () => void }) {
  if (!banner) return null;
  const cls =
    banner.tone === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : banner.tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-red-300 bg-red-50 text-red-900";
  return (
    <div
      data-admin-result={banner.tone === "error" ? "error" : banner.tone}
      role={banner.tone === "success" ? "status" : "alert"}
      className={`flex items-start justify-between gap-3 rounded-ui-rect border px-3 py-2 text-[13px] ${cls}`}
    >
      <div className="min-w-0 space-y-1">
        <p>{banner.text}</p>
        {banner.extra?.map((t) => (
          <p key={t}>{t}</p>
        ))}
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} className="shrink-0 font-medium underline">
          닫기
        </button>
      ) : null}
    </div>
  );
}

/** 결과에서 경고 문구 모으기 (auditWarning / sideEffectWarning) */
export function communityWarningsOf(json: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  if (json?.auditWarning) out.push(COMMUNITY_AUDIT_WARNING_TEXT);
  if (json?.sideEffectWarning) out.push(COMMUNITY_SIDE_EFFECT_WARNING_TEXT);
  return out;
}

/** 조치 요청 — 시트 결과 형태 + 응답 JSON (경고 플래그 등) */
export async function communityActionFetch(
  url: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>
): Promise<{ result: CommunitySheetResult; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json.ok !== false) return { result: { ok: true }, json };
    return {
      result: { ok: false, status: res.status, code: communitySafeCode(String(json.error ?? `http_${res.status}`)) },
      json,
    };
  } catch {
    return { result: { ok: false, status: 0, code: "network_error" }, json: {} };
  }
}

/** 오른쪽 처리 시트 (태블릿·모바일에선 전체 화면). 조치 확인 시트는 이 위에 뜬다. */
export function CommunityDrawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 위에 조치 시트가 떠 있으면 그 시트가 Escape 를 처리한다
      if (e.key === "Escape" && !document.querySelector("[data-admin-chat-sheet-step]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1200] flex justify-end" data-community-drawer="1">
      <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-2xl flex-col bg-sam-app shadow-xl"
      >
        <header className="flex items-center justify-between gap-2 border-b border-sam-border bg-sam-surface px-4 py-3">
          <h2 className="truncate text-[15px] font-semibold text-sam-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-ui-rect border border-sam-border px-3 py-1 text-[13px] font-medium text-sam-fg"
          >
            닫기
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <footer className="border-t border-sam-border bg-sam-surface px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}

/** 상세 영역 제목 (①②③④ 고정 순서) */
export function CommunitySection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-sam-fg">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** 본문 미리보기 — 태그 제거 + 길이 제한 */
export function communityPlainExcerpt(raw: string | null | undefined, max = 200): string {
  const s = String(raw ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
