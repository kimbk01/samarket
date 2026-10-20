"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useAdminConfirmDialog, type AdminConfirmRequest } from "@/components/admin/ui/useAdminConfirmDialog";
import { AdminPtrRevealPreview } from "@/components/admin/ptr-reveal/AdminPtrRevealPreview";
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
import type { PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";
import { PLATFORM_POPUP_FREQUENCY_MODES, type PlatformPopupFrequencyMode } from "@/lib/platform-popup/presentation-contract";
import { buildPtrRevealAdminPatch, type PtrRevealAdminForm } from "@/lib/platform-popup/ptr-reveal-admin-patch";

type Lang = "ko" | "en";

/** PTR 슬롯이 실제로 있는 화면만 선택지로 노출 (메신저·통화·결제는 정책상 제외) */
const PTR_SURFACE_OPTIONS = [
  { id: "GLOBAL", ko: "전체 (아래 화면 모두)", en: "All (every screen below)" },
  { id: "TRADE", ko: "거래 목록 (/market)", en: "Trade list (/market)" },
  { id: "COMMUNITY", ko: "커뮤니티 피드 (/philife)", en: "Community feed (/philife)" },
  { id: "DELIVERY", ko: "배달·매장 홈·목록 (/stores)", en: "Delivery & stores (/stores)" },
] as const;

const FREQUENCY_LABEL: Record<PlatformPopupFrequencyMode, { ko: string; en: string }> = {
  once_per_session: { ko: "앱 실행당 1회", en: "Once per app session" },
  once_per_day: { ko: "하루 1회", en: "Once per day" },
  once_campaign: { ko: "캠페인 기간 중 1회", en: "Once per campaign" },
  close_only: { ko: "새로고침할 때마다", en: "Every refresh" },
};

type Form = PtrRevealAdminForm;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    ctaTarget: c.ctaType === "external_url" ? "/market" : c.ctaTarget || "/market",
    externalUrl: c.externalUrl ?? "",
    surfaces: c.surfaces.length ? [...c.surfaces] : ["GLOBAL"],
    startLocal: toLocalInput(c.startAt),
    endLocal: toLocalInput(c.endAt),
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
    return b && b.imageUrl ? { creativeId: b.id, imageUrl: b.imageUrl, altText: b.altText || form.title || c.name } : null;
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
  const { language } = useI18n();
  const lang: Lang = language === "en" ? "en" : "ko";
  const L = useCallback((ko: string, en: string) => (lang === "en" ? en : ko), [lang]);
  const router = useRouter();
  const { confirm: askConfirm, dialog: confirmDialog } = useAdminConfirmDialog();

  const [detail, setDetail] = useState<PlatformPopupAdminDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  const save = async () => {
    if (!form || !saved || !detail) return;
    const body = buildPtrRevealAdminPatch(saved, form);
    if (Object.keys(body).length === 0) return;
    const live = detail.status === "active" || detail.status === "scheduled";
    const materialKeys = ["ctaType", "ctaLabel", "surfaces", "startAt", "frequencyMode", "audienceMode", "title"];
    const willReview = live && materialKeys.some((k) => k in body);
    const msg = willReview
      ? L("저장할까요? 노출 중인 광고의 노출 조건·문구가 바뀌어 다시 검토(노출 중단) 상태가 됩니다.", "Save? This changes a live ad's conditions or text, so it returns to review (exposure stops).")
      : L("변경 내용을 저장할까요?", "Save changes?");
    if (!(await askConfirm({ title: L("변경 내용 저장", "Save changes"), description: msg, confirmLabel: L("저장", "Save"), cancelLabel: L("취소", "Cancel") }))) return;
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
    setNotice(json.revertedToReview ? L("저장했습니다. 다시 검토 상태입니다.", "Saved. Back in review.") : L("저장했습니다.", "Saved."));
  };

  const cancel = async () => {
    if (!dirty) return;
    if (!(await askConfirm({ title: L("변경 취소", "Discard changes"), description: L("저장하지 않은 변경 내용을 버릴까요?", "Discard unsaved changes?"), confirmLabel: L("버리기", "Discard"), cancelLabel: L("계속 편집", "Keep editing"), tone: "danger" }))) return;
    setForm(saved);
  };

  const transition = async (body: Record<string, unknown>, confirmKo: string, confirmEn: string) => {
    if (dirty) {
      setError(L("먼저 변경 내용을 저장하거나 취소해 주세요.", "Save or cancel your changes first."));
      return;
    }
    const nextStatus = typeof body.nextStatus === "string" ? body.nextStatus : "";
    const tone: AdminConfirmRequest["tone"] = nextStatus === "rejected" || nextStatus === "paused" || nextStatus === "ended" ? "danger" : "primary";
    if (!(await askConfirm({ title: L("상태 변경", "Change status"), description: L(confirmKo, confirmEn), confirmLabel: L("확인", "Confirm"), cancelLabel: L("취소", "Cancel"), tone }))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    if (!(await askConfirm({ title: L("광고 복사", "Copy ad"), description: L("이 광고를 복사해 새 임시저장을 만들까요? (승인·기간은 복사되지 않습니다)", "Copy into a new draft? (Approval and schedule are not copied.)"), confirmLabel: L("복사", "Copy"), cancelLabel: L("취소", "Cancel") }))) return;
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
        {error ?? L("불러오는 중…", "Loading…")}
      </div>
    );
  }

  if (!isPtr) {
    return (
      <div className="space-y-2 p-4 text-sm">
        <p>{L("당겨서 새로고침 광고가 아닙니다. 팝업 관리에서 열어 주세요.", "This is not a pull-to-refresh ad. Open it from Popups.")}</p>
        <Link className="text-sam-primary underline" href={`/admin/platform-popup/${campaignId}`}>
          {L("팝업 관리로 이동", "Open in Popups")}
        </Link>
      </div>
    );
  }

  const status = detail.status;
  // 승인·노출 확인창에 실제 노출 대상을 명시 — 공개(all) 노출을 실수로 켜지 않도록
  const audienceKo =
    detail.audienceMode === "allowlist"
      ? detail.audienceUserIds.length > 0
        ? ` 노출 대상: 허용 목록 ${detail.audienceUserIds.length}명만.`
        : " 노출 대상: 허용 목록이 비어 있어 아무에게도 보이지 않습니다."
      : " 노출 대상: 전체 사용자(공개 노출)입니다.";
  const audienceEn =
    detail.audienceMode === "allowlist"
      ? detail.audienceUserIds.length > 0
        ? ` Audience: allowlist only (${detail.audienceUserIds.length} users).`
        : " Audience: empty allowlist — nobody will see it."
      : " Audience: EVERYONE (public).";
  const s = detail.eventSummary;
  const ctr = detail.derived.ctr;

  return (
    <div className="space-y-4 p-4 pb-28" data-admin-ptr-detail={campaignId}>
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/ptr-reveal-ads" className="text-xs text-sam-muted underline">
            ← {L("당겨서 새로고침 광고 목록", "Pull-to-refresh ads")}
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-sam-fg">{detail.name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <AdminToneBadge tone={status === "active" ? "success" : status === "rejected" || status === "ended" ? "danger" : "neutral"}>
              {platformPopupCampaignStatusLabel(status, lang)}
            </AdminToneBadge>
            <AdminToneBadge tone="neutral">
              {L("승인", "Approval")}: {detail.approvalStatus}
            </AdminToneBadge>
          </div>
        </div>
        <button type="button" className="rounded border border-sam-border px-3 py-1.5 text-sm" disabled={busy} onClick={() => void copy()} data-admin-ptr-copy="">
          {L("복사", "Copy")}
        </button>
      </div>

      {error ? <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <AdminCard title={L("기본 정보", "Basics")}>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                {L("광고 이름 (관리용)", "Ad name (internal)")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {L("광고 문구 (화면 낭독·대체 텍스트)", "Ad text (screen reader / alt)")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.title} maxLength={60} onChange={(e) => patch({ title: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {L("버튼 문구 (비우면 「자세히 보기」)", "Button label (empty = “Learn more”)")}
                <input className="rounded border border-sam-border px-2 py-1.5" value={form.ctaLabel} maxLength={12} onChange={(e) => patch({ ctaLabel: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {L("우선순위 (높을수록 먼저)", "Priority (higher first)")}
                <input type="number" className="w-28 rounded border border-sam-border px-2 py-1.5" value={form.priority} onChange={(e) => patch({ priority: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </AdminCard>

          <AdminCard title={L("클릭 후 이동", "After click")}>
            <div className="grid gap-2 text-sm">
              <div className="flex gap-3">
                {(["internal_page", "external_url"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1">
                    <input type="radio" checked={form.ctaType === t} onChange={() => patch({ ctaType: t })} />
                    {t === "internal_page" ? L("앱 내부 경로", "In-app path") : L("외부 링크 (HTTPS)", "External link (HTTPS)")}
                  </label>
                ))}
              </div>
              {form.ctaType === "internal_page" ?
                <input className="rounded border border-sam-border px-2 py-1.5" placeholder="/market" value={form.ctaTarget} onChange={(e) => patch({ ctaTarget: e.target.value })} />
              : <input className="rounded border border-sam-border px-2 py-1.5" placeholder="https://" value={form.externalUrl} onChange={(e) => patch({ externalUrl: e.target.value })} />}
            </div>
          </AdminCard>

          <AdminCard title={L("노출 화면", "Screens")}>
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
                {L("메신저·통화·결제·주문 확인 화면에는 표시되지 않습니다. 광고가 없는 화면은 일반 새로고침만 보입니다.", "Never shown on messenger, call, payment or order-confirmation screens. Screens without an ad show normal pull-to-refresh.")}
              </p>
            </div>
          </AdminCard>

          <AdminCard title={L("기간·빈도", "Schedule & frequency")}>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <label className="grid gap-1">
                {L("시작", "Start")}
                <input type="datetime-local" className="rounded border border-sam-border px-2 py-1.5" value={form.startLocal} onChange={(e) => patch({ startLocal: e.target.value })} />
              </label>
              <label className="grid gap-1">
                {L("종료", "End")}
                <input type="datetime-local" className="rounded border border-sam-border px-2 py-1.5" value={form.endLocal} onChange={(e) => patch({ endLocal: e.target.value })} />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                {L("한 사용자에게 보이는 빈도", "Frequency per user")}
                <select className="rounded border border-sam-border px-2 py-1.5" value={form.frequencyMode} onChange={(e) => patch({ frequencyMode: e.target.value as PlatformPopupFrequencyMode })}>
                  {PLATFORM_POPUP_FREQUENCY_MODES.map((m) => (
                    <option key={m} value={m}>
                      {lang === "en" ? FREQUENCY_LABEL[m].en : FREQUENCY_LABEL[m].ko}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-sam-muted sm:col-span-2">
                {L(`시간대: ${detail.timezone}. 노출은 이미지가 실제로 보인 새로고침만 1회로 셉니다. 과금 없음.`, `Timezone: ${detail.timezone}. An impression counts only when the image was actually shown during a refresh. No billing.`)}
              </p>
            </div>
          </AdminCard>

          <AdminCard title={L("노출 대상 (제한)", "Audience (restricted)")}>
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
                      ? L("전체 사용자", "Everyone")
                      : L("허용 목록만 (fail-closed)", "Allowlist only (fail-closed)")}
                  </label>
                ))}
              </div>
              {form.audienceMode === "allowlist" ?
                <label className="grid gap-1">
                  {L("사용자 UUID (한 줄에 하나, 또는 쉼표/공백 구분)", "User UUIDs (one per line, or comma/space separated)")}
                  <textarea
                    className="min-h-[88px] rounded border border-sam-border px-2 py-1.5 font-mono text-xs"
                    value={form.audienceUserIdsText}
                    onChange={(e) => patch({ audienceUserIdsText: e.target.value })}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    data-admin-ptr-audience-ids=""
                  />
                  <span className="text-xs text-amber-700">
                    {L(
                      "목록이 비어 있으면 누구에게도 보이지 않습니다. QA·내부 검증 전에는 허용 목록만 쓰세요.",
                      "An empty allowlist serves nobody. Use allowlist-only until QA/internal verification is done."
                    )}
                  </span>
                </label>
              : (
                <p className="text-xs text-amber-700">
                  {L(
                    "전체 사용자 모드는 Production에서 공개 노출입니다. 검증 전에는 허용 목록을 사용하세요.",
                    "Everyone mode is public exposure on Production. Prefer allowlist until verification is done."
                  )}
                </p>
              )}
            </div>
          </AdminCard>

          <AdminCard title={L("이미지 (PC에서 불러오기)", "Images (upload from PC)")}>
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
          <AdminCard title={L("기기별 미리보기", "Device preview")}>
            {previewAd ?
              <AdminPtrRevealPreview ad={previewAd} lang={lang} />
            : <p className="text-sm text-sam-muted">{L("휴대폰 띠 이미지를 올리면 미리보기가 표시됩니다.", "Upload the phone band to preview.")}</p>}
          </AdminCard>

          <AdminCard title={L("승인·운영", "Approval & operation")}>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded border border-sam-border px-3 py-1.5" disabled={busy || status !== "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "pending_review", nextApproval: "pending_review" }, "검토를 요청할까요?", "Submit for review?")}>
                {L("검토 요청", "Submit for review")}
              </button>
              <button type="button" className="rounded border border-sam-border px-3 py-1.5" disabled={busy || status === "ended" || status === "active"} data-admin-ptr-approve-schedule=""
                onClick={() => void transition({ action: "approve", schedule: true }, "승인하고 예약 노출로 둘까요? 시작 시각부터 앱에 표시됩니다." + audienceKo, "Approve and schedule? It shows in the app from the start time." + audienceEn)}>
                {L("승인 후 예약", "Approve → schedule")}
              </button>
              <button type="button" className="rounded border border-sam-primary bg-sam-primary px-3 py-1.5 text-white" disabled={busy || status === "ended" || status === "active"} data-admin-ptr-approve-activate=""
                onClick={() => void transition({ action: "approve", activate: true }, "승인하고 바로 노출할까요? 실제 앱의 새로고침 화면에 표시됩니다." + audienceKo, "Approve and go live now? It will show on real app refresh screens." + audienceEn)}>
                {L("승인 후 노출 시작", "Approve → go live")}
              </button>
              <button type="button" className="rounded border border-red-300 px-3 py-1.5 text-red-700" disabled={busy || status !== "pending_review"} data-admin-ptr-reject=""
                onClick={() => void transition({ action: "transition", nextStatus: "rejected", nextApproval: "rejected" }, "반려할까요?", "Reject this ad?")}>
                {L("반려", "Reject")}
              </button>
              <button type="button" className="rounded border border-sam-border px-3 py-1.5" disabled={busy || (status !== "active" && status !== "scheduled")} data-admin-ptr-pause=""
                onClick={() => void transition({ action: "transition", nextStatus: "paused" }, "노출을 중지할까요? 앱에서 곧바로 빠집니다.", "Stop exposure? It leaves the app shortly.")}>
                {L("노출 중지", "Stop")}
              </button>
              <button type="button" className="rounded border border-sam-border px-3 py-1.5" disabled={busy || status !== "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "active" }, "다시 노출할까요?" + audienceKo, "Resume exposure?" + audienceEn)}>
                {L("다시 노출", "Resume")}
              </button>
              <button type="button" className="rounded border border-red-300 px-3 py-1.5 text-red-700" disabled={busy || status === "ended" || status === "draft"}
                onClick={() => void transition({ action: "transition", nextStatus: "ended" }, "종료할까요? 종료한 광고는 다시 켤 수 없습니다.", "End this ad? Ended ads cannot be restarted.")}>
                {L("종료", "End")}
              </button>
            </div>
            <p className="mt-2 text-xs text-sam-muted">
              {L("반영까지 최대 5분(앱의 광고 캐시). 광고 조회가 실패해도 새로고침은 그대로 동작합니다.", "Changes reach apps within ~5 minutes (ad cache). Refresh keeps working even if the ad fails.")}
            </p>
          </AdminCard>

          <AdminCard title={L("성과", "Performance")}>
            <dl className="grid grid-cols-3 gap-2 text-sm" data-admin-ptr-stats="">
              <Stat label={L("노출", "Impressions")} value={s.impression} />
              <Stat label={L("클릭", "Clicks")} value={s.click} />
              <Stat label="CTR" value={ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`} />
              <Stat label={L("이동 성공", "Landing ok")} value={s.landing_success} />
              <Stat label={L("이동 실패", "Landing fail")} value={s.landing_failure} />
              <Stat label={L("과금", "Billing")} value={L("없음", "None")} />
            </dl>
            {Object.keys(detail.eventSummaryBySurface).length ?
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-sam-muted">
                    <th className="py-1">{L("화면", "Screen")}</th>
                    <th>{L("노출", "Impr.")}</th>
                    <th>{L("클릭", "Clicks")}</th>
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
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-sam-border bg-sam-surface px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          {dirty ? <span className="mr-auto text-xs text-amber-700">{L("저장하지 않은 변경이 있습니다", "Unsaved changes")}</span> : null}
          <button type="button" className="rounded border border-sam-border px-4 py-2 text-sm" disabled={busy || !dirty} onClick={() => void cancel()}>
            {L("취소", "Cancel")}
          </button>
          <button type="button" className="rounded bg-sam-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !dirty} onClick={() => void save()} data-admin-ptr-save="">
            {busy ? L("처리 중…", "Working…") : L("저장", "Save")}
          </button>
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
  const L = (ko: string, en: string) => (lang === "en" ? en : ko);
  const spec = PTR_BAND_SPECS[variant];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const { confirm: askConfirm, dialog: confirmDialog } = useAdminConfirmDialog();

  const required = variant === "default";
  const role =
    variant === "default" ? L(`휴대폰 (폭 ${PTR_BAND_TABLET_MIN_VIEWPORT_PX}px 미만) — 필수`, `Phones (< ${PTR_BAND_TABLET_MIN_VIEWPORT_PX}px) — required`)
    : variant === "tablet" ? L(`태블릿 (폭 ${PTR_BAND_TABLET_MIN_VIEWPORT_PX}px 이상) — 없으면 태블릿에는 광고 없음`, `Tablets (≥ ${PTR_BAND_TABLET_MIN_VIEWPORT_PX}px) — without it tablets show no ad`)
    : L("광고주 로고 — 선택, 띠 오른쪽 「광고」 표기 옆 원형", "Advertiser logo — optional, round, next to the “Ad” label on the right");

  const remove = async () => {
    if (!current) return;
    const ok = await askConfirm({
      title: L("이미지 삭제", "Delete image"),
      description: L(
        `${spec.labelKo} 이미지를 삭제할까요? 노출 중이면 다시 검토 상태가 됩니다.${variant === "tablet" ? " 태블릿에는 광고 없이 일반 새로고침만 보입니다." : ""}`,
        `Delete the ${spec.labelEn}? A live campaign returns to review.${variant === "tablet" ? " Tablets will then show normal refresh without an ad." : ""}`
      ),
      confirmLabel: L("삭제", "Delete"),
      cancelLabel: L("취소", "Cancel"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/creative?variant=${variant}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; revertedToReview?: boolean };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setMsg({ tone: "err", text: formatPlatformPopupAdminError(json.error || "delete_failed", lang) });
      return;
    }
    setMsg({ tone: "ok", text: json.revertedToReview ? L("삭제했습니다. 다시 검토 상태입니다.", "Deleted. Back in review.") : L("삭제했습니다.", "Deleted.") });
    await onUploaded();
  };

  const upload = async (file: File, applyCrop: boolean) => {
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
    setMsg({ tone: "ok", text: json.revertedToReview ? L("교체했습니다. 다시 검토 상태입니다.", "Replaced. Back in review.") : L("올렸습니다.", "Uploaded.") });
    await onUploaded();
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setMsg(null);
    const size = await readImageSize(file);
    if (!size) {
      setMsg({ tone: "err", text: L("이미지를 읽을 수 없습니다.", "Could not read the image.") });
      return;
    }
    const check = checkPtrBandSource({ variant, mime: file.type, bytes: file.size, width: size.width, height: size.height });
    if (!check.ok) {
      const text =
        check.error === "type_invalid" ? L("JPG·PNG·WEBP만 사용할 수 있습니다.", "Only JPG, PNG or WEBP.")
        : check.error === "too_large" ? L(`원본은 ${PTR_BAND_SOURCE_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.`, `Source must be ≤ ${PTR_BAND_SOURCE_MAX_BYTES / 1024 / 1024}MB.`)
        : L(`해상도가 낮습니다 (${size.width}×${size.height}). 자른 뒤 최소 ${spec.minSourceWidth}×${spec.minSourceHeight}px 필요.`, `Too small (${size.width}×${size.height}). Needs ≥ ${spec.minSourceWidth}×${spec.minSourceHeight}px after crop.`);
      setMsg({ tone: "err", text });
      return;
    }
    if (!check.ratioOk) {
      const ok = await askConfirm({
        title: L("가운데 자르기", "Center-crop"),
        description: L(
          `비율이 ${spec.aspectW}:${spec.aspectH} 이 아닙니다 (${size.width}×${size.height}). 가운데를 잘라 사용할까요?`,
          `Not ${spec.aspectW}:${spec.aspectH} (${size.width}×${size.height}). Center-crop and use it?`
        ),
        confirmLabel: L("잘라서 사용", "Crop and use"),
        cancelLabel: L("취소", "Cancel"),
      });
      if (!ok) return;
      await upload(file, true);
      return;
    }
    const ok = await askConfirm({
      title: current ? L("이미지 교체", "Replace image") : L("이미지 올리기", "Upload image"),
      description: current
        ? L(`${spec.labelKo} 이미지를 교체할까요? 노출 중이면 다시 검토 상태가 됩니다.`, `Replace the ${spec.labelEn}? A live campaign returns to review.`)
        : L(`${spec.labelKo} 이미지로 올릴까요?`, `Upload as the ${spec.labelEn}?`),
      confirmLabel: current ? L("교체", "Replace") : L("올리기", "Upload"),
      cancelLabel: L("취소", "Cancel"),
    });
    if (!ok) return;
    await upload(file, false);
  };

  return (
    <div className="rounded-ui-rect border border-sam-border p-3" data-admin-ptr-upload={variant}>
      {confirmDialog}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {lang === "en" ? spec.labelEn : spec.labelKo}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </p>
        <p className="text-xs text-sam-muted">
          {spec.width}×{spec.height} · {spec.aspectW}:{spec.aspectH} · {L("최소", "min")} {spec.minSourceWidth}×{spec.minSourceHeight} ·{" "}
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
        <button
          type="button"
          className="mt-1.5 rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
          disabled={disabled || busy}
          onClick={() => void remove()}
          data-admin-ptr-delete={variant}
        >
          {L("이미지 삭제", "Delete image")}
        </button>
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
        {busy ? L("올리는 중…", "Uploading…") : L("PC에서 파일 선택 또는 여기로 끌어다 놓기", "Choose a file from your PC or drop it here")}
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
        <p className={`mt-1.5 text-xs ${msg.tone === "err" ? "text-red-700" : msg.tone === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{msg.text}</p>
      : null}
    </div>
  );
}
