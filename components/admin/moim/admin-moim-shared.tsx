"use client";

/**
 * 모임 어드민 화면 공용 (설계 moim §8 · M5) — 커뮤니티 Admin 틀(`CommunityAdminKit`)·조치 시트(`CommunityActionSheet`)를 그대로 쓴다.
 * 권한: 화면·조회·쓰기 = 권한 키 `moim` · 모임 삭제/복구·콘텐츠 삭제 = 최고관리자 (버튼은 최고관리자에게만 보인다).
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { isSuperAdminFromSnapshot } from "@/lib/admin-auth/admin-me-context";
import { moimErrorKey } from "@/lib/moim/moim-client-api";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MoimAdminPerson } from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/moim/moim-admin-contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

export const MOIM_ADMIN_REASON = { minLength: MOIM_ADMIN_REASON_MIN_LENGTH } as const;

export function useMoimAdminAccess() {
  const snapshot = useAdminShell().adminMe;
  const isSuperAdmin = isSuperAdminFromSnapshot(snapshot);
  return { isSuperAdmin, known: Boolean(snapshot) };
}

/**
 * 쓰기 호출 — 조치 시트 결과 모양. 모임 오류 코드(moim_*)는 화면 문구로 바꿔 시트에 보여 준다
 * (시트는 409 = 다른 관리자가 먼저 처리 · 404 = 대상 없음 · 403 = 권한 없음을 그대로 처리한다).
 */
export async function moimAdminSend(
  url: string,
  body: unknown,
  t: (key: MessageKey) => string,
  method: "POST" | "PATCH" | "PUT" = "POST"
): Promise<CommunitySheetResult> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && json.ok !== false) return { ok: true };
    const code = json.error || `http_${res.status}`;
    return { ok: false, status: res.status, code: /^moim_[a-z_]+$/.test(code) ? t(moimErrorKey(code)) : code };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

const PLATFORM_TONE: Record<string, AdminTone> = { normal: "success", unlisted: "neutral", warned: "warning", blocked: "danger" };
const STATUS_TONE: Record<string, AdminTone> = { active: "success", closed: "neutral", deleted: "danger" };

export function MoimPlatformBadge({ value }: { value: string | null | undefined }) {
  const { t } = useI18n();
  const v = value ?? "normal";
  return <AdminToneBadge tone={PLATFORM_TONE[v] ?? "neutral"}>{t(`admin_moim_platform_${v}` as MessageKey)}</AdminToneBadge>;
}

export function MoimStatusBadge({ value }: { value: string | null | undefined }) {
  const { t } = useI18n();
  const v = value ?? "active";
  return <AdminToneBadge tone={STATUS_TONE[v] ?? "neutral"}>{t(`admin_moim_status_${v}` as MessageKey)}</AdminToneBadge>;
}

/** 콘텐츠 상태 (active·hidden·deleted) */
export function MoimContentStatusBadge({ value }: { value: string | null | undefined }) {
  const { t } = useI18n();
  const v = value ?? "active";
  const tone: AdminTone = v === "active" ? "success" : v === "hidden" ? "warning" : "danger";
  return <AdminToneBadge tone={tone}>{t(`admin_moim_content_status_${v}` as MessageKey)}</AdminToneBadge>;
}

export function moimRoleKey(role: string | null | undefined): MessageKey {
  return (["host", "co_host", "staff", "member"].includes(role ?? "") ? `moim_role_${role}` : "admin_moim_none") as MessageKey;
}

export function moimMemberStatusKey(status: string | null | undefined): MessageKey {
  return `admin_moim_member_status_${status ?? "active"}` as MessageKey;
}

export function moimReasonCodeLabel(t: (key: MessageKey) => string, code: string | null | undefined): string {
  if (!code) return "—";
  const key = `moim_report_reason_${code}` as MessageKey;
  const label = t(key);
  return label === key ? code : label;
}

/** 실제 계정 (닉네임 · DIBAY ID) → 회원 상세 */
export function MoimAdminPersonCell({ person, moimNickname }: { person: MoimAdminPerson | null | undefined; moimNickname?: string | null }) {
  const { t } = useI18n();
  if (!person) return <span className="text-sam-muted">—</span>;
  return (
    <span className="flex flex-col">
      {moimNickname ? <span className="font-medium text-sam-fg">{moimNickname}</span> : null}
      <Link href={`/admin/users/${encodeURIComponent(person.userId)}`} className="text-[12px] text-sam-primary hover:underline">
        {person.nickname?.trim() || t("admin_moim_no_name")}
        {person.dibayId ? ` · @${person.dibayId}` : ""}
      </Link>
    </span>
  );
}

export function MoimAdminTime({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-sam-muted">—</span>;
  return <span className="whitespace-nowrap">{formatAdminManilaDateTime(iso)}</span>;
}

/** 상세 섹션 제목 + 오른쪽 버튼 */
export function MoimAdminSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold text-sam-fg">{title}</h2>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export const MOIM_ADMIN_FIELD =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary";

/** 일부만 확인 안내 — 신고 행이 상한을 넘으면 묶음·필터가 일부만 센 값 */
export function MoimAdminNote({ children }: { children: ReactNode }) {
  return <p className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[12px] text-sam-muted">{children}</p>;
}

export type MoimAdminBannerState = { ok: boolean; message: string } | null;

/** 조치 결과 안내 — 완료(초록) · 다른 관리자가 먼저 처리/대상 없음(빨강, 화면은 새로 불러옴) */
export function MoimAdminBanner({ state, onClose }: { state: MoimAdminBannerState; onClose: () => void }) {
  const { t } = useI18n();
  if (!state) return null;
  return (
    <div
      role={state.ok ? "status" : "alert"}
      className={[
        "flex items-start justify-between gap-3 rounded-ui-rect border px-3 py-2 text-[13px] text-sam-fg",
        state.ok ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft",
      ].join(" ")}
    >
      <span>{state.message}</span>
      <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={onClose}>
        {t("admin_moim_close")}
      </AdminActionButton>
    </div>
  );
}

/** 조치 시트 결과 → 안내 + 다시 불러오기 */
export function useMoimSettleBanner(reload: () => void) {
  const { t } = useI18n();
  const [banner, setBanner] = useState<MoimAdminBannerState>(null);
  const settle = (kind: "done" | "stale" | "gone") => {
    setBanner({ ok: kind === "done", message: t(kind === "done" ? "admin_moim_done" : kind === "stale" ? "admin_moim_stale" : "admin_moim_gone") });
    reload();
  };
  return { banner, setBanner, settle, node: <MoimAdminBanner state={banner} onClose={() => setBanner(null)} /> };
}
