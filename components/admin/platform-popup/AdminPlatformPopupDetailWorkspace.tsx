"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  PLATFORM_POPUP_TARGET_SURFACES,
  type PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";

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

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [timezone, setTimezone] = useState<string>(PLATFORM_POPUP_DEFAULT_TIMEZONE);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [surfaces, setSurfaces] = useState<string[]>(["GLOBAL"]);
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
    setSurfaces(c.surfaces.length ? c.surfaces : ["GLOBAL"]);
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
      surface: surfaces.includes("TRADE")
        ? "TRADE"
        : surfaces.includes("GLOBAL")
          ? "TRADE"
          : surfaces[0] || "TRADE",
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
    surfaces,
    suppressionMode,
    durationSec,
    timezone,
    dirty,
  ]);

  const markDirty = () => setDirty(true);

  const toggleSurface = (s: string) => {
    markDirty();
    setSurfaces((prev) => {
      if (prev.includes(s)) {
        const next = prev.filter((x) => x !== s);
        return next.length ? next : prev;
      }
      return [...prev, s];
    });
  };

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
        surfaces,
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
    setNeedsCrop(false);
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
      setError(json.message || "needs_crop");
      setPreviewOverrideUrl(URL.createObjectURL(file));
      return;
    }
    if (!res.ok || !json.ok) {
      setError(json.error || "upload_failed");
      return;
    }
    setPreviewOverrideUrl(null);
    setPendingCropFile(null);
    await load();
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
                fallbackKo: "크리에이티브 (36:25)",
                fallbackEn: "Creative (36:25)",
              })}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {safeT("admin_platform_popup_creative_ratio_help", {
                fallbackKo: "최종 제작물은 반드시 36:25 입니다. 비율이 다르면 중앙 크롭을 명시적으로 적용해야 합니다.",
                fallbackEn: "Final creative must be 36:25. Non-matching images require explicit center crop.",
              })}
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadCreative(f, false);
              }}
            />
            {needsCrop && pendingCropFile ? (
              <button
                type="button"
                className="mt-2 rounded border border-amber-500 px-2 py-1 text-xs text-amber-800"
                disabled={busy}
                onClick={() => void uploadCreative(pendingCropFile, true)}
              >
                {safeT("admin_platform_popup_apply_center_crop", {
                  fallbackKo: "36:25 중앙 크롭 적용 후 업로드",
                  fallbackEn: "Upload with 36:25 center crop",
                })}
              </button>
            ) : null}
            <label className="mt-2 block text-sm">
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
            <h2 className="mb-2 text-sm font-semibold">Surfaces</h2>
            <p className="mb-2 text-xs text-sam-muted">
              GLOBAL = COMMUNITY + TRADE + DELIVERY + MYPAGE
            </p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_POPUP_TARGET_SURFACES.map((s) => (
                <label key={s} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={surfaces.includes(s)}
                    onChange={() => toggleSurface(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
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
