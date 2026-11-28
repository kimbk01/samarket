"use client";

/**
 * 모임 어드민 화면 공용 (설계 moim §8 · M5) — 커뮤니티 Admin 틀(`CommunityAdminKit`)·조치 시트(`CommunityActionSheet`)를 그대로 쓴다.
 * 권한: 화면·조회·쓰기 = 권한 키 `moim` · 모임 삭제/복구·콘텐츠 삭제 = 최고관리자 (버튼은 최고관리자에게만 보인다).
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminShell } from "@/components/admin/AdminShellContext";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { isSuperAdminFromSnapshot } from "@/lib/admin-auth/admin-me-context";
import { adminAccessActorFromMe } from "@/lib/admin/access/admin-access-ui";
import { canAccessAdminRoute } from "@/lib/admin/access/admin-route-access";
import { moimAdminFailureText } from "@/lib/admin/moim/moim-admin-errors";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MoimAdminPerson } from "@/lib/admin/moim/moim-admin-contract";
import { MOIM_ADMIN_REASON_MIN_LENGTH } from "@/lib/admin/moim/moim-admin-contract";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { activeMoimReportReasons, moimReportReasonLabel, parseMoimReportReasons, type MoimPolicyLabelItem, type MoimReportReasonItem } from "@/lib/moim/moim-report-reasons";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { CommunitySheetResult } from "@/components/admin/community/kit/CommunityAdminKit";

export const MOIM_ADMIN_REASON = { minLength: MOIM_ADMIN_REASON_MIN_LENGTH } as const;

export function useMoimAdminAccess() {
  const snapshot = useAdminShell().adminMe;
  const isSuperAdmin = isSuperAdminFromSnapshot(snapshot);
  return { isSuperAdmin, known: Boolean(snapshot) };
}

/**
 * 쓰기 호출 — 조치 시트 결과 모양. 실패는 `code` = 원래 코드, `message` = 화면 문장(R5 D §1-1 `moimAdminFailureText`)
 * (시트는 409 = 다른 관리자가 먼저 처리 · 404 = 대상 없음 · 403 = 권한 없음을 그대로 처리하고, 그 밖은 `message` 를 보인다).
 */
export async function moimAdminSend(
  url: string,
  body: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  method: "POST" | "PATCH" | "PUT" = "POST"
): Promise<CommunitySheetResult> {
  const r = await moimAdminSendJson(url, body, t, method);
  return r.ok ? { ok: true } : r;
}

/** 같은 호출 + 성공 응답 본문 (신고 처리 결과의 `actions[].created` 등) */
export async function moimAdminSendJson<T extends Record<string, unknown> = Record<string, unknown>>(
  url: string,
  body: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  method: "POST" | "PATCH" | "PUT" = "POST"
): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; message: string }> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
    if (res.ok && json.ok !== false) return { ok: true, data: json as T };
    const code = json.error || `http_${res.status}`;
    return { ok: false, status: res.status, code, message: moimAdminFailureText(t, { status: res.status, code }) };
  } catch {
    return { ok: false, status: 0, code: "network_error", message: moimAdminFailureText(t, { status: 0, code: "network_error" }) };
  }
}

/**
 * R5 D24: 권한 맞춘 링크 — 열 권한이 없으면 링크 대신 글자 + 「열 권한이 없어요」(접근표 = 서버 가드와 같은 키).
 * 권한 정보를 아직 모르면(셸 스냅샷 없음) 지금처럼 링크(서버가 막음 — `historyDetailHrefForActor` 와 같은 규칙).
 */
export function MoimAdminGatedLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const { t } = useI18n();
  const actor = adminAccessActorFromMe(useAdminShell().adminMe);
  if (actor && !canAccessAdminRoute(href, actor)) {
    return (
      <span className="text-sam-muted" data-moim-admin-link-blocked={href}>
        {children} · {t("admin_moim_link_no_access")}
      </span>
    );
  }
  return (
    <Link href={href} className={className ?? "text-sam-primary hover:underline"}>
      {children}
    </Link>
  );
}

/** R5 D4·D10·D11: 모임 상태 때문에 막힌 조치 안내 한 줄 (종료 = 역할·모임장 지정 불가 · 삭제 = 조회만) */
export function MoimAdminStateNote({ status }: { status: string | null | undefined }) {
  const { t } = useI18n();
  if (status !== "closed" && status !== "deleted") return null;
  return <MoimAdminNote>{t(status === "closed" ? "admin_moim_state_note_closed" : "admin_moim_state_note_deleted")}</MoimAdminNote>;
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

/**
 * 신고 사유 표시 이름 (R4 §3) — 운영 정책의 사유 이름(앱 언어)을 먼저, 없으면 기존 문구 키, 그것도 없으면 코드.
 * 정책 목록을 모르면(`opts` 없음 · 불러오는 중) 기존 문구 키로 보인다.
 */
export function moimReasonCodeLabel(
  t: (key: MessageKey) => string,
  code: string | null | undefined,
  opts?: { lang: AppLanguageCode; reasons: readonly MoimPolicyLabelItem[] | null }
): string {
  if (!code) return "—";
  return moimReportReasonLabel(opts?.lang ?? "ko", t, code, opts?.reasons ?? null);
}

/**
 * 어드민 화면의 신고 사유 목록 — 정책 화면과 같은 GET(/api/admin/moim/policies)을 어드민 세션에서 한 번만 읽어 함께 쓴다.
 * 실패·옛 DB(열 없음) = null → 기본 12개·기존 문구 키. 정책을 저장하면 `invalidateMoimAdminReportReasons()` 로 비운다.
 */
let adminReasonsPromise: Promise<MoimReportReasonItem[] | null> | null = null;

function loadAdminReportReasons(): Promise<MoimReportReasonItem[] | null> {
  if (!adminReasonsPromise) {
    adminReasonsPromise = fetch("/api/admin/moim/policies", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ policies?: { report_reasons?: unknown } }>) : null))
      .then((json) => parseMoimReportReasons(json?.policies?.report_reasons))
      .catch(() => {
        adminReasonsPromise = null;
        return null;
      });
  }
  return adminReasonsPromise;
}

export function invalidateMoimAdminReportReasons(): void {
  adminReasonsPromise = null;
}

/** 시험 전용 */
export function __setMoimAdminReportReasonsForTests(value: MoimReportReasonItem[] | null): void {
  adminReasonsPromise = Promise.resolve(value);
}

export function useMoimAdminReportReasons(): MoimReportReasonItem[] | null {
  const [reasons, setReasons] = useState<MoimReportReasonItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadAdminReportReasons().then((v) => {
      if (alive) setReasons(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return reasons;
}

/** 화면용 — 사유 코드 → 표시 이름 (정책 데이터 우선) · 직접 제재에 고를 수 있는 켜진 사유 */
export function useMoimReasonLabel() {
  const { t, language } = useI18n();
  const reasons = useMoimAdminReportReasons();
  const label = useCallback((code: string | null | undefined) => moimReasonCodeLabel(t, code, { lang: language, reasons }), [t, language, reasons]);
  return { label, reasons, activeReasons: activeMoimReportReasons(reasons) };
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
