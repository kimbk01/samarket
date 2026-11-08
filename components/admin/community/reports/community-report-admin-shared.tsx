"use client";

/**
 * 커뮤니티 신고·제한 Admin 화면 공용 조각 — 결과 배너 · 오른쪽 처리 시트(드로어) · 조치 요청 래퍼 · 오류 문구.
 * 원시 오류 코드·DB 메시지는 화면에 내보내지 않는다 (설계 §C-0-1 공통 규칙).
 */
import { useCallback, type ReactNode } from "react";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminDetailDrawer } from "@/components/admin/ui/AdminDetailDrawer";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

/** 한국어 문장(기존 호출부 호환). 화면에서는 키(`admin_community_post_stale` 등)를 `t()` 로 쓴다. */
export const COMMUNITY_STALE_TEXT = translate("ko", "admin_community_post_stale");
export const COMMUNITY_AUDIT_WARNING_TEXT = translate("ko", "admin_community_report_audit_warning");
export const COMMUNITY_SIDE_EFFECT_WARNING_TEXT = translate("ko", "admin_community_report_side_effect_warning");

const COMMUNITY_ERROR_KEY: Record<string, MessageKey> = {
  use_decision_endpoint: "admin_community_report_err_use_decision",
  status_conflict: "admin_community_post_stale",
  conflict: "admin_community_post_stale",
  reopen_super_admin_only: "admin_community_report_err_reopen_super_admin",
  invalid_transition: "admin_community_report_err_invalid_transition",
  invalid_decision: "admin_community_report_err_invalid_decision",
  invalid_target_action: "admin_community_report_err_invalid_target_action",
  invalid_kind: "admin_community_report_err_invalid_kind",
  invalid_restriction: "admin_community_report_err_invalid_restriction",
  invalid_days: "admin_community_report_err_invalid_days",
  invalid_sanction: "admin_community_report_err_invalid_sanction",
  dismiss_with_action: "admin_community_report_err_dismiss_with_action",
  invalid_user_id: "admin_community_report_err_invalid_user",
  user_not_found: "admin_community_report_err_user_not_found",
  not_active: "admin_community_report_err_not_active",
  invalid_status: "admin_community_report_err_invalid_status",
  invalid_period: "admin_community_report_err_invalid_period",
  invalid_date: "admin_community_report_err_invalid_date",
  range_reversed: "admin_community_report_err_range_reversed",
  range_too_long: "admin_community_report_err_range_too_long",
  nothing_to_update: "admin_community_report_err_nothing_to_update",
};

/** DB 메시지 같은 원시 문자열은 일반 코드로 바꾼다 */
export function communitySafeCode(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  return /^[a-z][a-z0-9_]*$/i.test(c) ? c : "action_failed";
}

export function communityAdminErrorText(code: string | null | undefined, ko = true): string {
  const c = communitySafeCode(code);
  const key = COMMUNITY_ERROR_KEY[c];
  return key ? translate(ko ? "ko" : "en", key) : adminOperatorErrorMessage(c, ko);
}

export type CommunityBanner = { tone: "success" | "warning" | "error"; text: string; extra?: string[] } | null;

export function CommunityBannerView({ banner, onClose }: { banner: CommunityBanner; onClose?: () => void }) {
  if (!banner) return null;
  const cls =
    banner.tone === "success"
      ? "border-sam-success bg-sam-success-soft text-sam-fg"
      : banner.tone === "warning"
        ? "border-sam-warning bg-sam-warning-soft text-sam-fg"
        : "border-sam-danger bg-sam-danger-soft text-sam-fg";
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
        <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={onClose}>
          {adminCta("close", true)}
        </AdminActionButton>
      ) : null}
    </div>
  );
}

/** 결과에서 경고 문구 모으기 (auditWarning / sideEffectWarning). `lang` 생략 시 한국어. */
export function communityWarningsOf(json: Record<string, unknown> | null | undefined, lang: string = "ko"): string[] {
  const out: string[] = [];
  if (json?.auditWarning) out.push(translateBy(lang, "admin_community_report_audit_warning"));
  if (json?.sideEffectWarning) out.push(translateBy(lang, "admin_community_report_side_effect_warning"));
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

/**
 * 오른쪽 처리 시트 (태블릿·모바일에선 전체 화면). 조치 확인 시트는 이 위에 뜬다.
 * 표준 상세 드로어(`AdminDetailDrawer`)로 그린다 — 기존 props(title·onClose·footer) 호환.
 */
export function CommunityDrawer({
  title,
  onClose,
  children,
  footer,
  ko = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  ko?: boolean;
}) {
  // 위에 조치 시트(AdminChatActionSheet)가 떠 있으면 그 시트가 Escape·닫기를 처리한다
  const closeUnlessSheetOpen = useCallback(() => {
    if (typeof document !== "undefined" && document.querySelector("[data-admin-chat-sheet-step]")) return;
    onClose();
  }, [onClose]);
  return (
    <AdminDetailDrawer open ko={ko} title={title} onClose={closeUnlessSheetOpen} primaryActions={footer}>
      <div data-community-drawer="1">{children}</div>
    </AdminDetailDrawer>
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
