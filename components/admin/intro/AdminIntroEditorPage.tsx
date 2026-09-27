"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  AdminIntroPreviewCanvas,
  type IntroCanvasSelection,
} from "@/components/admin/intro/AdminIntroPreviewCanvas";
import { isoToManilaLocal, manilaLocalToIso, formatAdminScheduleRange } from "@/components/admin/intro/intro-admin-time";
import {
  INTRO_ADMIN_DEFAULT_MAX_HOLD_MS,
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  INTRO_ADMIN_INTERACTION_UI,
  INTRO_INTERACTION_UI_TO_MODE,
  introAdvanceLabel,
  introAudienceLabel,
  introCtaTypeLabel,
  introDeviceFamilyLabel,
  introFrequencyLabel,
  introInteractionLabel,
  introLayerTypeLabel,
  introPlatformLabel,
  type IntroAdminInteractionUi,
} from "@/lib/startup/intro-v2/admin-labels";
import {
  INTRO_ADMIN_PLANNED_MEDIA,
  INTRO_ADMIN_UPLOADABLE_MEDIA,
  introMediaKindFromMime,
  isIntroMediaUploadableNow,
} from "@/lib/startup/intro-v2/admin-media";
import {
  INTRO_ADMIN_PREVIEW_PRESETS,
  introAdminPreviewFrame,
  type IntroAdminPreviewPreset,
} from "@/lib/startup/intro-v2/admin-preview";
import {
  INTRO_ADMIN_DEVICE_CHIPS,
  buildAdminTargeting,
  deviceChipsFromClasses,
  toggleAudience,
  toggleDeviceChip,
  togglePlatform,
  type IntroAdminDeviceChip,
} from "@/lib/startup/intro-v2/admin-targeting-ui";
import {
  introDocumentStateLabel,
  introDraftFingerprint,
  resolveIntroDocumentState,
} from "@/lib/startup/intro-v2/admin-document-state";
import {
  defaultNewScene,
  duplicateScene,
  reorderLayers,
  reorderScenes,
  sceneInteractionUi,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminDeviceOverride,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { validateIntroCampaignForPublish, type IntroAdminIssue } from "@/lib/startup/intro-v2/admin-validate";
import {
  creativeAspectWarning,
  defaultComposerLayer,
  formatAspect,
  layerDisplayName,
  withCtaVisual,
  INTRO_CREATIVE_RECOMMENDED_HEIGHT,
  INTRO_CREATIVE_RECOMMENDED_WIDTH,
} from "@/lib/startup/intro-v2/composer-visual";
import {
  INTRO_ADVANCE_MODES,
  INTRO_AUDIENCES,
  INTRO_CTA_DESTINATION_TYPES,
  INTRO_FREQUENCY_MODES,
  INTRO_PLATFORMS,
  INTRO_TEXT_ALIGNS,
  type IntroAdvanceMode,
  type IntroCtaDestinationType,
  type IntroDeviceFamily,
  type IntroFrequencyMode,
  type IntroLayer,
  type IntroTextAlign,
} from "@/lib/startup/intro-v2/types";

const ENTITY_KINDS = new Set(["STORE", "PRODUCT", "LISTING", "POST", "CHAT_ROOM", "EVENT"]);

type ImportInfo = {
  filename: string;
  width: number | null;
  height: number | null;
  aspect: string;
  mediaType: string;
  publishable: boolean;
  warning: boolean;
};

type SecondaryPane = "validate" | "schedule" | "publish";

function familyForPreset(preset: IntroAdminPreviewPreset): IntroDeviceFamily {
  return introAdminPreviewFrame(preset).deviceFamily;
}

function analyzeImageFile(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function AdminIntroEditorPage({ campaignId }: { campaignId: string }) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [campaign, setCampaign] = useState<IntroAdminCampaign | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [selection, setSelection] = useState<IntroCanvasSelection>(null);
  const [preset, setPreset] = useState<IntroAdminPreviewPreset>("samsung_phone");
  const [composition, setComposition] = useState<"common" | IntroAdminPreviewPreset>("common");
  const [issues, setIssues] = useState<IntroAdminIssue[]>([]);
  const [entityHits, setEntityHits] = useState<Array<{ id: string; label: string; subtitle?: string }>>([]);
  const [importInfo, setImportInfo] = useState<ImportInfo | null>(null);
  const [secondary, setSecondary] = useState<SecondaryPane>("validate");
  const fileRef = useRef<HTMLInputElement>(null);

  const applyLoaded = useCallback((next: IntroAdminCampaign) => {
    setCampaign(next);
    setSavedFingerprint(introDraftFingerprint(next));
    setSceneId((cur) => cur ?? next.scenes[0]?.id ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    const res = await fetch(`/api/admin/intro-campaigns/${campaignId}`, { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroAdminCampaign };
    if (res.status === 401 || res.status === 403) setForbidden(true);
    else if (!res.ok || !json.ok || !json.campaign) {
      setError(lang === "en" ? "Could not load intro." : "인트로를 불러오지 못했습니다.");
    } else {
      applyLoaded(json.campaign);
      void restoreDestinationLabels(json.campaign, applyLoaded);
    }
    setLoading(false);
  }, [applyLoaded, campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = campaign ? introDraftFingerprint(campaign) !== savedFingerprint : false;
  const documentState = campaign
    ? resolveIntroDocumentState({ campaign, dirty, saving: busy, issues })
    : "DRAFT";

  const scene = campaign?.scenes.find((s) => s.id === sceneId) ?? campaign?.scenes[0] ?? null;
  const family = familyForPreset(preset);
  const override = campaign?.deviceOverrides.find(
    (o) => o.deviceFamily === family && (o.sceneId === scene?.id || o.sceneId == null)
  ) ?? null;
  const usingOverride = composition !== "common" && override != null;
  const canvasScene = scene
    ? usingOverride
      ? {
          ...scene,
          layers: override.layers ?? scene.layers,
          backgroundAssetId: override.backgroundAssetId ?? scene.backgroundAssetId,
        }
      : scene
    : null;

  const patchCampaign = (next: IntroAdminCampaign) => setCampaign(next);
  const patchScenes = (scenes: IntroAdminScene[]) => {
    if (!campaign) return;
    patchCampaign({ ...campaign, scenes });
  };
  const patchCommonScene = (next: IntroAdminScene) => {
    if (!campaign) return;
    patchScenes(campaign.scenes.map((s) => (s.id === next.id ? next : s)));
  };
  const patchCanvasScene = (next: IntroAdminScene) => {
    if (!campaign || !scene) return;
    if (usingOverride && override) {
      patchCampaign({
        ...campaign,
        deviceOverrides: campaign.deviceOverrides.map((o) =>
          o.id === override.id
            ? { ...o, layers: next.layers, backgroundAssetId: next.backgroundAssetId }
            : o
        ),
      });
      return;
    }
    patchCommonScene(next);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!campaign) return false;
    setBusy(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaign.name,
        status: campaign.status,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
        timezone: campaign.timezone || INTRO_ADMIN_DEFAULT_TIMEZONE,
        priority: campaign.priority,
        targeting: campaign.targeting,
        frequencyMode: campaign.frequencyMode,
        deepLinkPolicy: campaign.deepLinkPolicy,
        scenes: campaign.scenes,
        deviceOverrides: campaign.deviceOverrides,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: IntroAdminCampaign;
      error?: string;
      issues?: IntroAdminIssue[];
    };
    setBusy(false);
    if (!res.ok || !json.ok || !json.campaign) {
      if (Array.isArray(json.issues) && json.issues.length > 0) {
        setIssues(json.issues);
        setError(lang === "en" ? json.issues[0]!.messageEn : json.issues[0]!.messageKo);
        setSecondary("validate");
        return false;
      }
      setError(lang === "en" ? "Draft save failed." : "초안 저장에 실패했습니다.");
      return false;
    }
    applyLoaded(json.campaign);
    setError(null);
    return true;
  };

  const runValidate = async () => {
    if (!campaign) return;
    const local = validateIntroCampaignForPublish(campaign);
    setIssues(local.issues);
    setSecondary("validate");
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}/validate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "publish" }),
    });
    const json = (await res.json().catch(() => ({}))) as { issues?: IntroAdminIssue[] };
    if (Array.isArray(json.issues)) setIssues(json.issues);
  };

  const publish = async () => {
    if (!campaign) return;
    setBusy(true);
    const saved = await saveDraft();
    if (!saved) {
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}/publish`, {
      method: "POST",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: IntroAdminCampaign;
      issues?: IntroAdminIssue[];
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setIssues(json.issues ?? []);
      setError(json.error ?? (lang === "en" ? "Publish blocked." : "게시를 할 수 없습니다."));
      setSecondary("validate");
      return;
    }
    if (json.campaign) applyLoaded(json.campaign);
    setIssues([]);
    setSecondary("publish");
  };

  const transition = async (action: "pause" | "resume" | "archive") => {
    if (!campaign) return;
    setBusy(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}/transition`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroAdminCampaign };
    setBusy(false);
    if (json.ok && json.campaign) applyLoaded(json.campaign);
  };

  const searchEntity = async (kind: string, q: string) => {
    if (!ENTITY_KINDS.has(kind) || q.trim().length < 1) {
      setEntityHits([]);
      return;
    }
    const res = await fetch(
      `/api/admin/intro-campaigns/entity-search?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`,
      { credentials: "same-origin" }
    );
    const json = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; label: string; subtitle?: string }> };
    setEntityHits(json.items ?? []);
  };

  const importFile = async (file: File) => {
    if (!campaign) return;
    const dims = await analyzeImageFile(file);
    const kind = introMediaKindFromMime(file.type);
    const publishable = isIntroMediaUploadableNow(kind, file.type);
    const info: ImportInfo = {
      filename: file.name,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      aspect: dims ? formatAspect(dims.width, dims.height) : lang === "en" ? "Unknown" : "알 수 없음",
      mediaType: file.type || kind,
      publishable,
      warning: dims ? creativeAspectWarning(dims.width, dims.height) : true,
    };
    setImportInfo(info);
    if (!publishable) {
      setError(
        lang === "en"
          ? `${file.name} is in the product contract but is not publishable yet. PNG, JPG, or WebP can be published now.`
          : `${file.name}은 제품 계약에 포함되지만 지금은 게시할 수 없습니다. 지금 게시 가능한 형식은 PNG, JPG, WebP입니다.`
      );
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
      setError(lang === "en" ? "Upload failed. The file was not converted." : "업로드에 실패했습니다. 파일을 변환하지 않았습니다.");
      return;
    }
    const reg = await fetch("/api/admin/intro-campaigns/assets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicUrl: upJson.url,
        mime: file.type,
        bytes: file.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
      }),
    });
    const regJson = (await reg.json().catch(() => ({}))) as { ok?: boolean; asset?: IntroAdminAsset };
    if (!reg.ok || !regJson.ok || !regJson.asset) {
      setError(lang === "en" ? "Asset save failed." : "미디어를 저장하지 못했습니다.");
      return;
    }
    const asset = regJson.asset;
    let scenes = campaign.scenes;
    let target = scenes[0] ?? null;
    if (!target) {
      target = defaultNewScene(`tmp-${Date.now()}`, 0, lang === "en" ? "Scene 1" : "장면 1");
      scenes = [target];
    }
    const layer = {
      ...defaultComposerLayer("IMAGE", `layer-${Date.now()}`, target.layers.length + 1),
      name: file.name.replace(/\.[^.]+$/, "") || (lang === "en" ? "Image" : "이미지"),
      assetId: asset.id,
      aspectPolicy: "contain" as const,
      xPct: 50,
      yPct: 50,
      widthPct: 80,
      heightPct: 64,
    };
    const nextScene = {
      ...target,
      layers: [...target.layers, layer],
      backgroundAssetId: target.backgroundAssetId ?? asset.id,
    };
    const next = {
      ...campaign,
      assets: [...campaign.assets, asset],
      scenes: scenes.map((s) => (s.id === nextScene.id ? nextScene : s)),
    };
    setCampaign(next);
    setSceneId(nextScene.id);
    setSelection({ type: "layer", id: layer.id });
    setError(null);
  };

  const chips = useMemo(
    () => (campaign ? deviceChipsFromClasses(campaign.targeting.deviceClasses) : []),
    [campaign]
  );

  if (loading) {
    return <AdminCard><p className="text-sam-muted">{lang === "en" ? "Loading…" : "불러오는 중…"}</p></AdminCard>;
  }
  if (forbidden) {
    return (
      <AdminCard>
        <p className="text-red-800">
          {safeT("admin_intro_forbidden", {
            fallbackKo: "인트로 관리 권한이 없습니다.",
            fallbackEn: "You do not have access to Intro admin.",
          })}
        </p>
      </AdminCard>
    );
  }
  if (!campaign) {
    return (
      <AdminCard>
        <p className="text-red-800">{error ?? (lang === "en" ? "Not found." : "찾을 수 없습니다.")}</p>
      </AdminCard>
    );
  }

  const v1Unconfirmed =
    campaign.requiresAdminConfirmation && Number(campaign.source.v1_display_duration_ms ?? 0) === 0;
  const selectedLayer =
    selection?.type === "layer" ? canvasScene?.layers.find((l) => l.id === selection.id) ?? null : null;

  return (
    <div className="space-y-3" data-intro-composer="v2">
      <AdminPageHeader
        title={campaign.name || (lang === "en" ? "New intro" : "새 인트로")}
        backHref="/admin/intro"
        description={lang === "en" ? "Draft save does not change the published snapshot." : "초안 저장은 게시본을 바꾸지 않습니다."}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
        <AdminToneBadge tone={documentState === "VALIDATION_ERROR" ? "danger" : documentState === "PUBLISHED" ? "success" : "progress"}>
          {introDocumentStateLabel(documentState, lang, campaign.published?.revision)}
        </AdminToneBadge>
        <input
          className="min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border px-2 py-1 text-sm"
          value={campaign.name}
          onChange={(e) => patchCampaign({ ...campaign, name: e.target.value })}
          aria-label={lang === "en" ? "Intro name" : "인트로 이름"}
        />
        <AdminActionButton variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
          {lang === "en" ? "Save" : "저장"}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => void runValidate()}>
          {lang === "en" ? "Validate" : "검사"}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => setSecondary("schedule")}>
          {lang === "en" ? "Schedule" : "일정"}
        </AdminActionButton>
        <AdminActionButton variant="primary" disabled={busy} onClick={() => void publish()}>
          {lang === "en" ? "Publish" : "게시"}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => void transition("pause")}>
          {lang === "en" ? "Pause" : "일시중지"}
        </AdminActionButton>
        {campaign.status === "paused" ? (
          <AdminActionButton variant="secondary" onClick={() => void transition("resume")}>
            {lang === "en" ? "Resume" : "다시 시작"}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="danger" onClick={() => void transition("archive")}>
          {lang === "en" ? "Archive" : "보관"}
        </AdminActionButton>
      </div>

      {error ? <p className="text-red-800">{error}</p> : null}
      {v1Unconfirmed ? (
        <AdminCard>
          <AdminToneBadge tone="warning">{lang === "en" ? "Imported draft" : "가져온 초안"}</AdminToneBadge>
          <p className="mt-2 text-sm text-sam-fg">
            {safeT("admin_intro_v1_warning", {
              fallbackKo: "가져온 초안입니다. 게시 전에 장면이 어떻게 넘어갈지 직접 선택하세요.",
              fallbackEn: "This imported draft needs an explicit scene advance before publish.",
            })}
          </p>
        </AdminCard>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <AdminCard>
          <div className="mb-3">
            <p className="mb-2 text-sm font-semibold">{lang === "en" ? "Import image" : "파일 불러오기"}</p>
            <div
              className="rounded-ui-rect border border-dashed border-sam-border px-3 py-4 text-center text-[12px] text-sam-muted"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void importFile(file);
              }}
            >
              <p>{lang === "en" ? "Drop a file or choose from this computer." : "파일을 끌어오거나 이 컴퓨터에서 선택하세요."}</p>
              <p className="mt-1">
                {lang === "en"
                  ? `Publishable now: ${INTRO_ADMIN_UPLOADABLE_MEDIA.join(", ")}. Also in contract: ${INTRO_ADMIN_PLANNED_MEDIA.join(", ")}.`
                  : `지금 게시 가능: ${INTRO_ADMIN_UPLOADABLE_MEDIA.join(", ")}. 제품 계약: ${INTRO_ADMIN_PLANNED_MEDIA.join(", ")}.`}
              </p>
              <AdminActionButton className="mt-2" variant="secondary" onClick={() => fileRef.current?.click()}>
                {lang === "en" ? "Choose file" : "파일 선택"}
              </AdminActionButton>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            {importInfo ? (
              <div className="mt-2 space-y-1 text-[12px] text-sam-fg" data-intro-import="analysis">
                <p>{importInfo.filename}</p>
                <p>
                  {importInfo.width && importInfo.height
                    ? `${importInfo.width} × ${importInfo.height}`
                    : lang === "en"
                      ? "Size unknown"
                      : "크기 확인 불가"}{" "}
                  · {importInfo.aspect} · {importInfo.mediaType}
                </p>
                {importInfo.warning ? (
                  <p className="text-amber-800">
                    {lang === "en"
                      ? `Recommended source is ${INTRO_CREATIVE_RECOMMENDED_WIDTH}×${INTRO_CREATIVE_RECOMMENDED_HEIGHT} (4:5). The image will stay contained.`
                      : `권장 원본은 ${INTRO_CREATIVE_RECOMMENDED_WIDTH}×${INTRO_CREATIVE_RECOMMENDED_HEIGHT} (4:5)입니다. 이미지는 잘리지 않고 비율을 유지합니다.`}
                  </p>
                ) : null}
                <p className={importInfo.publishable ? "text-sam-muted" : "text-amber-800"}>
                  {importInfo.publishable
                    ? lang === "en"
                      ? "Publishable now"
                      : "지금 게시 가능"
                    : lang === "en"
                      ? "Not publishable yet"
                      : "지금은 게시할 수 없음"}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{lang === "en" ? "Scenes" : "장면"}</h2>
            <AdminActionButton
              variant="quiet"
              onClick={() => {
                const id = `tmp-${Date.now()}`;
                const next = defaultNewScene(id, campaign.scenes.length, lang === "en" ? `Scene ${campaign.scenes.length + 1}` : `장면 ${campaign.scenes.length + 1}`);
                patchScenes([...campaign.scenes, next]);
                setSceneId(id);
                setSelection({ type: "scene" });
              }}
            >
              {lang === "en" ? "Add" : "추가"}
            </AdminActionButton>
          </div>
          <div className="space-y-1">
            {campaign.scenes.map((s, index) => {
              const media = campaign.assets.find((a) => a.id === s.backgroundAssetId);
              return (
                <div
                  key={s.id}
                  className={`rounded-ui-rect border px-2 py-2 ${s.id === scene?.id ? "border-violet-500" : "border-sam-border"}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    patchScenes(reorderScenes(campaign.scenes, from, index));
                  }}
                >
                  <button type="button" className="block w-full text-left text-sm font-semibold" onClick={() => { setSceneId(s.id); setSelection({ type: "scene" }); }}>
                    {s.name || (lang === "en" ? `Scene ${index + 1}` : `장면 ${index + 1}`)}
                  </button>
                  <p className="text-[11px] text-sam-muted">
                    {media ? `${media.width ?? "?"}×${media.height ?? "?"}` : lang === "en" ? "No media" : "미디어 없음"}
                    {" · "}
                    {introAdvanceLabel(s.advanceMode, lang)}
                    {" · "}
                    {introInteractionLabel(sceneInteractionUi(s), lang)}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <AdminActionButton
                      variant="quiet"
                      onClick={() => {
                        const id = `tmp-${Date.now()}`;
                        patchScenes([...campaign.scenes, duplicateScene(s, id, campaign.scenes.length)]);
                      }}
                    >
                      {lang === "en" ? "Duplicate" : "복제"}
                    </AdminActionButton>
                    <AdminActionButton
                      variant="quiet"
                      onClick={() => {
                        patchScenes(campaign.scenes.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, sortOrder: i })));
                        if (sceneId === s.id) setSceneId(null);
                      }}
                    >
                      {lang === "en" ? "Delete" : "삭제"}
                    </AdminActionButton>
                  </div>
                </div>
              );
            })}
          </div>

          {canvasScene ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{lang === "en" ? "Layers" : "레이어"}</h2>
                <AdminActionButton
                  variant="quiet"
                  onClick={() => {
                    const next = defaultComposerLayer("TEXT", `layer-${Date.now()}`, canvasScene.layers.length + 1);
                    patchCanvasScene({ ...canvasScene, layers: [...canvasScene.layers, next] });
                    setSelection({ type: "layer", id: next.id });
                  }}
                >
                  {lang === "en" ? "Add text" : "텍스트 추가"}
                </AdminActionButton>
              </div>
              <div className="space-y-1">
                {canvasScene.layers.map((l, i) => (
                  <div key={l.id} className={`flex items-center gap-1 rounded-ui-rect border px-2 py-1 ${selection?.type === "layer" && selection.id === l.id ? "border-violet-500" : "border-sam-border"}`}>
                    <button type="button" className="flex-1 text-left text-[12px]" onClick={() => setSelection({ type: "layer", id: l.id })}>
                      {layerDisplayName(l, introLayerTypeLabel(l.type, lang))}
                    </button>
                    <button type="button" className="text-[11px]" disabled={i === 0} onClick={() => patchCanvasScene({ ...canvasScene, layers: reorderLayers(canvasScene.layers, i, i - 1) })}>↑</button>
                    <button type="button" className="text-[11px]" disabled={i === canvasScene.layers.length - 1} onClick={() => patchCanvasScene({ ...canvasScene, layers: reorderLayers(canvasScene.layers, i, i + 1) })}>↓</button>
                    <button
                      type="button"
                      className="text-[11px] text-red-700"
                      onClick={() => {
                        patchCanvasScene({
                          ...canvasScene,
                          layers: canvasScene.layers.filter((x) => x.id !== l.id),
                          interactionLayerId: canvasScene.interactionLayerId === l.id ? null : canvasScene.interactionLayerId,
                        });
                        if (selection?.type === "layer" && selection.id === l.id) setSelection({ type: "scene" });
                      }}
                    >
                      {lang === "en" ? "Del" : "삭제"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard>
          <div className="mb-3 flex flex-wrap gap-2">
            <AdminActionButton
              variant={composition === "common" ? "primary" : "secondary"}
              onClick={() => setComposition("common")}
            >
              {lang === "en" ? "Common" : "공통"}
            </AdminActionButton>
            {INTRO_ADMIN_PREVIEW_PRESETS.map((p) => (
              <AdminActionButton
                key={p}
                variant={composition === p ? "primary" : "secondary"}
                onClick={() => {
                  setPreset(p);
                  setComposition(p);
                }}
              >
                {introAdminPreviewFrame(p).labelKo}
              </AdminActionButton>
            ))}
          </div>
          <p className="mb-2 text-[12px] text-sam-muted">
            {usingOverride
              ? lang === "en"
                ? `${introDeviceFamilyLabel(family, "en")} is different from common.`
                : `이 기기군만 다름 · ${introDeviceFamilyLabel(family, "ko")}`
              : lang === "en"
                ? "Using common composition"
                : "공통 사용 중"}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            {!usingOverride ? (
              <AdminActionButton
                variant="secondary"
                onClick={() => {
                  if (!scene) return;
                  const next: IntroAdminDeviceOverride = {
                    id: `tmp-ov-${Date.now()}`,
                    sceneId: scene.id,
                    deviceFamily: family,
                    layers: scene.layers,
                    backgroundAssetId: scene.backgroundAssetId,
                  };
                  patchCampaign({ ...campaign, deviceOverrides: [...campaign.deviceOverrides, next] });
                  setComposition(preset);
                }}
              >
                {lang === "en" ? "Create override" : "이 기기군만 다르게"}
              </AdminActionButton>
            ) : (
              <AdminActionButton
                variant="quiet"
                onClick={() => {
                  if (!override) return;
                  patchCampaign({
                    ...campaign,
                    deviceOverrides: campaign.deviceOverrides.filter((o) => o.id !== override.id),
                  });
                  setComposition("common");
                }}
              >
                {lang === "en" ? "Reset to common" : "공통으로 되돌리기"}
              </AdminActionButton>
            )}
          </div>
          <AdminIntroPreviewCanvas
            scene={canvasScene}
            assets={campaign.assets}
            preset={preset}
            selection={selection}
            lang={lang}
            onSelect={setSelection}
            onMoveLayerPct={(id, xPct, yPct) => {
              if (!canvasScene) return;
              patchCanvasScene({
                ...canvasScene,
                layers: canvasScene.layers.map((l) => (l.id === id ? { ...l, xPct, yPct } : l)),
              });
            }}
            onResizeLayerPct={(id, next) => {
              if (!canvasScene) return;
              patchCanvasScene({
                ...canvasScene,
                layers: canvasScene.layers.map((l) => (l.id === id ? { ...l, ...next } : l)),
              });
            }}
            onMoveCtaPct={(xPct, yPct) => {
              if (!scene) return;
              patchCommonScene({ ...scene, cta: { ...withCtaVisual(scene.cta), xPct, yPct } });
            }}
            onResizeCtaPct={(next) => {
              if (!scene) return;
              patchCommonScene({ ...scene, cta: { ...withCtaVisual(scene.cta), ...next } });
            }}
          />
        </AdminCard>

        <AdminCard>
          <h2 className="mb-3 text-sm font-semibold">{lang === "en" ? "Properties" : "속성"}</h2>
          {scene && (selection?.type === "scene" || !selection) ? (
            <SceneProps scene={scene} lang={lang} onChange={patchCommonScene} />
          ) : null}
          {selectedLayer && canvasScene ? (
            <LayerProps
              layer={selectedLayer}
              assets={campaign.assets}
              lang={lang}
              onChange={(next) =>
                patchCanvasScene({
                  ...canvasScene,
                  layers: canvasScene.layers.map((l) => (l.id === next.id ? next : l)),
                })
              }
            />
          ) : null}
          {selection?.type === "cta" && scene ? (
            <CtaProps
              scene={scene}
              lang={lang}
              hits={entityHits}
              onSearch={searchEntity}
              onChange={patchCommonScene}
            />
          ) : null}
          {scene ? (
            <div className="mt-4 border-t border-sam-border pt-3">
              <p className="mb-2 text-sm font-semibold">{lang === "en" ? "Tap action" : "누르기 방식"}</p>
              <select
                className="w-full rounded-ui-rect border border-sam-border px-2 py-1 text-sm"
                value={sceneInteractionUi(scene)}
                onChange={(e) => {
                  const ui = e.target.value as IntroAdminInteractionUi;
                  patchCommonScene({
                    ...scene,
                    interactionMode: INTRO_INTERACTION_UI_TO_MODE[ui],
                    interactionLayerId: ui === "LAYER" ? scene.interactionLayerId : null,
                    cta:
                      ui === "BUTTON"
                        ? { ...withCtaVisual(scene.cta), enabled: true }
                        : { ...withCtaVisual(scene.cta), enabled: false },
                  });
                  if (ui === "BUTTON") setSelection({ type: "cta" });
                }}
              >
                {INTRO_ADMIN_INTERACTION_UI.map((ui) => (
                  <option key={ui} value={ui}>{introInteractionLabel(ui, lang)}</option>
                ))}
              </select>
              {scene.interactionMode === "tap_layer" ? (
                <select
                  className="mt-2 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-sm"
                  value={scene.interactionLayerId ?? ""}
                  onChange={(e) => patchCommonScene({ ...scene, interactionLayerId: e.target.value || null })}
                >
                  <option value="">{lang === "en" ? "Choose element" : "요소 선택"}</option>
                  {scene.layers.map((l) => (
                    <option key={l.id} value={l.id}>{layerDisplayName(l, introLayerTypeLabel(l.type, lang))}</option>
                  ))}
                </select>
              ) : null}
              {scene.interactionMode === "tap_cta" ? (
                <AdminActionButton className="mt-2" variant="secondary" onClick={() => setSelection({ type: "cta" })}>
                  {lang === "en" ? "Edit button" : "버튼 편집"}
                </AdminActionButton>
              ) : null}
            </div>
          ) : null}
        </AdminCard>
      </div>

      <AdminCard>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["validate", "schedule", "publish"] as const).map((pane) => (
            <AdminActionButton key={pane} variant={secondary === pane ? "primary" : "secondary"} onClick={() => setSecondary(pane)}>
              {pane === "validate" ? (lang === "en" ? "Validation" : "검사") : pane === "schedule" ? (lang === "en" ? "Schedule" : "일정") : (lang === "en" ? "Publish review" : "게시 검토")}
            </AdminActionButton>
          ))}
        </div>

        {secondary === "validate" ? (
          issues.length === 0 ? (
            <p className="text-sm text-sam-muted">{lang === "en" ? "No validation issues." : "검사에서 발견한 문제가 없습니다."}</p>
          ) : (
            <ul className="space-y-2 text-sm text-red-800">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.code}`}>
                  <button
                    type="button"
                    className="text-left underline"
                    onClick={() => {
                      if (issue.sceneIndex != null && campaign.scenes[issue.sceneIndex]) {
                        setSceneId(campaign.scenes[issue.sceneIndex]!.id);
                      }
                      if (issue.layerId) setSelection({ type: "layer", id: issue.layerId });
                      else if (issue.path.includes("cta")) setSelection({ type: "cta" });
                    }}
                  >
                    {lang === "en" ? issue.messageEn : issue.messageKo}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {secondary === "schedule" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              {lang === "en" ? "Start (Manila)" : "시작 (마닐라)"}
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={isoToManilaLocal(campaign.startsAt)}
                onChange={(e) => patchCampaign({ ...campaign, startsAt: manilaLocalToIso(e.target.value) })}
              />
            </label>
            <label className="block text-sm">
              {lang === "en" ? "End (Manila)" : "종료 (마닐라)"}
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={isoToManilaLocal(campaign.endsAt)}
                onChange={(e) => patchCampaign({ ...campaign, endsAt: manilaLocalToIso(e.target.value) })}
              />
            </label>
            <p className="text-[12px] text-sam-muted md:col-span-2">
              {lang === "en" ? "Times are Asia/Manila (UTC+8). No UTC conversion is required." : "시간은 마닐라(UTC+8)입니다. UTC로 계산할 필요가 없습니다."}
            </p>
            <div className="md:col-span-2">
              <p className="mb-1 text-sm font-medium">{lang === "en" ? "Audience" : "대상"}</p>
              {INTRO_AUDIENCES.map((a) => (
                <label key={a} className="mr-3 inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={campaign.targeting.audiences.includes(a)}
                    onChange={() =>
                      patchCampaign({
                        ...campaign,
                        targeting: buildAdminTargeting({
                          audiences: toggleAudience(campaign.targeting.audiences, a),
                          platforms: campaign.targeting.platforms,
                          deviceChips: chips,
                        }),
                      })
                    }
                  />
                  {introAudienceLabel(a, lang)}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">{lang === "en" ? "Platform" : "플랫폼"}</p>
              {INTRO_PLATFORMS.map((p) => (
                <label key={p} className="mr-3 inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={campaign.targeting.platforms.includes(p)}
                    onChange={() =>
                      patchCampaign({
                        ...campaign,
                        targeting: buildAdminTargeting({
                          audiences: campaign.targeting.audiences,
                          platforms: togglePlatform(campaign.targeting.platforms, p),
                          deviceChips: chips,
                        }),
                      })
                    }
                  />
                  {introPlatformLabel(p, lang)}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">{lang === "en" ? "Device" : "기기"}</p>
              {INTRO_ADMIN_DEVICE_CHIPS.map((chip) => (
                <label key={chip} className="mr-3 inline-flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={chips.includes(chip)}
                    onChange={() =>
                      patchCampaign({
                        ...campaign,
                        targeting: buildAdminTargeting({
                          audiences: campaign.targeting.audiences,
                          platforms: campaign.targeting.platforms,
                          deviceChips: toggleDeviceChip(chips, chip as IntroAdminDeviceChip),
                        }),
                      })
                    }
                  />
                  {introDeviceFamilyLabel(chip === "Phone" ? "PHONE" : "TABLET", lang)}
                </label>
              ))}
            </div>
            <label className="block text-sm">
              {lang === "en" ? "Frequency" : "빈도"}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={campaign.frequencyMode}
                onChange={(e) =>
                  patchCampaign({ ...campaign, frequencyMode: e.target.value as IntroFrequencyMode })
                }
              >
                {INTRO_FREQUENCY_MODES.map((m) => (
                  <option key={m} value={m}>{introFrequencyLabel(m, lang)}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {secondary === "publish" ? (
          <div className="space-y-2 text-sm">
            <p>{lang === "en" ? "Scenes" : "장면"}: {campaign.scenes.length}</p>
            <p>{lang === "en" ? "Schedule" : "일정"}: {formatAdminScheduleRange(campaign.startsAt, campaign.endsAt, campaign.timezone, lang)}</p>
            <p>
              {lang === "en" ? "Target" : "대상"}:{" "}
              {campaign.targeting.audiences.length
                ? campaign.targeting.audiences.map((a) => introAudienceLabel(a, lang)).join(", ")
                : lang === "en"
                  ? "All"
                  : "전체"}
            </p>
            <p>
              {lang === "en" ? "Devices" : "기기"}:{" "}
              {chips.length
                ? chips.map((d) => introDeviceFamilyLabel(d === "Phone" ? "PHONE" : "TABLET", lang)).join(", ")
                : lang === "en"
                  ? "All"
                  : "전체"}
            </p>
            <p>
              {lang === "en" ? "Current revision" : "현재 리비전"}:{" "}
              {campaign.published?.revision != null
                ? `Revision ${campaign.published.revision}`
                : lang === "en"
                  ? "Not published"
                  : "게시 전"}
            </p>
            <p>
              {lang === "en" ? "Validation" : "검사"}:{" "}
              {issues.length
                ? lang === "en"
                  ? `${issues.length} issues`
                  : `문제 ${issues.length}건`
                : lang === "en"
                  ? "Ready"
                  : "문제 없음"}
            </p>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}

async function restoreDestinationLabels(
  campaign: IntroAdminCampaign,
  apply: (next: IntroAdminCampaign) => void
) {
  const byKind = new Map<string, string[]>();
  for (const scene of campaign.scenes) {
    const dest = scene.cta?.destination;
    if (!dest?.id || dest.label || !ENTITY_KINDS.has(dest.type)) continue;
    const list = byKind.get(dest.type) ?? [];
    list.push(dest.id);
    byKind.set(dest.type, list);
  }
  if (byKind.size === 0) return;
  const labels = new Map<string, string>();
  await Promise.all(
    [...byKind.entries()].map(async ([kind, ids]) => {
      const res = await fetch(
        `/api/admin/intro-campaigns/entity-search?kind=${encodeURIComponent(kind)}&ids=${encodeURIComponent(ids.join(","))}`,
        { credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; label: string }> };
      for (const item of json.items ?? []) labels.set(`${kind}:${item.id}`, item.label);
    })
  );
  apply({
    ...campaign,
    scenes: campaign.scenes.map((scene) => {
      const dest = scene.cta?.destination;
      if (!dest?.id) return scene;
      const label = labels.get(`${dest.type}:${dest.id}`);
      if (!label) return scene;
      return { ...scene, cta: scene.cta ? { ...scene.cta, destination: { ...dest, label } } : scene.cta };
    }),
  });
}

function SceneProps({
  scene,
  lang,
  onChange,
}: {
  scene: IntroAdminScene;
  lang: "ko" | "en";
  onChange: (scene: IntroAdminScene) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        {lang === "en" ? "Scene name" : "장면 이름"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={scene.name}
          onChange={(e) => onChange({ ...scene, name: e.target.value })}
        />
      </label>
      <label className="block">
        {lang === "en" ? "Advance" : "다음 화면으로"}
        <select
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={scene.advanceMode}
          onChange={(e) => {
            const advanceMode = e.target.value as IntroAdvanceMode;
            onChange({
              ...scene,
              advanceMode,
              durationMs: advanceMode === "timer" ? Math.max(1, scene.durationMs ?? 2500) : null,
              maxHoldMs: advanceMode === "timer" ? null : Math.max(1, scene.maxHoldMs ?? INTRO_ADMIN_DEFAULT_MAX_HOLD_MS),
            });
          }}
        >
          {INTRO_ADVANCE_MODES.map((m) => (
            <option key={m} value={m}>{introAdvanceLabel(m, lang)}</option>
          ))}
        </select>
      </label>
      {scene.advanceMode === "timer" ? (
        <label className="block">
          {lang === "en" ? "Duration (ms)" : "지속 시간 (ms)"}
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={scene.durationMs ?? ""}
            onChange={(e) => onChange({ ...scene, durationMs: Number(e.target.value) })}
          />
        </label>
      ) : (
        <label className="block">
          {lang === "en" ? "Max hold (ms)" : "최대 유지 (ms)"}
          <input
            type="number"
            min={1}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={scene.maxHoldMs ?? INTRO_ADMIN_DEFAULT_MAX_HOLD_MS}
            onChange={(e) => onChange({ ...scene, maxHoldMs: Number(e.target.value) })}
          />
        </label>
      )}
      <label className="block">
        {lang === "en" ? "Background color" : "배경색"}
        <input
          type="color"
          className="mt-1 h-9 w-16"
          value={scene.backgroundColor}
          onChange={(e) => onChange({ ...scene, backgroundColor: e.target.value })}
        />
      </label>
    </div>
  );
}

function LayerProps({
  layer,
  assets,
  lang,
  onChange,
}: {
  layer: IntroLayer;
  assets: readonly IntroAdminAsset[];
  lang: "ko" | "en";
  onChange: (layer: IntroLayer) => void;
}) {
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        {lang === "en" ? "Name" : "이름"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={layer.name ?? ""}
          onChange={(e) => onChange({ ...layer, name: e.target.value })}
        />
      </label>
      <p className="text-[12px] text-sam-muted">{introLayerTypeLabel(layer.type, lang)}</p>
      {(["xPct", "yPct", "widthPct", "heightPct", "opacity"] as const).map((key) => (
        <label key={key} className="block">
          {key === "xPct" ? (lang === "en" ? "X %" : "가로 위치 %")
            : key === "yPct" ? (lang === "en" ? "Y %" : "세로 위치 %")
              : key === "widthPct" ? (lang === "en" ? "Width %" : "너비 %")
                : key === "heightPct" ? (lang === "en" ? "Height %" : "높이 %")
                  : (lang === "en" ? "Opacity" : "투명도")}
          <input
            type="number"
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={layer[key] ?? ""}
            onChange={(e) => onChange({ ...layer, [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ))}
      {(layer.type === "IMAGE" || layer.type === "LOGO" || layer.type === "BACKGROUND") ? (
        <label className="block">
          {lang === "en" ? "Media" : "미디어"}
          <select
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={layer.assetId ?? ""}
            onChange={(e) => onChange({ ...layer, assetId: e.target.value || undefined })}
          >
            <option value="">{lang === "en" ? "None" : "없음"}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.width && a.height ? `${a.width}×${a.height}` : a.kind} {a.publicUrl ? "" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {layer.type === "TEXT" ? (
        <>
          <label className="block">
            {lang === "en" ? "Text" : "내용"}
            <textarea
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.text ?? ""}
              onChange={(e) => onChange({ ...layer, text: e.target.value })}
            />
          </label>
          <label className="block">
            {lang === "en" ? "Font size %" : "글자 크기 %"}
            <input
              type="number"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.fontSizePct ?? 4.2}
              onChange={(e) => onChange({ ...layer, fontSizePct: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            {lang === "en" ? "Weight" : "굵기"}
            <input
              type="number"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.fontWeight ?? 700}
              onChange={(e) => onChange({ ...layer, fontWeight: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            {lang === "en" ? "Line height" : "줄간격"}
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.lineHeight ?? 1.3}
              onChange={(e) => onChange({ ...layer, lineHeight: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            {lang === "en" ? "Align" : "정렬"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.textAlign ?? "center"}
              onChange={(e) => onChange({ ...layer, textAlign: e.target.value as IntroTextAlign })}
            >
              {INTRO_TEXT_ALIGNS.map((a) => (
                <option key={a} value={a}>{a === "left" ? (lang === "en" ? "Left" : "왼쪽") : a === "right" ? (lang === "en" ? "Right" : "오른쪽") : (lang === "en" ? "Center" : "가운데")}</option>
              ))}
            </select>
          </label>
          <label className="block">
            {lang === "en" ? "Max width %" : "최대 너비 %"}
            <input
              type="number"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.maxWidthPct ?? 80}
              onChange={(e) => onChange({ ...layer, maxWidthPct: Number(e.target.value) })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}

function CtaProps({
  scene,
  lang,
  hits,
  onSearch,
  onChange,
}: {
  scene: IntroAdminScene;
  lang: "ko" | "en";
  hits: Array<{ id: string; label: string; subtitle?: string }>;
  onSearch: (kind: string, q: string) => void;
  onChange: (scene: IntroAdminScene) => void;
}) {
  const cta = withCtaVisual(scene.cta);
  const dest = cta.destination;
  const patchCta = (partial: Partial<typeof cta>) => onChange({ ...scene, cta: { ...cta, ...partial } });
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        {lang === "en" ? "Button label" : "버튼 문구"}
        <input
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={cta.label ?? ""}
          onChange={(e) => patchCta({ label: e.target.value })}
        />
      </label>
      {(["xPct", "yPct", "widthPct", "heightPct", "fontSizePct", "fontWeight", "cornerRadiusPct", "opacity"] as const).map((key) => (
        <label key={key} className="block">
          {key}
          <input
            type="number"
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={cta[key] ?? ""}
            onChange={(e) => patchCta({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="block">
        {lang === "en" ? "Go to" : "이동할 화면"}
        <select
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={dest.type}
          onChange={(e) => patchCta({ destination: { type: e.target.value as IntroCtaDestinationType } })}
        >
          {INTRO_CTA_DESTINATION_TYPES.map((t) => (
            <option key={t} value={t}>{introCtaTypeLabel(t, lang)}</option>
          ))}
        </select>
      </label>
      {ENTITY_KINDS.has(dest.type) ? (
        <label className="block">
          {lang === "en" ? "Search" : "검색"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            onChange={(e) => onSearch(dest.type, e.target.value)}
          />
          <ul className="mt-1 space-y-1">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="text-left underline"
                  onClick={() => patchCta({ destination: { type: dest.type, id: hit.id, label: hit.label } })}
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
          {dest.label ? (
            <p className="mt-1 text-[12px] text-sam-fg">{dest.label}</p>
          ) : dest.id ? (
            <p className="mt-1 text-[12px] text-amber-800">{lang === "en" ? "Label is loading." : "이름을 불러오는 중입니다."}</p>
          ) : null}
        </label>
      ) : null}
      {dest.type === "INTERNAL_PATH" ? (
        <label className="block">
          {lang === "en" ? "Path" : "경로"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={dest.path ?? ""}
            onChange={(e) => patchCta({ destination: { type: dest.type, path: e.target.value } })}
          />
        </label>
      ) : null}
      {dest.type === "EXTERNAL_URL" ? (
        <label className="block">
          https
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={dest.url ?? ""}
            onChange={(e) => patchCta({ destination: { type: dest.type, url: e.target.value } })}
          />
        </label>
      ) : null}
    </div>
  );
}
