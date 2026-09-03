"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import type { PlatformPopupAdminDetail } from "@/lib/platform-popup/admin-campaign-loader";
import {
  PLATFORM_POPUP_CTA_TYPES,
  PLATFORM_POPUP_DEFAULT_TIMEZONE,
  PLATFORM_POPUP_SUPPRESSION_MODES,
  type PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";
import {
  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS,
  adminTargetModeFromSurfaces,
  surfacesFromAdminTargetMode,
  type PlatformPopupAdminSurfaceMode,
} from "@/lib/platform-popup/admin-surface-target-mode";
import {
  DIBAY_CANONICAL_POPUP_CREATIVE_SIZE,
  PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS,
} from "@/lib/platform-popup/creative-pixel-ssot";
import {
  buildPlatformPopupCenterCropPreviewUrl,
  readPlatformPopupImageMeta,
  type PlatformPopupClientImageMeta,
} from "@/lib/platform-popup/client-creative-crop-preview";
import { CAMPAIGN_IMAGE_MAX_BYTES } from "@/lib/admin/notification-campaigns/validate-campaign-image";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type AuditRow = {
  id: string;
  action: string;
  actor_type: string;
  created_at: string;
  after_json?: unknown;
};

export function AdminPlatformPopupDetailWorkspace({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const [campaign, setCampaign] = useState<PlatformPopupAdminDetail | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [needsCrop, setNeedsCrop] = useState(false);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<PlatformPopupClientImageMeta | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [timezone, setTimezone] = useState<string>(PLATFORM_POPUP_DEFAULT_TIMEZONE);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [surfaceMode, setSurfaceMode] = useState<PlatformPopupAdminSurfaceMode>("GLOBAL");
  const [suppressionMode, setSuppressionMode] = useState("TODAY");
  const [durationSec, setDurationSec] = useState<number | "">("");
  const [ctaType, setCtaType] = useState("internal_page");
  const [ctaTarget, setCtaTarget] = useState("/market");
  const [externalUrl, setExternalUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [previewOverrideUrl, setPreviewOverrideUrl] = useState<string | null>(null);

  const hydrate = useCallback((c: PlatformPopupAdminDetail) => {
    setCampaign(c);
    setName(c.name);
    setPriority(c.priority);
    setTimezone(c.timezone || PLATFORM_POPUP_DEFAULT_TIMEZONE);
    setStartLocal(toLocalInput(c.startAt));
    setEndLocal(toLocalInput(c.endAt));
    setSurfaceMode(adminTargetModeFromSurfaces(c.surfaces));
    setSuppressionMode(c.suppressionMode);
    setDurationSec(c.suppressionDurationSeconds ?? "");
    setCtaType(c.ctaType);
    setCtaTarget(c.ctaTarget || "");
    setExternalUrl(c.externalUrl || "");
    setAltText(c.creative?.altText || "");
    setPreviewOverrideUrl(null);
    setDirty(false);
    setNeedsCrop(false);
    setPendingCropFile(null);
    setFileMeta(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const [detailRes, auditRes] = await Promise.all([
      fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, { credentials: "same-origin" }),
      fetch(`/api/admin/platform-popup-campaigns/${campaignId}/audit`, { credentials: "same-origin" }),
    ]);
    const detailJson = (await detailRes.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: PlatformPopupAdminDetail;
      error?: string;
    };
    if (!detailRes.ok || !detailJson.ok || !detailJson.campaign) {
      setError(detailJson.error || "load_failed");
      return;
    }
    hydrate(detailJson.campaign);
    const auditJson = (await auditRes.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: AuditRow[];
    };
    if (auditJson.ok) setAudit(auditJson.items ?? []);
  }, [campaignId, hydrate]);

  useEffect(() => {
    void load();
  }, [load]);

  const ctaHrefPreview = useMemo(() => {
    const r = validatePlatformPopupCta({
      ctaType,
      ctaTarget,
      externalUrl: externalUrl || null,
    });
    return r.ok ? r.value.href : "";
  }, [ctaType, ctaTarget, externalUrl]);

  const previewSource = useMemo(() => {
    const imageUrl = previewOverrideUrl || campaign?.creative?.imageUrl || "";
    if (!imageUrl || !campaign) return null;
    return {
      campaignId: campaign.id,
      creativeId: campaign.creative?.id || "preview",
      imageUrl,
      altText: altText || campaign.creative?.altText || "Advertisement",
      ctaHref: ctaHrefPreview || "/market",
      ctaType,
      surface: surfaceMode === "GLOBAL" ? "TRADE" : surfaceMode,
      suppressionMode,
      suppressionDurationSeconds:
        durationSec === "" ? null : Number(durationSec) > 0 ? Number(durationSec) : null,
      timezone,
      unsaved: dirty || Boolean(previewOverrideUrl),
    };
  }, [
    campaign,
    previewOverrideUrl,
    altText,
    ctaHrefPreview,
    ctaType,
    surfaceMode,
    suppressionMode,
    durationSec,
    timezone,
    dirty,
  ]);

  const markDirty = () => setDirty(true);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        priority,
        timezone,
        startAt: fromLocalInput(startLocal),
        endAt: fromLocalInput(endLocal),
        surfaces: surfacesFromAdminTargetMode(surfaceMode),
        suppressionMode,
        suppressionDurationSeconds: durationSec === "" ? null : Number(durationSec),
        ctaType,
        ctaTarget,
        externalUrl: externalUrl || null,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.error || "save_failed");
      return;
    }
    await load();
  };

  const transition = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.error || "transition_failed");
      return;
    }
    await load();
  };

  const uploadCreative = async (file: File, applyCrop: boolean) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    if (applyCrop) fd.set("applyCrop", "center");
    if (altText) fd.set("altText", altText);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${campaignId}/creative`, {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      url?: string;
      message?: string;
    };
    setBusy(false);
    if (json.error === "needs_crop") {
      setNeedsCrop(true);
      setPendingCropFile(file);
      setError(json.message || "36:25 비율의 이미지를 사용해 주세요.");
      return;
    }
    if (!res.ok || !json.ok) {
      setError(json.message || json.error || "upload_failed");
      return;
    }
    setNeedsCrop(false);
    setPendingCropFile(null);
    setFileMeta(null);
    setPreviewOverrideUrl(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    await load();
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setNeedsCrop(false);
    setPendingCropFile(null);
    setCropPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewOverrideUrl(null);

    if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
      setError("이미지 용량이 너무 큽니다. 2MB 이하로 올려 주세요.");
      setFileMeta(null);
      return;
    }
    const mime = (file.type || "").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setError("JPG, PNG, WEBP 이미지만 사용할 수 있습니다.");
      setFileMeta(null);
      return;
    }

    try {
      const meta = await readPlatformPopupImageMeta(file);
      setFileMeta(meta);
      if (!meta.ratioOk) {
        const preview = await buildPlatformPopupCenterCropPreviewUrl(file);
        setCropPreviewUrl(preview.objectUrl);
        setPreviewOverrideUrl(preview.objectUrl);
        setNeedsCrop(true);
        setPendingCropFile(file);
        setError("36:25 비율이 아닙니다. 아래 크롭 결과를 확인한 뒤 적용해 주세요.");
        return;
      }
      await uploadCreative(file, false);
    } catch {
      setError("이미지를 읽을 수 없습니다.");
      setFileMeta(null);
    }
  };

  const status = campaign?.status as PlatformPopupCampaignStatus | undefined;

  return (
    <div className="space-y-4" data-admin-platform-popup-detail="1">
      <AdminPageHeader
        backHref="/admin/platform-popup"
        title={campaign?.name || "…"}
        description={safeT("admin_platform_popup_detail_desc", {
          fallbackKo: "캠페인 편집 · 승인 · 프로덕션 렌더러 미리보기",
          fallbackEn: "Edit, approve, and preview with production renderer",
        })}
      />

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-4">
          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_basic", {
                fallbackKo: "기본 정보",
                fallbackEn: "Basic info",
              })}
            </h2>
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={name}
                onChange={(e) => {
                  markDirty();
                  setName(e.target.value);
                }}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-sam-muted">
              <span>status: {campaign?.status}</span>
              <span>approval: {campaign?.approvalStatus}</span>
              {campaign?.ownerStoreId ? <span>store: {campaign.ownerStoreId}</span> : null}
              {campaign?.ownerRequestId ? <span>request: {campaign.ownerRequestId}</span> : null}
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_creative", {
                fallbackKo: "크리에이티브",
                fallbackEn: "Creative",
              })}
            </h2>
            <div
              className="mb-3 rounded border border-sam-border bg-sam-app/60 px-3 py-2 text-sm"
              data-admin-popup-creative-spec="1"
            >
              <p>
                {safeT("admin_platform_popup_creative_spec_size", {
                  fallbackKo: `필수 이미지 규격  ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width} × ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height} px`,
                  fallbackEn: `Required size  ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width} × ${DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height} px`,
                })}
              </p>
              <p>
                {safeT("admin_platform_popup_creative_spec_ratio", {
                  fallbackKo: "비율  36 : 25",
                  fallbackEn: "Aspect  36 : 25",
                })}
              </p>
              <p className="text-xs text-sam-muted">
                {safeT("admin_platform_popup_creative_spec_formats", {
                  fallbackKo: `지원 형식  ${PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS.join(" / ")} · 최대 2MB`,
                  fallbackEn: `Formats  ${PLATFORM_POPUP_CREATIVE_ALLOWED_MIME_LABELS.join(" / ")} · max 2MB`,
                })}
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                void onPickFile(f);
              }}
            />
            <button
              type="button"
              className="rounded border border-sam-border bg-white px-3 py-1.5 text-sm font-medium"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {safeT("admin_platform_popup_load_image", {
                fallbackKo: "이미지 불러오기",
                fallbackEn: "Load image",
              })}
            </button>

            {fileMeta ? (
              <ul className="mt-3 space-y-0.5 text-xs text-sam-muted" data-admin-popup-file-meta="1">
                <li>
                  {fileMeta.fileName} · {(fileMeta.fileSize / 1024).toFixed(1)} KB
                </li>
                <li>
                  {fileMeta.width} × {fileMeta.height} px · ratio {fileMeta.ratio.toFixed(3)}
                  {fileMeta.ratioOk ? " · 36:25 OK" : " · needs crop"}
                </li>
              </ul>
            ) : null}

            {needsCrop && pendingCropFile && cropPreviewUrl ? (
              <div className="mt-3 space-y-2 rounded border border-amber-300 bg-amber-50/80 p-3">
                <p className="text-xs font-medium text-amber-900">
                  {safeT("admin_platform_popup_crop_confirm", {
                    fallbackKo: "중앙 크롭 결과 (저장될 최종 이미지)",
                    fallbackEn: "Center-crop result (final asset to save)",
                  })}
                </p>
                {/* Admin crop confirm uses blob URL — raw img OK for ephemeral object URL */}
                <img
                  src={cropPreviewUrl}
                  alt="36:25 crop preview"
                  className="w-full max-w-md border border-sam-border bg-white"
                  style={{ aspectRatio: "36 / 25" }}
                />
                <button
                  type="button"
                  className="rounded border border-amber-600 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void uploadCreative(pendingCropFile, true)}
                >
                  {safeT("admin_platform_popup_apply_center_crop", {
                    fallbackKo: "이 결과로 저장",
                    fallbackEn: "Save this crop",
                  })}
                </button>
              </div>
            ) : null}

            <label className="mt-3 block text-sm">
              Alt text
              <input
                className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                value={altText}
                onChange={(e) => {
                  markDirty();
                  setAltText(e.target.value);
                }}
              />
            </label>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">
              {safeT("admin_platform_popup_section_placement", {
                fallbackKo: "이 팝업을 어디에 노출할까요?",
                fallbackEn: "Where should this popup appear?",
              })}
            </h2>
            <p className="mb-3 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_system_note", {
                fallbackKo:
                  "메신저·통화·관리자·오너 운영·결제·주문 Critical 화면은 시스템에서 자동 제외됩니다.",
                fallbackEn:
                  "Messenger, Call, Admin, Owner Ops, Payment, and order-critical screens are excluded automatically.",
              })}
            </p>
            <fieldset className="space-y-2" data-admin-popup-surface-radio="1">
              {PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.mode}
                  className="flex cursor-pointer items-start gap-2 rounded border border-sam-border px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="platform-popup-surface-mode"
                    className="mt-1"
                    checked={surfaceMode === opt.mode}
                    onChange={() => {
                      markDirty();
                      setSurfaceMode(opt.mode);
                    }}
                  />
                  <span>
                    <span className="font-medium">{opt.labelKo}</span>
                    <span className="mt-0.5 block text-xs text-sam-muted">{opt.helpKo}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mt-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_placement_current", {
                fallbackKo: `현재 선택: ${
                  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.find((o) => o.mode === surfaceMode)
                    ?.labelKo ?? surfaceMode
                }`,
                fallbackEn: `Selected: ${
                  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.find((o) => o.mode === surfaceMode)
                    ?.labelEn ?? surfaceMode
                }`,
              })}
              {dirty ? " · unsaved" : ""}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">Schedule / Priority</h2>
            <p className="mb-2 text-xs text-sam-muted">
              Timezone: {timezone} (default Asia/Manila). Ranking: domain-targeted &gt; GLOBAL, then
              priority, then start_at, then id. Priority does not override call/payment gates.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                start_at
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={startLocal}
                  onChange={(e) => {
                    markDirty();
                    setStartLocal(e.target.value);
                  }}
                />
              </label>
              <label className="text-sm">
                end_at
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={endLocal}
                  onChange={(e) => {
                    markDirty();
                    setEndLocal(e.target.value);
                  }}
                />
              </label>
              <label className="text-sm">
                timezone
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={timezone}
                  onChange={(e) => {
                    markDirty();
                    setTimezone(e.target.value);
                  }}
                />
              </label>
              <label className="text-sm">
                priority
                <input
                  type="number"
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={priority}
                  onChange={(e) => {
                    markDirty();
                    setPriority(Number(e.target.value));
                  }}
                />
              </label>
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">Suppression</h2>
            <p className="mb-2 text-xs text-sam-muted">
              TODAY = until end of current calendar day in campaign timezone (not 24 hours).
            </p>
            <select
              className="w-full rounded border border-sam-border px-2 py-1.5"
              value={suppressionMode}
              onChange={(e) => {
                markDirty();
                setSuppressionMode(e.target.value);
              }}
            >
              {PLATFORM_POPUP_SUPPRESSION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {(suppressionMode === "DURATION" || Number(durationSec) > 0) && (
              <label className="mt-2 block text-sm">
                duration seconds
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={durationSec}
                  onChange={(e) => {
                    markDirty();
                    setDurationSec(e.target.value === "" ? "" : Number(e.target.value));
                  }}
                />
              </label>
            )}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">CTA</h2>
            <select
              className="w-full rounded border border-sam-border px-2 py-1.5"
              value={ctaType}
              onChange={(e) => {
                markDirty();
                setCtaType(e.target.value);
              }}
            >
              {PLATFORM_POPUP_CTA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {ctaType === "external_url" ? (
              <label className="mt-2 block text-sm">
                external https URL
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={externalUrl}
                  onChange={(e) => {
                    markDirty();
                    setExternalUrl(e.target.value);
                  }}
                />
              </label>
            ) : (
              <label className="mt-2 block text-sm">
                target / path
                <input
                  className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
                  value={ctaTarget}
                  onChange={(e) => {
                    markDirty();
                    setCtaTarget(e.target.value);
                  }}
                />
              </label>
            )}
            <p className="mt-1 text-xs text-sam-muted">href → {ctaHrefPreview || "(invalid)"}</p>
          </AdminCard>

          <AdminCard>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-sam-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy || !dirty}
                onClick={() => void save()}
              >
                {safeT("admin_platform_popup_save", { fallbackKo: "저장", fallbackEn: "Save" })}
                {dirty ? " *" : ""}
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void transition({ action: "transition", nextStatus: "pending_review", nextApproval: "pending_review" })}
              >
                Submit review
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void transition({ action: "approve", schedule: true })}
              >
                Approve → scheduled
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void transition({ action: "approve", activate: true })}
              >
                Approve → active
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy || status === "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "paused" })}
              >
                Pause
              </button>
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy || status !== "paused"}
                onClick={() => void transition({ action: "transition", nextStatus: "active" })}
              >
                Resume
              </button>
              <button
                type="button"
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
                disabled={busy || status === "ended"}
                onClick={() => void transition({ action: "transition", nextStatus: "ended" })}
              >
                End
              </button>
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">Reporting</h2>
            {campaign ? (
              <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
                {Object.entries(campaign.eventSummary).map(([k, v]) => (
                  <li key={k}>
                    {k}: {v}
                  </li>
                ))}
                <li>CTR: {campaign.derived.ctr == null ? "N/A" : campaign.derived.ctr.toFixed(3)}</li>
                <li>
                  dismiss rate:{" "}
                  {campaign.derived.dismissRate == null
                    ? "N/A"
                    : campaign.derived.dismissRate.toFixed(3)}
                </li>
                <li>
                  suppress rate:{" "}
                  {campaign.derived.suppressRate == null
                    ? "N/A"
                    : campaign.derived.suppressRate.toFixed(3)}
                </li>
                <li>
                  landing success:{" "}
                  {campaign.derived.landingSuccessRate == null
                    ? "N/A"
                    : campaign.derived.landingSuccessRate.toFixed(3)}
                </li>
                <li>spend/ROAS: {campaign.derived.spendRoas}</li>
              </ul>
            ) : null}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-2 text-sm font-semibold">Audit history</h2>
            <ul className="max-h-48 space-y-1 overflow-auto text-xs">
              {audit.length === 0 ? (
                <li className="text-sam-muted">—</li>
              ) : (
                audit.map((row) => (
                  <li key={row.id}>
                    {new Date(row.created_at).toLocaleString()} · {row.action} · {row.actor_type}
                  </li>
                ))
              )}
            </ul>
          </AdminCard>
        </div>

        <AdminCard>
          <h2 className="mb-2 text-sm font-semibold">
            {safeT("admin_platform_popup_section_preview", {
              fallbackKo: "프로덕션 미리보기",
              fallbackEn: "Production preview",
            })}
          </h2>
          <AdminPlatformPopupPreview source={previewSource} />
        </AdminCard>
      </div>
    </div>
  );
}
