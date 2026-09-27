"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminIntroOperatorPreview,
  INTRO_OPERATOR_PREVIEW_VIEWPORTS,
  type IntroPreviewViewport,
} from "@/components/admin/intro/AdminIntroOperatorPreview";
import {
  PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND,
} from "@/lib/startup/product-intro-geometry";
import {
  PRODUCT_INTRO_DISPLAY_MS_DEFAULT,
  type ProductIntroSizePreset,
} from "@/lib/startup/product-intro";
import {
  buildOperatorScene,
  findOperatorImageAsset,
  isSupportedIntroImageMime,
  operatorSourcePatch,
  readOperatorSource,
} from "@/lib/startup/intro-operator-contract";
import { introFrequencyLabel } from "@/lib/startup/intro-v2/admin-labels";
import type { IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";
import type { IntroCta, IntroCtaDestinationType, IntroFrequencyMode } from "@/lib/startup/intro-v2/types";

const SIZE_PRESETS: ProductIntroSizePreset[] = ["small", "medium", "large", "max"];
const FREQUENCIES: IntroFrequencyMode[] = [
  "every_launch",
  "once_per_session",
  "once_per_day",
  "once_ever",
];
const CTA_KINDS: Array<{ type: IntroCtaDestinationType | "NONE"; ko: string; en: string }> = [
  { type: "NONE", ko: "사용 안 함", en: "None" },
  { type: "EVENT", ko: "이벤트", en: "Event" },
  { type: "COMMUNITY", ko: "커뮤니티", en: "Community" },
  { type: "LISTING", ko: "거래 상품", en: "Trade listing" },
  { type: "STORE", ko: "배달 매장", en: "Delivery store" },
  { type: "POST", ko: "게시물", en: "Post" },
  { type: "INTERNAL_PATH", ko: "내부 경로", en: "In-app path" },
];

function isoToLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function AdminIntroOperatorForm({ campaignId }: { campaignId: string }) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [campaign, setCampaign] = useState<IntroAdminCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<IntroPreviewViewport>("phone");
  const [name, setName] = useState("");
  const [sizePreset, setSizePreset] = useState<ProductIntroSizePreset>("max");
  const [showLogo, setShowLogo] = useState(true);
  const [backgroundColor, setBackgroundColor] = useState<string>(PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND);
  const [durationMs, setDurationMs] = useState(PRODUCT_INTRO_DISPLAY_MS_DEFAULT);
  const [skipEnabled, setSkipEnabled] = useState(true);
  const [ctaEnabled, setCtaEnabled] = useState(false);
  const [ctaType, setCtaType] = useState<IntroCtaDestinationType | "NONE">("NONE");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaQuery, setCtaQuery] = useState("");
  const [ctaResults, setCtaResults] = useState<Array<{ id: string; label: string }>>([]);
  const [ctaDestId, setCtaDestId] = useState("");
  const [ctaDestLabel, setCtaDestLabel] = useState("");
  const [ctaPath, setCtaPath] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [frequencyMode, setFrequencyMode] = useState<IntroFrequencyMode>("every_launch");
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaignId}`, { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroAdminCampaign };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(lang === "en" ? "Could not load intro." : "인트로를 불러오지 못했습니다.");
      setLoading(false);
      return;
    }
    const next = json.campaign;
    const extras = readOperatorSource(next.source);
    const scene = next.scenes[0];
    const asset = findOperatorImageAsset(next);
    setCampaign(next);
    setName(next.name);
    setSizePreset(extras.sizePreset);
    setShowLogo(extras.showLogo);
    setBackgroundColor(scene?.backgroundColor || PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND);
    setDurationMs(scene?.durationMs ?? extras.displayDurationMs);
    setSkipEnabled((scene?.skipPolicy ?? "allow") !== "deny");
    setFrequencyMode(next.frequencyMode);
    setStartsAt(isoToLocal(next.startsAt));
    setEndsAt(isoToLocal(next.endsAt));
    const cta = scene?.cta ?? null;
    setCtaEnabled(cta?.enabled === true);
    setCtaType(cta?.destination.type ?? "NONE");
    setCtaLabel(cta?.label ?? cta?.destination.label ?? "");
    setCtaDestId(cta?.destination.id ?? "");
    setCtaDestLabel(cta?.destination.label ?? "");
    setCtaPath(cta?.destination.path ?? "");
    void asset;
    setError(null);
    setLoading(false);
  }, [campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const asset = campaign ? findOperatorImageAsset(campaign) : null;

  const cta: IntroCta | null = useMemo(() => {
    if (!ctaEnabled || ctaType === "NONE") return { enabled: false, destination: { type: "COMMUNITY" }, label: "" };
    if (ctaType === "INTERNAL_PATH") {
      return { enabled: true, destination: { type: "INTERNAL_PATH", path: ctaPath, label: ctaLabel }, label: ctaLabel };
    }
    if (ctaType === "COMMUNITY" || ctaType === "TRADE" || ctaType === "DELIVERY" || ctaType === "MESSENGER" || ctaType === "MY_PAGE") {
      return { enabled: true, destination: { type: ctaType, label: ctaLabel }, label: ctaLabel };
    }
    return {
      enabled: true,
      destination: { type: ctaType, id: ctaDestId, label: ctaDestLabel || ctaLabel },
      label: ctaLabel,
    };
  }, [ctaEnabled, ctaType, ctaLabel, ctaDestId, ctaDestLabel, ctaPath]);

  const buildPatch = () => {
    if (!campaign) return null;
    const scene = buildOperatorScene({
      existing: campaign.scenes[0] ?? null,
      name,
      assetId: asset?.id ?? campaign.scenes[0]?.layers.find((l) => l.type === "IMAGE")?.assetId ?? null,
      durationMs,
      skipEnabled,
      backgroundColor,
      cta,
    });
    return {
      name,
      startsAt: localToIso(startsAt),
      endsAt: localToIso(endsAt),
      frequencyMode,
      source: operatorSourcePatch({
        sizePreset,
        showLogo,
        displayDurationMs: durationMs,
        previous: campaign.source,
      }),
      scenes: [scene],
      deviceOverrides: [],
    };
  };

  const saveDraft = async () => {
    const patch = buildPatch();
    if (!patch) return;
    setSaving(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaignId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroAdminCampaign; error?: string };
    setSaving(false);
    if (!res.ok || !json.ok || !json.campaign) {
      setError(json.error ?? (lang === "en" ? "Draft save failed." : "초안 저장에 실패했습니다."));
      return;
    }
    setCampaign(json.campaign);
    setPendingAssetIds([]);
    setError(null);
  };

  const publish = async () => {
    await saveDraft();
    setSaving(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaignId}/publish`, {
      method: "POST",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? (lang === "en" ? "Publish failed." : "게시에 실패했습니다."));
      return;
    }
    router.push("/admin/intro");
  };

  const onUpload = async (file: File) => {
    if (!isSupportedIntroImageMime(file.type)) {
      setError(lang === "en" ? "Use PNG, JPG, or static WebP." : "PNG, JPG, 정적 WebP만 사용할 수 있습니다.");
      return;
    }
    const fd = new FormData();
    fd.set("kind", "background");
    fd.set("file", file);
    const up = await fetch("/api/admin/startup-config/upload-image", {
      method: "POST",
      credentials: "same-origin",
      body: fd,
    });
    const upJson = (await up.json().catch(() => ({}))) as { ok?: boolean; url?: string };
    if (!up.ok || !upJson.ok || !upJson.url) {
      setError(lang === "en" ? "Upload failed." : "업로드에 실패했습니다.");
      return;
    }
    const probe = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = upJson.url!;
    });
    const previous = asset?.id ?? null;
    const reg = await fetch("/api/admin/intro-campaigns/assets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicUrl: upJson.url,
        mime: file.type,
        bytes: file.size,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
      }),
    });
    const regJson = (await reg.json().catch(() => ({}))) as {
      ok?: boolean;
      asset?: IntroAdminCampaign["assets"][number];
    };
    if (!reg.ok || !regJson.ok || !regJson.asset || !campaign) {
      setError(lang === "en" ? "Could not keep the image." : "이미지를 저장하지 못했습니다.");
      return;
    }
    const nextAsset = regJson.asset;
    const scene = buildOperatorScene({
      existing: campaign.scenes[0] ?? null,
      name,
      assetId: nextAsset.id,
      durationMs,
      skipEnabled,
      backgroundColor,
      cta,
    });
    setCampaign({
      ...campaign,
      assets: [...campaign.assets.filter((a) => a.id !== previous), nextAsset],
      scenes: [scene],
    });
    setPendingAssetIds((ids) => [...ids, nextAsset.id]);
    if (previous) {
      void fetch("/api/admin/intro-campaigns/assets/cleanup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: [previous] }),
      });
    }
    setError(null);
  };

  const searchCta = async () => {
    if (ctaType === "NONE" || ctaType === "COMMUNITY" || ctaType === "INTERNAL_PATH") return;
    const res = await fetch(
      `/api/admin/intro-campaigns/entity-search?kind=${encodeURIComponent(ctaType)}&q=${encodeURIComponent(ctaQuery)}`,
      { credentials: "same-origin" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: Array<{ id: string; label?: string; name?: string }>;
    };
    setCtaResults(
      (json.items ?? []).map((item) => ({ id: item.id, label: item.label || item.name || item.id }))
    );
  };

  const transition = async (action: "pause" | "resume" | "archive") => {
    const res = await fetch(`/api/admin/intro-campaigns/${campaignId}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) router.push("/admin/intro");
  };

  if (loading) {
    return <AdminCard><p className="text-sam-muted">{lang === "en" ? "Loading…" : "불러오는 중…"}</p></AdminCard>;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={name || (lang === "en" ? "Intro" : "인트로")}
        backHref="/admin/intro"
        description={
          lang === "en"
            ? "Register one intro. The same image is used on Phone and Tablet."
            : "인트로 하나를 등록합니다. Phone과 Tablet은 같은 이미지를 사용합니다."
        }
      />
      {error ? <p className="text-red-800">{error}</p> : null}

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_basic", { fallbackKo: "기본 정보", fallbackEn: "Basics" })}</h2>
        <label className="block text-sm">
          {lang === "en" ? "Name" : "이름"}
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_content", { fallbackKo: "콘텐츠", fallbackEn: "Content" })}</h2>
        <input
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
          }}
        />
        {asset ? (
          <p className="mt-2 text-sm text-sam-muted">
            {asset.mime ?? "image"} · {asset.width ?? "?"}×{asset.height ?? "?"} · {asset.bytes ? `${Math.round(asset.bytes / 1024)} KB` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-sam-muted">{lang === "en" ? "No image yet." : "아직 이미지가 없습니다."}</p>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_display", { fallbackKo: "표시", fallbackEn: "Display" })}</h2>
        <p className="text-sm text-sam-muted">{lang === "en" ? "Keep aspect ratio" : "비율 유지"}: CONTAIN</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SIZE_PRESETS.map((preset) => (
            <AdminActionButton key={preset} variant={sizePreset === preset ? "primary" : "secondary"} onClick={() => setSizePreset(preset)}>
              {preset === "small" ? (lang === "en" ? "Small" : "작게") : preset === "medium" ? (lang === "en" ? "Medium" : "보통") : preset === "large" ? (lang === "en" ? "Large" : "크게") : lang === "en" ? "Maximum" : "최대"}
            </AdminActionButton>
          ))}
        </div>
        <p className="mt-3 text-sm">{lang === "en" ? "Position: center" : "위치: 가운데"}</p>
        <label className="mt-3 block text-sm">
          {lang === "en" ? "Background" : "배경"}
          <input type="color" className="ml-2 align-middle" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
          <AdminActionButton className="ml-2" variant="quiet" onClick={() => setBackgroundColor(PRODUCT_INTRO_BUNDLED_CANVAS_BACKGROUND)}>
            {lang === "en" ? "DIBAY default" : "DIBAY 기본"}
          </AdminActionButton>
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} />
          {lang === "en" ? "Show DIBAY logo" : "DIBAY 로고 표시"}
        </label>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_behavior", { fallbackKo: "동작", fallbackEn: "Behavior" })}</h2>
        <label className="block text-sm">
          {lang === "en" ? "Hold (ms)" : "노출 시간 (ms)"}
          <input type="number" min={1} max={8000} className="mt-1 w-40 rounded-ui-rect border border-sam-border px-3 py-2" value={durationMs} onChange={(e) => setDurationMs(Number(e.target.value))} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={skipEnabled} onChange={(e) => setSkipEnabled(e.target.checked)} />
          {lang === "en" ? "Allow skip" : "Skip 허용"}
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ctaEnabled} onChange={(e) => setCtaEnabled(e.target.checked)} />
          {lang === "en" ? "Use button" : "CTA 사용"}
        </label>
        {ctaEnabled ? (
          <div className="mt-3 space-y-2">
            <input className="w-full rounded-ui-rect border border-sam-border px-3 py-2" placeholder={lang === "en" ? "Button label" : "버튼 문구"} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
            <select className="rounded-ui-rect border border-sam-border px-3 py-2" value={ctaType} onChange={(e) => setCtaType(e.target.value as IntroCtaDestinationType)}>
              {CTA_KINDS.filter((k) => k.type !== "NONE").map((kind) => (
                <option key={kind.type} value={kind.type}>{lang === "en" ? kind.en : kind.ko}</option>
              ))}
            </select>
            {ctaType === "INTERNAL_PATH" ? (
              <input className="w-full rounded-ui-rect border border-sam-border px-3 py-2" placeholder="/philife/..." value={ctaPath} onChange={(e) => setCtaPath(e.target.value)} />
            ) : ctaType === "COMMUNITY" ? null : (
              <div className="flex gap-2">
                <input className="flex-1 rounded-ui-rect border border-sam-border px-3 py-2" value={ctaQuery} onChange={(e) => setCtaQuery(e.target.value)} placeholder={lang === "en" ? "Search destination" : "대상 검색"} />
                <AdminActionButton variant="secondary" onClick={() => void searchCta()}>{lang === "en" ? "Search" : "검색"}</AdminActionButton>
              </div>
            )}
            {ctaDestLabel ? <p className="text-sm text-sam-muted">{ctaDestLabel}</p> : null}
            {ctaResults.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block text-left text-sm text-sam-brand"
                onClick={() => {
                  setCtaDestId(item.id);
                  setCtaDestLabel(item.label);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_exposure", { fallbackKo: "노출", fallbackEn: "Exposure" })}</h2>
        <label className="block text-sm">{lang === "en" ? "Starts" : "시작"}
          <input type="datetime-local" className="mt-1 block rounded-ui-rect border border-sam-border px-3 py-2" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">{lang === "en" ? "Ends" : "종료"}
          <input type="datetime-local" className="mt-1 block rounded-ui-rect border border-sam-border px-3 py-2" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <p className="mt-3 text-sm">{lang === "en" ? "Audience: everyone" : "대상: 전체"}</p>
        <label className="mt-3 block text-sm">
          {lang === "en" ? "Frequency" : "빈도"}
          <select className="mt-1 block rounded-ui-rect border border-sam-border px-3 py-2" value={frequencyMode} onChange={(e) => setFrequencyMode(e.target.value as IntroFrequencyMode)}>
            {FREQUENCIES.map((mode) => (
              <option key={mode} value={mode}>{introFrequencyLabel(mode, lang)}</option>
            ))}
          </select>
        </label>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}</h2>
        <div className="mb-3 flex gap-2">
          {(Object.keys(INTRO_OPERATOR_PREVIEW_VIEWPORTS) as IntroPreviewViewport[]).map((key) => (
            <AdminActionButton key={key} variant={preview === key ? "primary" : "secondary"} onClick={() => setPreview(key)}>
              {lang === "en" ? INTRO_OPERATOR_PREVIEW_VIEWPORTS[key].labelEn : INTRO_OPERATOR_PREVIEW_VIEWPORTS[key].labelKo}
            </AdminActionButton>
          ))}
        </div>
        <AdminIntroOperatorPreview
          viewport={preview}
          imageUrl={asset?.publicUrl ?? null}
          imageWidth={asset?.width ?? 1080}
          imageHeight={asset?.height ?? 1350}
          backgroundColor={backgroundColor}
          sizePreset={sizePreset}
          showLogo={showLogo}
          ctaLabel={ctaEnabled ? ctaLabel : null}
          skipEnabled={skipEnabled}
        />
      </AdminCard>

      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" disabled={saving} onClick={() => void saveDraft()}>
          {safeT("admin_intro_save_draft", { fallbackKo: "초안 저장", fallbackEn: "Save draft" })}
        </AdminActionButton>
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void publish()}>
          {safeT("admin_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
        {campaign?.status === "active" || campaign?.status === "scheduled" ? (
          <AdminActionButton variant="secondary" onClick={() => void transition("pause")}>
            {safeT("admin_intro_pause", { fallbackKo: "중지", fallbackEn: "Pause" })}
          </AdminActionButton>
        ) : null}
        {campaign?.status === "paused" ? (
          <AdminActionButton variant="secondary" onClick={() => void transition("resume")}>
            {safeT("admin_intro_resume", { fallbackKo: "재개", fallbackEn: "Resume" })}
          </AdminActionButton>
        ) : null}
        {campaign?.status !== "draft" ? (
          <AdminActionButton variant="quiet" onClick={() => void transition("archive")}>
            {safeT("admin_intro_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
          </AdminActionButton>
        ) : null}
      </div>
      {pendingAssetIds.length ? (
        <p className="text-xs text-sam-muted">{lang === "en" ? "Unsaved image will be cleaned up if you leave without saving." : "저장하지 않고 나가면 업로드한 이미지는 정리됩니다."}</p>
      ) : null}
    </div>
  );
}
