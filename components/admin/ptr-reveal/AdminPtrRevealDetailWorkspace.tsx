"use client";

import { isoToZonedLocalInput } from "@/lib/platform-popup/zoned-local-time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminStatusLabelText } from "@/lib/admin/status-labels/admin-status-label-registry";
import { PLATFORM_POPUP_APPROVAL_STATUS_NS } from "@/lib/admin/status-labels/r5-platform-status-labels";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { AdminAdDeleteAction } from "@/components/admin/ads/AdminAdDeleteAction";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { AdminPtrRevealPreview } from "@/components/admin/ptr-reveal/AdminPtrRevealPreview";
import {
  AdminPlatformPopupAuditHistory,
  type AdminPlatformPopupAuditRow,
} from "@/components/admin/platform-popup/AdminPlatformPopupAuditHistory";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupAdminDetail } from "@/lib/platform-popup/admin-campaign-loader";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { platformPopupCampaignStatusLabel } from "@/lib/platform-popup/popup-product-labels";
import {
  checkPtrBandSource,
  PTR_BAND_ALLOWED_MIME,
  PTR_BAND_SOURCE_MAX_BYTES,
  PTR_BAND_SPECS,
  PTR_BAND_TABLET_MIN_VIEWPORT_PX,
  type PtrBandVariant,
} from "@/lib/platform-popup/ptr-reveal-contract";
import { ptrRevealAccessibleText, type PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";
import { PLATFORM_POPUP_FREQUENCY_MODES, type PlatformPopupFrequencyMode } from "@/lib/platform-popup/presentation-contract";
import { buildPtrRevealAdminPatch, type PtrRevealAdminForm } from "@/lib/platform-popup/ptr-reveal-admin-patch";
import { platformPopupPatchWouldRevertToReview } from "@/lib/platform-popup/popup-admin-patch";
import {
  popupFrequencyOperatorDescription,
  popupFrequencyOperatorLabel,
} from "@/lib/admin/promotion-ownership-visibility";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";

type Lang = "ko" | "en";

/** PTR 슬롯이 실제로 있는 화면만 선택지로 노출 (메신저·통화·결제는 정책상 제외) */
const PTR_SURFACE_OPTIONS = [
  { id: "GLOBAL", ko: "전체 (아래 화면 모두)", en: "All (every screen below)" },
  { id: "HOME", ko: "홈 (/home)", en: "Home (/home)" },
  { id: "TRADE", ko: "거래 목록 (/market)", en: "Trade list (/market)" },
  { id: "COMMUNITY", ko: "커뮤니티 피드 (/philife)", en: "Community feed (/philife)" },
  { id: "DELIVERY", ko: "배달·매장 홈·목록 (/stores)", en: "Delivery & stores (/stores)" },
] as const;


type Form = PtrRevealAdminForm;

/** 재감사 E-8: 시작·종료 입력은 캠페인 시간대 벽시계(어드민 PC 시간대 아님) */
function toLocalInput(iso: string | null, timezone: string): string {
  return isoToZonedLocalInput(iso, timezone);
}

function formFromDetail(c: PlatformPopupAdminDetail): Form {
  const freq = (PLATFORM_POPUP_FREQUENCY_MODES as readonly string[]).includes(c.frequencyMode)
    ? (c.frequencyMode as PlatformPopupFrequencyMode)
    : "once_per_session";
  return {
    name: c.name,
    priority: c.priority,
    title: c.title ?? "",
    ctaLabel: c.ctaLabel ?? "",
    ctaType: c.ctaType === "external_url" ? "external_url" : "internal_page",
    // DS-5: 빈 경로를 /market 으로 채우지 않는다 — 저장 때 cta_target_required 로 막는다
    ctaTarget: c.ctaType === "external_url" ? "" : c.ctaTarget || "",
    externalUrl: c.externalUrl ?? "",
    surfaces: c.surfaces.length ? [...c.surfaces] : ["GLOBAL"],
    startLocal: toLocalInput(c.startAt, c.timezone),
    endLocal: toLocalInput(c.endAt, c.timezone),
    frequencyMode: freq,
    audienceMode: c.audienceMode === "allowlist" ? "allowlist" : "all",
    audienceUserIdsText: (c.audienceUserIds ?? []).join("\n"),
  };
}

/** 저장된 소재 + 편집 중 문구로 앱과 같은 페이로드 구성(미리보기 전용) */
function previewAdFromDetail(c: PlatformPopupAdminDetail | null, form: Form | null): PtrRevealAd | null {
  if (!c || !form) return null;
  const band = (v: PtrBandVariant) => {
    const b = c.ptrBands.find((x) => x.variant === v);
    // P-3: 앱과 같은 낭독 문구(title 우선 → 띠 대체 텍스트)
    return b && b.imageUrl
      ? { creativeId: b.id, imageUrl: b.imageUrl, altText: ptrRevealAccessibleText(form.title, b.altText, c.name) }
      : null;
  };
  const phone = band("default");
  if (!phone) return null;
  return {
    campaignId: c.id,
    surface: "TRADE",
    href: form.ctaType === "external_url" ? form.externalUrl : form.ctaTarget,
    ctaLabel: form.ctaLabel.trim() || null,
    title: form.title.trim() || null,
    frequencyMode: form.frequencyMode,
    suppressionDurationSeconds: null,
    timezone: c.timezone,
    bands: { default: phone, tablet: band("tablet"), logo: band("logo") },
  };
}

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function AdminPtrRevealDetailWorkspace({ campaignId }: { campaignId: string }) {
  const { language, t } = useI18n();
  const lang: Lang = language === "en" ? "en" : "ko";
  const router = useRouter();

  const [detail, setDetail] = useState<PlatformPopupAdminDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** P-1: 저장으로 다시 검토 상태가 되면 알림을 경고 모양으로 (팝업 상세와 같음) */
  const [noticeWarn, setNoticeWarn] = useState(false);
  const [audit, setAudit] = useState<AdminPlatformPopupAuditRow[]>([]);

  const load = useCallback(async () => {
    // 감사 이력 = 팝업 상세와 같은 `/audit` API · 같은 블록(실패해도 상세는 그대로)
    void fetch(`/api/admin/platform-popup-campaigns/${campaignId}/audit`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; items?: AdminPlatformPopupAuditRow[] }) => {
        if (j.ok) setAudit(j.items ?? []);
      })
      .catch(() => {});
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: PlatformPopupAdminDetail; error?: string };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(formatPlatformPopupAdminError(json.error || "load_failed", lang));
      return;
    }
    setDetail(json.campaign);
    const f = formFromDetail(json.campaign);
    setForm(f);
    setSaved(f);
  }, [campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const previewAd = useMemo(() => previewAdFromDetail(detail, form), [detail, form]);
  const isPtr = detail?.presentationType === "ptr_reveal";

  const patch = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));

  /** 재감사 S-2 (H-4): PTR 띠 저장·상태 변경·복사 = ads 키 */
  const writeGuard = useAdminWriteGuard("/admin/ptr-reveal-ads");
  const save = async () => {
    if (!writeGuard.guard()) return;
    if (!form || !saved || !detail) return;
    if (form.ctaType === "internal_page" && !form.ctaTarget.trim()) {
      setError(formatPlatformPopupAdminError("cta_target_required", lang));
      return;
    }
    const body = buildPtrRevealAdminPatch(saved, form, detail.timezone);
    if (Object.keys(body).length === 0) return;
    // P-9: 서버 재검토 기준과 같은 함수 — 운영자 PTR 의 기간 변경은 재검토가 아니라 경고하지 않는다
    const willReview = platformPopupPatchWouldRevertToReview(body, {
      status: detail.status,
      operatorPopup: !detail.ownerRequestId,
    });
    const msg = willReview ? t("admin_popup_review_revert_confirm") : t("admin_ptr_save_changes_confirm");
    const saveOk = await confirmAdminAction({ level: adminActionLevel("save"), ko: lang !== "en", title: t("admin_ptr_save_changes"), description: msg, confirmLabel: t("admin_ptr_save") });
    if (!saveOk.ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; revertedToReview?: boolean };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "save_failed", lang));
      return;
    }
    await load();
    setNoticeWarn(Boolean(json.revertedToReview));
    setNotice(json.revertedToReview ? t("admin_popup_review_revert_notice") : t("admin_ptr_saved"));
  };

  const cancel = async () => {
    if (!dirty) return;
    const discardOk = await confirmAdminAction({ level: adminActionLevel("save"), ko: lang !== "en", title: t("admin_ptr_discard_changes"), description: t("admin_ptr_discard_unsaved_changes"), confirmLabel: t("admin_ptr_discard"), destructive: true });
    if (!discardOk.ok) return;
    setForm(saved);
  };

  const transition = async (body: Record<string, unknown>, confirmText: string) => {
    if (!writeGuard.guard()) return;
    if (dirty) {
      setError(t("admin_ptr_save_cancel_changes_first"));
      return;
    }
    const nextStatus = typeof body.nextStatus === "string" ? body.nextStatus : "";
    // 동작 표(adminActionLevel): 검토 요청 = save(L1) · 승인(예약) = approve(L2) · 승인 후 노출·다시 노출 = exposeStart(L2) ·
    // 반려 = reject(L2) · 정지 = pause(L2 · 사유 필수 · AD2-02) · 종료 = forceCancel(L3 · 사유만 — 대상 재입력 없음, Owner 2026-11-07).
    // L2·L3 사유는 전이 API 로 보내 감사에 남긴다.
    const kind: AdminActionKind =
      body.action === "approve"
        ? body.activate
          ? "exposeStart"
          : "approve"
        : nextStatus === "active"
          ? "exposeStart"
          : nextStatus === "rejected"
            ? "reject"
            : nextStatus === "paused"
              ? "pause"
              : nextStatus === "ended"
                ? "forceCancel"
                : "save";
    const ko = lang !== "en";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(kind),
      ko,
      title: t("admin_ptr_change_status"),
      description: confirmText,
      confirmLabel:
        kind === "approve"
          ? adminCta("approve", ko)
          : kind === "exposeStart"
            ? adminCta("exposeStart", ko)
            : kind === "reject"
              ? adminCta("reject", ko)
              : kind === "pause"
                ? adminCta("exposeStop", ko)
                : kind === "forceCancel"
                  ? t("admin_ptr_end")
                  : t("admin_ptr_submit_review"),
      destructive: kind === "reject" || kind === "pause" || kind === "forceCancel",
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmed.reason ? { ...body, reason: confirmed.reason } : body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "transition_failed", lang));
      return;
    }
    await load();
  };

  const copy = async () => {
    if (!writeGuard.guard()) return;
    const copyOk = await confirmAdminAction({ level: adminActionLevel("save"), ko: lang !== "en", title: t("admin_ptr_copy_ad"), description: t("admin_ptr_copy_into_new_draft_approval"), confirmLabel: t("admin_ptr_copy") });
    if (!copyOk.ok) return;
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/copy`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(formatPlatformPopupAdminError(json.error || "copy_failed", lang));
      return;
    }
    router.push(`/admin/ptr-reveal-ads/${json.id}`);
  };

  if (!detail || !form) {
    return (
      <div className="p-4 text-sm text-sam-muted">
        {error ?? t("admin_ptr_loading")}
      </div>
    );
  }

  if (!isPtr) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <p>{t("admin_ptr_not_pull_refresh_ad_open")}</p>
        <Link className="text-sam-primary underline" href={`/admin/platform-popup/${campaignId}`}>
          {t("admin_ptr_open_popups")}
        </Link>
      </div>
    );
  }

  const status = detail.status;
  /** AL-14: 권한이 없으면 버튼을 먼저 막는다(사유를 쓴 뒤 403 이 나지 않게 · 서버와 같은 ads 키) */
  const writeBlocked = busy || !writeGuard.allowed;
  const isAdminDirect = !detail.ownerStoreId && !detail.ownerRequestId;
  const canDeleteDraft = isAdminDirect && (status === "draft" || status === "pending_review");
  // 승인·노출 확인창에 실제 노출 대상을 명시 — 공개(all) 노출을 실수로 켜지 않도록
  const audienceNote =
    " " +
    (detail.audienceMode === "allowlist"
      ? detail.audienceUserIds.length > 0
        ? t("admin_ptr_audience_allowlist_n", { n: detail.audienceUserIds.length })
        : t("admin_ptr_audience_allowlist_empty")
      : t("admin_ptr_audience_everyone_public"));
  const s = detail.eventSummary;
  const ctr = detail.derived.ctr;

  return (
    <div className="space-y-4 p-4 pb-28" data-admin-ptr-detail={campaignId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/ptr-reveal-ads" className="text-xs text-sam-muted underline">
            ← {t("admin_ptr_back_to_list")}
          </Link>
          <h1 className="mt-1 text-[20px] font-semibold text-sam-fg">{detail.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <AdminToneBadge tone={status === "active" ? "success" : status === "rejected" || status === "ended" ? "danger" : "neutral"}>
              {platformPopupCampaignStatusLabel(status, lang)}
            </AdminToneBadge>
            <AdminToneBadge tone="neutral">
              {t("admin_ptr_approval")}: {adminStatusLabelText(PLATFORM_POPUP_APPROVAL_STATUS_NS, detail.approvalStatus, lang !== "en")}
            </AdminToneBadge>
          </div>
        </div>
        <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked} onClick={() => void copy()} data-admin-ptr-copy="">
          {t("admin_ptr_copy")}
        </AdminActionButton>
      </div>

      {error ? <p className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger">{error}</p> : null}
      {notice ? (
        <p
          className={
            noticeWarn
              ? "rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-sm text-sam-warning"
              : "rounded-ui-rect border border-sam-success/30 bg-sam-success-soft px-3 py-2 text-sm text-sam-success"
          }
          role="status"
          data-admin-ptr-save-reverted={noticeWarn ? "1" : "0"}
        >
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <AdminCard title={t("admin_ptr_basics")}>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                {t("admin_ptr_ad_name_internal")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {t("admin_ptr_ad_text_screen_reader_alt")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {t("admin_ptr_button_label_empty_learn_more")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.ctaLabel} maxLength={12} onChange={(e) => patch({ ctaLabel: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {t("admin_ptr_priority_higher_first")}
                <input type="number" className="w-28 rounded border border-sam-border px-2 py-1.5" value={form.priority} onChange={(e) => patch({ priority: Number(e.target.value) || 0 })} />
                <span className="text-xs text-sam-muted" data-admin-ptr-rank-hint="">
                  {t("admin_ptr_order_specific_screens_all_priority")}
                </span>
              </label>
            </div>
          </AdminCard>

          <AdminCard title={t("admin_ptr_after_click")}>
            <div className="grid gap-2 text-sm">
              <div className="flex gap-3">
                {(["internal_page", "external_url"] as const).map((ctaKind) => (
                  <label key={ctaKind} className="flex items-center gap-1">
                    <input type="radio" checked={form.ctaType === ctaKind} onChange={() => patch({ ctaType: ctaKind })} />
                    {ctaKind === "internal_page" ? t("admin_ptr_app_path") : t("admin_ptr_external_link_https")}
                  </label>
                ))}
              </div>
              {form.ctaType === "internal_page" ?
                <input className="rounded border border-sam-border px-2 py-1.5" placeholder="/market" value={form.ctaTarget} onChange={(e) => patch({ ctaTarget: e.target.value })} />
              : <input className="rounded border border-sam-border px-2 py-1.5" placeholder="https://" value={form.externalUrl} onChange={(e) => patch({ externalUrl: e.target.value })} />}
            </div>
          </AdminCard>

          <AdminCard title={t("admin_ptr_screens")}>
            <div className="grid gap-1.5 text-sm">
              {PTR_SURFACE_OPTIONS.map((o) => {
                const checked = form.surfaces.includes(o.id);
                return (
                  <label key={o.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (o.id === "GLOBAL") patch({ surfaces: checked ? [] : ["GLOBAL"] });
                        else {
                          const rest = form.surfaces.filter((x) => x !== "GLOBAL" && x !== o.id);
                          patch({ surfaces: checked ? rest : [...rest, o.id] });
                        }
                      }}
                    />
                    {lang === "en" ? o.en : o.ko}
                  </label>
                );
              })}
              <p className="text-xs text-sam-muted">
                {t("admin_ptr_never_shown_messenger_call_payment")}
              </p>
            </div>
          </AdminCard>

          <AdminCard title={t("admin_ptr_schedule_frequency")}>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="grid gap-1">
                {t("admin_ptr_start")}
                <input type="datetime-local" className="rounded border border-sam-border px-2 py-1.5" value={form.startLocal} onChange={(e) => patch({ startLocal: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {t("admin_ptr_end")}
                <input type="datetime-local" className="rounded border border-sam-border px-2 py-1.5" value={form.endLocal} onChange={(e) => patch({ endLocal: e.target.value })} />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                {t("admin_ptr_frequency_per_user")}
                <select className="rounded border border-sam-border px-2 py-1.5" value={form.frequencyMode} onChange={(e) => patch({ frequencyMode: e.target.value as PlatformPopupFrequencyMode })}>
                  {PLATFORM_POPUP_FREQUENCY_MODES.map((m) => (
                    <option key={m} value={m}>
                      {popupFrequencyOperatorLabel(m, lang)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-sam-muted sm:col-span-2" data-admin-ptr-frequency-help="">
                {popupFrequencyOperatorDescription(form.frequencyMode, lang, "ptr")}
              </p>
              <p className="text-xs text-sam-muted sm:col-span-2">
                {t("admin_ptr_timezone_impression_note", { timezone: detail.timezone })}
              </p>
            </div>
          </AdminCard>

          <AdminCard title={t("admin_ptr_audience_restricted")}>
            <div className="grid gap-3 text-sm" data-admin-ptr-audience="">
              <div className="flex flex-wrap gap-3">
                {(["all", "allowlist"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="ptr-audience-mode"
                      checked={form.audienceMode === mode}
                      onChange={() => patch({ audienceMode: mode })}
                      data-admin-ptr-audience-mode={mode}
                    />
                    {mode === "all"
                      ? t("admin_ptr_everyone")
                      : t("admin_ptr_allowlist_only_fail_closed")}
                  </label>
                ))}
              </div>
              {form.audienceMode === "allowlist" ?
                <label className="grid gap-1">
                  {t("admin_ptr_user_uuids_one_per_line")}
                  <textarea
                    className="min-h-[88px] rounded border border-sam-border px-2 py-1.5 font-mono text-xs"
                    value={form.audienceUserIdsText}
                    onChange={(e) => patch({ audienceUserIdsText: e.target.value })}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    data-admin-ptr-audience-ids=""
                  />
                  <span className="text-xs text-sam-warning">
                    {t("admin_ptr_empty_allowlist_serves_nobody_use")}
                  </span>
                </label>
              : (
                <p className="text-xs text-sam-warning">
                  {t("admin_ptr_everyone_mode_public_exposure_production")}
                </p>
              )}
            </div>
          </AdminCard>

          <AdminCard title={t("admin_ptr_images_upload_pc")}>
            <div className="grid gap-3">
              {(["default", "tablet", "logo"] as const).map((v) => (
                <PtrBandUploadSlot
                  key={v}
                  campaignId={campaignId}
                  variant={v}
                  current={detail.ptrBands.find((b) => b.variant === v) ?? null}
                  altText={form.title}
                  lang={lang}
                  disabled={busy || status === "ended"}
                  onUploaded={load}
                />
              ))}
            </div>
          </AdminCard>
        </div>

        <div className="space-y-4">
          <AdminCard title={t("admin_ptr_device_preview")}>
            {previewAd ?
              <AdminPtrRevealPreview ad={previewAd} lang={lang} />
            : <p className="text-sm text-sam-muted">{t("admin_ptr_upload_phone_band_preview")}</p>}
          </AdminCard>

          <AdminCard title={t("admin_ptr_approval_operation")}>
            <div className="flex flex-wrap gap-2 text-sm">
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || status !== "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "pending_review", nextApproval: "pending_review" }, t("admin_ptr_submit_review_confirm"))}>
                {t("admin_ptr_submit_review")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || status === "ended" || status === "active"} data-admin-ptr-approve-schedule=""
                onClick={() => void transition({ action: "approve", schedule: true }, t("admin_ptr_approve_schedule_confirm") + audienceNote)}>
                {t("admin_ptr_approve_schedule")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || status === "ended" || status === "active"} data-admin-ptr-approve-activate=""
                onClick={() => void transition({ action: "approve", activate: true }, t("admin_ptr_approve_go_live_confirm") + audienceNote)}>
                {t("admin_ptr_approve_go_live")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || status !== "pending_review"} data-admin-ptr-reject=""
                onClick={() => void transition({ action: "transition", nextStatus: "rejected", nextApproval: "rejected" }, t("admin_ptr_reject_confirm"))}>
                {t("admin_ptr_reject")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || (status !== "active" && status !== "scheduled")} data-admin-ptr-pause=""
                onClick={() => void transition({ action: "transition", nextStatus: "paused" }, t("admin_ptr_stop_confirm"))}>
                {t("admin_ptr_stop")}
              </AdminActionButton>
              <AdminActionButton variant="secondary" size="sm" disabled={writeBlocked || status !== "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "active" }, t("admin_ptr_resume_confirm") + audienceNote)}>
                {t("admin_ptr_resume")}
              </AdminActionButton>
              <AdminActionButton variant="danger" size="sm" disabled={writeBlocked || status === "ended" || status === "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "ended" }, t("admin_ptr_end_confirm"))}>
                {t("admin_ptr_end")}
              </AdminActionButton>
              {canDeleteDraft && !writeBlocked ?
                /* 재입력 제거(Owner 2026-11-07): 삭제 = 사유만 · 공용 삭제 조치(R2) */
                <span className="contents" data-admin-ptr-delete-draft="">
                  <AdminAdDeleteAction
                    kind="ptr"
                    id={campaignId}
                    title={detail?.name?.trim() || campaignId}
                    size="sm"
                    onDone={() => router.push("/admin/ptr-reveal-ads")}
                  />
                </span>
              : null}
            </div>
            <p className="mt-2 text-xs text-sam-muted">
              {t("admin_ptr_changes_reach_apps_within_5")}
            </p>
          </AdminCard>

          <AdminCard title={t("admin_ptr_performance")}>
            <dl className="grid grid-cols-3 gap-2 text-sm" data-admin-ptr-stats="">
              <Stat label={t("admin_ptr_impressions")} value={s.impression} />
              <Stat label={t("admin_ptr_clicks")} value={s.click} />
              <Stat label="CTR" value={ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`} />
              <Stat label={t("admin_ptr_landing_ok")} value={s.landing_success} />
              <Stat label={t("admin_ptr_landing_fail")} value={s.landing_failure} />
              <Stat label={t("admin_ptr_billing")} value={t("admin_ptr_none")} />
            </dl>
            {Object.keys(detail.eventSummaryBySurface).length ?
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-sam-muted">
                    <th className="py-1">{t("admin_ptr_screen")}</th>
                    <th>{t("admin_ptr_impr")}</th>
                    <th>{t("admin_ptr_clicks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(detail.eventSummaryBySurface).map(([surf, v]) => (
                    <tr key={surf} className="border-t border-sam-border">
                      <td className="py-1">{surf}</td>
                      <td>{v.impression ?? 0}</td>
                      <td>{v.click ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            : null}
          </AdminCard>

          <AdminPlatformPopupAuditHistory items={audit} lang={lang} />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-sam-border bg-sam-surface px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          {dirty ? <span className="mr-auto text-xs text-sam-warning">{t("admin_ptr_unsaved_changes")}</span> : null}
          <AdminActionButton variant="secondary" disabled={busy || !dirty} onClick={() => void cancel()}>
            {t("admin_ptr_cancel")}
          </AdminActionButton>
          <AdminActionButton variant="primary" disabled={writeBlocked || !dirty} onClick={() => void save()} data-admin-ptr-save="">
            {busy ? t("admin_ptr_working") : t("admin_ptr_save")}
          </AdminActionButton>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-ui-rect border border-sam-border px-2 py-1.5">
      <dt className="text-xs text-sam-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function PtrBandUploadSlot({
  campaignId,
  variant,
  current,
  altText,
  lang,
  disabled,
  onUploaded,
}: {
  campaignId: string;
  variant: PtrBandVariant;
  current: PlatformPopupAdminDetail["ptrBands"][number] | null;
  altText: string;
  lang: Lang;
  disabled: boolean;
  onUploaded: () => Promise<void>;
}) {
  const { t } = useI18n();
  const spec = PTR_BAND_SPECS[variant];
  const specLabel = lang === "en" ? spec.labelEn : spec.labelKo;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  const required = variant === "default";
  const role =
    variant === "default" ? t("admin_ptr_band_role_phone", { px: PTR_BAND_TABLET_MIN_VIEWPORT_PX })
    : variant === "tablet" ? t("admin_ptr_band_role_tablet", { px: PTR_BAND_TABLET_MIN_VIEWPORT_PX })
    : t("admin_ptr_advertiser_logo_optional_round_next");

  /** 재감사 S-2 (H-4): 이미지 올리기·지우기 = ads 키 */
  const slotWriteGuard = useAdminWriteGuard("/admin/ptr-reveal-ads");
  const remove = async () => {
    if (!slotWriteGuard.guard()) return;
    if (!current) return;
    // 이미지 삭제 = delete(L3 · 사유만 — 재입력 없음, Owner 2026-11-07). 사유는 DELETE 본문으로 보내 감사에 남긴다.
    const removeOk = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko: lang !== "en",
      title: t("admin_ptr_delete_image"),
      description:
        variant === "tablet"
          ? t("admin_ptr_delete_band_confirm_tablet", { label: specLabel })
          : t("admin_ptr_delete_band_confirm", { label: specLabel }),
      confirmLabel: t("admin_ptr_delete"),
      destructive: true,
    });
    if (!removeOk.ok) return;
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/creative?variant=${variant}`, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: removeOk.reason }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; revertedToReview?: boolean };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setMsg({ tone: "err", text: formatPlatformPopupAdminError(json.error || "delete_failed", lang) });
      return;
    }
    setMsg({ tone: "ok", text: json.revertedToReview ? t("admin_ptr_deleted_back_review") : t("admin_ptr_deleted") });
    await onUploaded();
  };

  const upload = async (file: File, applyCrop: boolean) => {
    if (!slotWriteGuard.guard()) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("creativeMode", "ptr_band");
    fd.set("variant", variant);
    if (applyCrop) fd.set("applyCrop", "center");
    if (altText.trim()) fd.set("altText", altText.trim());
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/creative`, { method: "POST", credentials: "same-origin", body: fd });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; revertedToReview?: boolean };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setMsg({ tone: "err", text: json.message || formatPlatformPopupAdminError(json.error || "upload_failed", lang) });
      return;
    }
    setMsg({ tone: "ok", text: json.revertedToReview ? t("admin_ptr_replaced_back_review") : t("admin_ptr_uploaded") });
    await onUploaded();
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setMsg(null);
    const size = await readImageSize(file);
    if (!size) {
      setMsg({ tone: "err", text: t("admin_ptr_could_not_read_image") });
      return;
    }
    const check = checkPtrBandSource({ variant, mime: file.type, bytes: file.size, width: size.width, height: size.height });
    if (!check.ok) {
      const text =
        check.error === "type_invalid" ? t("admin_ptr_only_jpg_png_webp")
        : check.error === "too_large" ? t("admin_ptr_source_max_mb", { mb: PTR_BAND_SOURCE_MAX_BYTES / 1024 / 1024 })
        : t("admin_ptr_resolution_too_low", { width: size.width, height: size.height, minWidth: spec.minSourceWidth, minHeight: spec.minSourceHeight });
      setMsg({ tone: "err", text });
      return;
    }
    if (!check.ratioOk) {
      const cropOk = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko: lang !== "en",
        title: t("admin_ptr_center_crop"),
        description: t("admin_ptr_ratio_crop_confirm", {
          aspectW: spec.aspectW,
          aspectH: spec.aspectH,
          width: size.width,
          height: size.height,
        }),
        confirmLabel: t("admin_ptr_crop_use"),
      });
      if (!cropOk.ok) return;
      await upload(file, true);
      return;
    }
    const uploadOk = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: lang !== "en",
      title: current ? t("admin_ptr_replace_image") : t("admin_ptr_upload_image"),
      description: current
        ? t("admin_ptr_replace_band_confirm", { label: specLabel })
        : t("admin_ptr_upload_band_confirm", { label: specLabel }),
      confirmLabel: current ? t("admin_ptr_replace") : t("admin_ptr_upload"),
    });
    if (!uploadOk.ok) return;
    await upload(file, false);
  };

  return (
    <div className="rounded-ui-rect border border-sam-border p-3" data-admin-ptr-upload={variant}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {specLabel}
          {required ? <span className="ml-1 text-sam-danger">*</span> : null}
        </p>
        <p className="text-xs text-sam-muted">
          {spec.width}×{spec.height} · {spec.aspectW}:{spec.aspectH} · {t("admin_ptr_min")} {spec.minSourceWidth}×{spec.minSourceHeight} ·{" "}
          {PTR_BAND_ALLOWED_MIME.map((m) => m.replace("image/", "").toUpperCase()).join("/")} · ≤{PTR_BAND_SOURCE_MAX_BYTES / 1024 / 1024}MB
        </p>
      </div>
      <p className="mt-0.5 text-xs text-sam-muted">{role}</p>
      {current?.imageUrl ?
        // eslint-disable-next-line @next/next/no-img-element -- 관리자 원본 확인
        <img
          src={current.imageUrl}
          alt=""
          className={`mt-2 border border-sam-border ${variant === "logo" ? "h-16 w-16 rounded-full object-cover" : "w-full"}`}
        />
      : null}
      {current ?
        <AdminActionButton
          variant="danger"
          size="sm"
          className="mt-1.5"
          disabled={disabled || busy}
          onClick={() => void remove()}
          data-admin-ptr-delete={variant}
        >
          {t("admin_ptr_delete_image")}
        </AdminActionButton>
      : null}
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || busy}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && !busy) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled && !busy) void onFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`mt-2 flex cursor-pointer items-center justify-center rounded-ui-rect border-2 border-dashed px-3 py-4 text-center text-sm ${
          drag ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"
        } ${disabled || busy ? "cursor-not-allowed opacity-60" : ""}`}
      >
        {busy ? t("admin_ptr_uploading") : t("admin_ptr_choose_file_pc_drop_here")}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={PTR_BAND_ALLOWED_MIME.join(",")}
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {msg ?
        <p className={`mt-1.5 text-xs ${msg.tone === "err" ? "text-sam-danger" : msg.tone === "warn" ? "text-sam-warning" : "text-sam-success"}`}>{msg.text}</p>
      : null}
    </div>
  );
}
