"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminIntroCompositionCanvas } from "@/components/admin/intro/AdminIntroCompositionCanvas";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isoToManilaLocal, manilaLocalToIso } from "@/components/admin/intro/intro-admin-time";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  applyIntroCmsSaveResult,
  discardIntroCmsEdits,
  introCmsCanDeleteScene,
  introCmsDeviceReadinessLabel,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  resolveIntroCmsUnsavedNavigation,
  type IntroCmsPreviewViewport,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import {
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  introAdvanceLabel,
  introAudienceLabel,
  introDeepLinkLabel,
  introFrequencyLabel,
  introLayerTypeLabel,
  introPlatformLabel,
  introStatusLabel,
} from "@/lib/startup/intro-v2/admin-labels";
import { isSupportedIntroImageMime } from "@/lib/startup/intro-operator-contract";
import {
  INTRO_ADMIN_DEVICE_CHIPS,
  buildAdminTargeting,
  deviceChipsFromClasses,
  toggleAudience,
  toggleDeviceChip,
  togglePlatform,
} from "@/lib/startup/intro-v2/admin-targeting-ui";
import {
  defaultNewScene,
  duplicateScene,
  nextSceneSortOrder,
  reorderScenes,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import {
  createLayerOfType,
  defaultImageLayer,
  emptyAnimationMeta,
  nextLayerId,
} from "@/lib/startup/intro-v2/composition";
import { adaptOperatorDraftToCanonical } from "@/lib/startup/intro-v2/legacy-operator-adapter";
import {
  INTRO_ADVANCE_MODES,
  INTRO_ANIMATION_TYPES,
  INTRO_ASPECT_POLICIES,
  INTRO_AUDIENCES,
  INTRO_CTA_DESTINATION_TYPES,
  INTRO_DECORATION_KINDS,
  INTRO_DEEP_LINK_POLICIES,
  INTRO_EASINGS,
  INTRO_FONT_TOKENS,
  INTRO_FREQUENCY_MODES,
  INTRO_LAYER_ANCHORS,
  INTRO_LAYER_TYPES,
  INTRO_PLATFORMS,
  INTRO_REPEAT_POLICIES,
  INTRO_SKIP_POLICIES,
  INTRO_TEXT_ALIGNS,
  INTRO_TRANSITIONS,
  type IntroAdvanceMode,
  type IntroAnimationMeta,
  type IntroAspectPolicy,
  type IntroCtaDestinationType,
  type IntroDecorationKind,
  type IntroDeepLinkPolicy,
  type IntroEasing,
  type IntroFontToken,
  type IntroFrequencyMode,
  type IntroLayer,
  type IntroLayerAnchor,
  type IntroLayerType,
  type IntroRepeatPolicy,
  type IntroSkipPolicy,
  type IntroTextAlign,
  type IntroTransition,
} from "@/lib/startup/intro-v2/types";

const FIELD =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg";

function firstIssueMessage(
  issues: readonly { messageKo?: string; messageEn?: string }[] | undefined,
  lang: "ko" | "en"
): string | null {
  const first = issues?.[0];
  if (!first) return null;
  return (lang === "en" ? first.messageEn : first.messageKo) || null;
}

function layerAnimation(layer: IntroLayer): IntroAnimationMeta {
  if (layer.animation && typeof layer.animation === "object") return layer.animation;
  return emptyAnimationMeta();
}

export function AdminIntroCmsEditorPage({ campaignId }: { campaignId: string }) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [campaign, setCampaign] = useState<IntroAdminCampaign | null>(null);
  const [saved, setSaved] = useState<IntroAdminCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<IntroCmsPreviewViewport>("phone");
  const [guardOpen, setGuardOpen] = useState(false);
  const leaveHrefRef = useRef<string | null>(null);
  const campaignRef = useRef<IntroAdminCampaign | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyLoaded = useCallback((next: IntroAdminCampaign) => {
    const adapted = adaptOperatorDraftToCanonical(next);
    const copy = discardIntroCmsEdits(adapted);
    setCampaign(copy);
    setSaved(discardIntroCmsEdits(adapted));
    setSceneId((cur) => cur ?? adapted.scenes[0]?.id ?? null);
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
    }
    setLoading(false);
  }, [applyLoaded, campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  campaignRef.current = campaign;
  const dirty = campaign && saved ? introCmsIsDirty(campaign, saved) : false;

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const requestLeave = (href: string) => {
    if (!dirty) {
      router.push(href);
      return;
    }
    leaveHrefRef.current = href;
    setGuardOpen(true);
  };

  const confirmGuard = (decision: "stay" | "discard_leave") => {
    const resolution = resolveIntroCmsUnsavedNavigation({ dirty, decision });
    if (resolution === "block") {
      setGuardOpen(false);
      leaveHrefRef.current = null;
      return;
    }
    const href = leaveHrefRef.current ?? "/admin/intro";
    setGuardOpen(false);
    leaveHrefRef.current = null;
    router.push(href);
  };

  const patchCampaign = (next: IntroAdminCampaign) => setCampaign(next);
  const patchScenes = (scenes: IntroAdminScene[]) => {
    if (!campaign) return;
    patchCampaign({ ...campaign, scenes });
  };
  const patchScene = (next: IntroAdminScene) => {
    if (!campaign) return;
    patchScenes(campaign.scenes.map((scene) => (scene.id === next.id ? next : scene)));
  };

  const scene = campaign?.scenes.find((item) => item.id === sceneId) ?? campaign?.scenes[0] ?? null;
  const layer = scene?.layers.find((item) => item.id === layerId) ?? null;

  const saveDraft = async (): Promise<boolean> => {
    const current = campaignRef.current;
    if (!current) return false;
    setBusy(true);
    const res = await fetch(`/api/admin/intro-campaigns/${current.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(introCmsDraftSavePayload(current)),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: IntroAdminCampaign;
      issues?: { messageKo?: string; messageEn?: string }[];
    };
    setBusy(false);
    const applied = applyIntroCmsSaveResult({
      current,
      ok: Boolean(res.ok && json.ok && json.campaign),
      saved: json.campaign ?? null,
    });
    setCampaign(applied.campaign);
    if (applied.persisted && json.campaign) {
      const adapted = adaptOperatorDraftToCanonical(json.campaign);
      setCampaign(discardIntroCmsEdits(adapted));
      setSaved(discardIntroCmsEdits(adapted));
      setError(null);
      return true;
    }
    setError(
      firstIssueMessage(json.issues, lang) ??
        safeT("admin_intro_save_failed", {
          fallbackKo: "저장에 실패했습니다. 편집 내용은 그대로 있습니다.",
          fallbackEn: "Save failed. Your unsaved edits are still here.",
        })
    );
    return false;
  };

  const discardEdits = () => {
    if (!saved) return;
    const restored = discardIntroCmsEdits(saved);
    setCampaign(restored);
    setSceneId(restored.scenes[0]?.id ?? null);
    setLayerId(null);
    setError(null);
  };

  const addScene = () => {
    if (!campaign) return;
    const next = defaultNewScene(
      `tmp-${Date.now()}`,
      nextSceneSortOrder(campaign.scenes),
      lang === "en" ? `Scene ${campaign.scenes.length + 1}` : `장면 ${campaign.scenes.length + 1}`
    );
    patchScenes([...campaign.scenes, next]);
    setSceneId(next.id);
  };

  const dupScene = () => {
    if (!campaign || !scene) return;
    const next = duplicateScene(scene, `tmp-${Date.now()}`, nextSceneSortOrder(campaign.scenes));
    patchScenes([...campaign.scenes, next]);
    setSceneId(next.id);
  };

  const deleteScene = () => {
    if (!campaign || !scene || !introCmsCanDeleteScene(campaign.scenes.length)) return;
    const remaining = campaign.scenes.filter((item) => item.id !== scene.id).map((item, index) => ({
      ...item,
      sortOrder: index,
    }));
    patchScenes(remaining);
    setSceneId(remaining[0]?.id ?? null);
    setLayerId(null);
  };

  const moveScene = (dir: -1 | 1) => {
    if (!campaign || !scene) return;
    const from = campaign.scenes.findIndex((item) => item.id === scene.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= campaign.scenes.length) return;
    patchScenes(reorderScenes(campaign.scenes, from, to));
  };

  const patchLayer = (next: IntroLayer) => {
    if (!scene) return;
    let nextScene: IntroAdminScene = {
      ...scene,
      layers: scene.layers.map((item) => (item.id === next.id ? next : item)),
    };
    if (next.type === "CTA") {
      nextScene = {
        ...nextScene,
        cta: {
          ...(scene.cta ?? { destination: { type: "COMMUNITY" }, label: "" }),
          enabled: next.visible !== false,
          destination: scene.cta?.destination ?? { type: "COMMUNITY" },
          label: next.text ?? scene.cta?.label ?? "",
          xPct: next.xPct,
          yPct: next.yPct,
          widthPct: next.widthPct,
          heightPct: next.heightPct,
        },
      };
    }
    patchScene(nextScene);
  };

  const addLayer = (type: IntroLayerType) => {
    if (!scene) return;
    const next = createLayerOfType(type, nextLayerId(), scene.layers.length + 1);
    let nextScene: IntroAdminScene = { ...scene, layers: [...scene.layers, next] };
    if (type === "CTA") {
      nextScene = {
        ...nextScene,
        cta: {
          ...(scene.cta ?? { destination: { type: "COMMUNITY" }, label: "시작하기" }),
          enabled: true,
          destination: scene.cta?.destination ?? { type: "COMMUNITY" },
          label: next.text ?? scene.cta?.label ?? "시작하기",
          xPct: next.xPct,
          yPct: next.yPct,
          widthPct: next.widthPct,
          heightPct: next.heightPct,
        },
      };
    }
    patchScene(nextScene);
    setLayerId(next.id);
  };

  const dupLayer = () => {
    if (!scene || !layer) return;
    const next: IntroLayer = {
      ...layer,
      id: nextLayerId(),
      name: `${layer.name || layer.type} copy`,
      zIndex: scene.layers.length + 1,
    };
    patchScene({ ...scene, layers: [...scene.layers, next] });
    setLayerId(next.id);
  };

  const deleteLayer = () => {
    if (!scene || !layer) return;
    patchScene({
      ...scene,
      layers: scene.layers
        .filter((item) => item.id !== layer.id)
        .map((item, index) => ({ ...item, zIndex: index + 1 })),
    });
    setLayerId(null);
  };

  const moveLayerZ = (dir: -1 | 1) => {
    if (!scene || !layer) return;
    const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
    const from = ordered.findIndex((item) => item.id === layer.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ordered.length) return;
    const swapped = [...ordered];
    const a = swapped[from];
    const b = swapped[to];
    if (!a || !b) return;
    swapped[from] = b;
    swapped[to] = a;
    patchScene({
      ...scene,
      layers: swapped.map((item, index) => ({ ...item, zIndex: index + 1 })),
    });
  };

  const onUpload = async (file: File) => {
    if (!campaign || !scene) return;
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
    const regJson = (await reg.json().catch(() => ({}))) as { ok?: boolean; asset?: IntroAdminAsset };
    if (!reg.ok || !regJson.ok || !regJson.asset) {
      setError(lang === "en" ? "Could not keep the image." : "이미지를 저장하지 못했습니다.");
      return;
    }
    const nextAsset = regJson.asset;
    const target =
      scene.layers.find(
        (item) =>
          item.id === layerId &&
          (item.type === "IMAGE" ||
            item.type === "LOGO" ||
            item.type === "BACKGROUND" ||
            (item.type === "DECORATION" && item.decorationKind === "sticker"))
      ) ??
      scene.layers.find((item) => item.type === "IMAGE") ??
      defaultImageLayer(nextLayerId(), scene.layers.length + 1);
    const layers = scene.layers.some((item) => item.id === target.id)
      ? scene.layers.map((item) => (item.id === target.id ? { ...item, assetId: nextAsset.id } : item))
      : [...scene.layers, { ...target, assetId: nextAsset.id }];
    setCampaign({
      ...campaign,
      assets: [...campaign.assets.filter((asset) => asset.id !== nextAsset.id), nextAsset],
      scenes: campaign.scenes.map((item) => (item.id === scene.id ? { ...scene, layers } : item)),
    });
    setLayerId(target.id);
    setError(null);
  };

  const publish = async () => {
    if (!campaign) return;
    const savedOk = await saveDraft();
    if (!savedOk) return;
    setBusy(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}/publish`, {
      method: "POST",
      credentials: "same-origin",
    });
    const pubJson = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      issues?: { messageKo?: string; messageEn?: string }[];
    };
    setBusy(false);
    if (!res.ok) {
      setError(
        firstIssueMessage(pubJson.issues, lang) ??
          (lang === "en" ? "Publish failed." : "게시에 실패했습니다.")
      );
      return;
    }
    await load();
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
    setBusy(false);
    if (!res.ok) {
      setError(lang === "en" ? "Lifecycle update failed." : "상태 변경에 실패했습니다.");
      return;
    }
    await load();
  };

  const targeting = campaign?.targeting;
  const chips = targeting ? deviceChipsFromClasses(targeting.deviceClasses) : [];

  if (loading) {
    return (
      <AdminCard>
        <p className="text-sam-muted">{lang === "en" ? "Loading…" : "불러오는 중…"}</p>
      </AdminCard>
    );
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
  if (!campaign || !saved) {
    return (
      <AdminCard>
        <p className="text-red-800">{error}</p>
      </AdminCard>
    );
  }

  return (
    <div
      className="space-y-4"
      data-intro-editor="cms-v1"
      data-intro-dirty={dirty ? "true" : "false"}
      data-intro-name={campaign.name}
    >
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span data-intro-back="1">
          <AppBackButton
            backHref="/admin/intro"
            interceptBack={() => {
              if (!dirty) return false;
              requestLeave("/admin/intro");
              return true;
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">
            {campaign.name || (lang === "en" ? "Intro" : "인트로")}
          </h1>
          <p className="mt-1 font-normal text-sam-muted sam-text-body">
            {safeT("admin_intro_cms_description", {
              fallbackKo: "하나의 구성으로 캠페인을 편집합니다. 미리보기 기기를 바꿔도 별도 크리에이티브를 만들지 않습니다.",
              fallbackEn: "Edit one authored composition. Changing the preview viewport does not create a separate creative.",
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AdminToneBadge tone={dirty ? "warning" : "success"}>
          {dirty
            ? safeT("admin_intro_dirty", { fallbackKo: "저장하지 않은 변경사항", fallbackEn: "Unsaved changes" })
            : safeT("admin_intro_saved", { fallbackKo: "저장됨", fallbackEn: "Saved" })}
        </AdminToneBadge>
        <AdminToneBadge tone="neutral">{introStatusLabel(campaign.status, lang)}</AdminToneBadge>
        <span className="text-xs text-sam-muted">{introCmsDeviceReadinessLabel(lang)}</span>
        <AdminActionButton
          variant="primary"
          disabled={busy || !dirty}
          data-intro-save="1"
          onClick={() => void saveDraft()}
        >
          {safeT("admin_intro_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={busy || !dirty} onClick={discardEdits}>
          {safeT("admin_intro_discard", { fallbackKo: "변경 취소", fallbackEn: "Discard changes" })}
        </AdminActionButton>
        <AdminActionButton variant="quiet" disabled={busy} onClick={() => void publish()}>
          {safeT("admin_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
        {campaign.status === "active" || campaign.status === "scheduled" ? (
          <AdminActionButton variant="quiet" disabled={busy} onClick={() => void transition("pause")}>
            {safeT("admin_intro_pause", { fallbackKo: "일시중지", fallbackEn: "Pause" })}
          </AdminActionButton>
        ) : null}
        {campaign.status === "paused" ? (
          <AdminActionButton variant="quiet" disabled={busy} onClick={() => void transition("resume")}>
            {safeT("admin_intro_resume", { fallbackKo: "다시 시작", fallbackEn: "Resume" })}
          </AdminActionButton>
        ) : null}
        {campaign.status !== "draft" && campaign.status !== "archived" ? (
          <AdminActionButton variant="quiet" disabled={busy} onClick={() => void transition("archive")}>
            {safeT("admin_intro_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
          </AdminActionButton>
        ) : null}
      </div>
      {error ? <p className="text-red-800">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <AdminCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {safeT("admin_intro_scenes", { fallbackKo: "장면", fallbackEn: "Scenes" })}
            </h2>
            <AdminActionButton variant="secondary" onClick={addScene}>
              {safeT("admin_intro_add_scene", { fallbackKo: "장면 추가", fallbackEn: "Add scene" })}
            </AdminActionButton>
          </div>
          <ol className="space-y-2" data-intro-scene-navigator="1">
            {campaign.scenes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
                    item.id === scene?.id ? "border-sam-fg bg-sam-surface-muted" : "border-sam-border"
                  }`}
                  onClick={() => {
                    setSceneId(item.id);
                    setLayerId(null);
                  }}
                >
                  <span className="font-medium text-sam-fg">{item.name || item.id}</span>
                  <span className="mt-0.5 block text-[12px] text-sam-muted">
                    {introAdvanceLabel(item.advanceMode, lang)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <AdminActionButton variant="quiet" disabled={!scene} onClick={dupScene}>
              {safeT("admin_intro_duplicate_scene", { fallbackKo: "장면 복제", fallbackEn: "Duplicate scene" })}
            </AdminActionButton>
            <AdminActionButton
              variant="quiet"
              disabled={!scene || !introCmsCanDeleteScene(campaign.scenes.length)}
              onClick={deleteScene}
            >
              {safeT("admin_intro_delete_scene", { fallbackKo: "장면 삭제", fallbackEn: "Delete scene" })}
            </AdminActionButton>
            <AdminActionButton variant="quiet" disabled={!scene} onClick={() => moveScene(-1)}>
              {safeT("admin_intro_move_up", { fallbackKo: "위로", fallbackEn: "Move up" })}
            </AdminActionButton>
            <AdminActionButton variant="quiet" disabled={!scene} onClick={() => moveScene(1)}>
              {safeT("admin_intro_move_down", { fallbackKo: "아래로", fallbackEn: "Move down" })}
            </AdminActionButton>
          </div>
        </AdminCard>

        <div className="space-y-4">
          <AdminCard>
            <div className="mb-3 flex flex-wrap gap-2">
              {(["phone", "tablet", "wide"] as const).map((value) => (
                <AdminActionButton
                  key={value}
                  variant={viewport === value ? "primary" : "secondary"}
                  onClick={() => setViewport(value)}
                >
                  {value === "phone"
                    ? safeT("admin_intro_preview_phone", { fallbackKo: "Phone", fallbackEn: "Phone" })
                    : value === "tablet"
                      ? safeT("admin_intro_preview_tablet", { fallbackKo: "Tablet", fallbackEn: "Tablet" })
                      : safeT("admin_intro_preview_wide", { fallbackKo: "Wide 확인", fallbackEn: "Wide check" })}
                </AdminActionButton>
              ))}
            </div>
            <AdminIntroCompositionCanvas
              campaignId={campaign.id}
              scene={scene}
              assets={campaign.assets}
              viewport={viewport}
              selectedLayerId={layer?.id ?? null}
              onSelectLayer={setLayerId}
              onMoveLayerPct={(id, xPct, yPct) => {
                const current = scene?.layers.find((item) => item.id === id);
                if (!current) return;
                patchLayer({ ...current, xPct, yPct });
              }}
            />
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_layers", { fallbackKo: "레이어", fallbackEn: "Layers" })}
            </h2>
            <p className="mb-3 text-sm text-sam-muted">
              {safeT("admin_intro_layer_authoring", {
                fallbackKo: "하나의 구성에 레이어를 추가합니다. Phone/Tablet/Wide는 미리보기만 바꿉니다.",
                fallbackEn: "Add layers to one composition. Phone/Tablet/Wide only change the preview viewport.",
              })}
            </p>
            <ul className="space-y-2" data-intro-layer-inventory="1">
              {scene?.layers.length ? (
                scene.layers
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
                          item.id === layer?.id ? "border-sam-fg bg-sam-surface-muted" : "border-sam-border"
                        }`}
                        onClick={() => setLayerId(item.id)}
                      >
                        {introLayerTypeLabel(item.type, lang)} · {item.name || item.id}
                        {item.visible === false ? (lang === "en" ? " · hidden" : " · 숨김") : ""}
                      </button>
                    </li>
                  ))
              ) : (
                <li className="text-sm text-sam-muted">{lang === "en" ? "No layers yet." : "레이어가 없습니다."}</li>
              )}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {INTRO_LAYER_TYPES.map((type) => (
                <AdminActionButton key={type} variant="secondary" disabled={!scene} onClick={() => addLayer(type)}>
                  {introLayerTypeLabel(type, lang)}
                </AdminActionButton>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <AdminActionButton variant="quiet" disabled={!layer} onClick={dupLayer}>
                {safeT("admin_intro_duplicate_layer", { fallbackKo: "레이어 복제", fallbackEn: "Duplicate layer" })}
              </AdminActionButton>
              <AdminActionButton variant="quiet" disabled={!layer} onClick={deleteLayer}>
                {safeT("admin_intro_delete_layer", { fallbackKo: "레이어 삭제", fallbackEn: "Delete layer" })}
              </AdminActionButton>
              <AdminActionButton variant="quiet" disabled={!layer} onClick={() => moveLayerZ(1)}>
                {safeT("admin_intro_layer_forward", { fallbackKo: "앞으로", fallbackEn: "Forward" })}
              </AdminActionButton>
              <AdminActionButton variant="quiet" disabled={!layer} onClick={() => moveLayerZ(-1)}>
                {safeT("admin_intro_layer_back", { fallbackKo: "뒤로", fallbackEn: "Back" })}
              </AdminActionButton>
            </div>
          </AdminCard>
        </div>

        <div className="space-y-4">
          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_properties", { fallbackKo: "속성", fallbackEn: "Properties" })}
            </h2>
            <label className="block text-sm">
              {lang === "en" ? "Campaign name" : "캠페인 이름"}
              <input
                className={FIELD}
                value={campaign.name}
                onChange={(e) => patchCampaign({ ...campaign, name: e.target.value })}
              />
            </label>
            <p className="mt-3 text-sm text-sam-muted">
              {lang === "en" ? "Status" : "상태"}: {introStatusLabel(campaign.status, lang)}
            </p>
            {scene ? (
              <>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Scene name" : "장면 이름"}
                  <input className={FIELD} value={scene.name} onChange={(e) => patchScene({ ...scene, name: e.target.value })} />
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Advance" : "진행"}
                  <select
                    className={FIELD}
                    value={scene.advanceMode}
                    onChange={(e) =>
                      patchScene({ ...scene, advanceMode: e.target.value as IntroAdvanceMode })
                    }
                  >
                    {INTRO_ADVANCE_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {introAdvanceLabel(mode, lang)}
                      </option>
                    ))}
                  </select>
                </label>
                {scene.advanceMode === "timer" ? (
                  <label className="mt-3 block text-sm">
                    {lang === "en" ? "Duration (ms)" : "시간 (ms)"}
                    <input
                      className={FIELD}
                      type="number"
                      min={1}
                      value={scene.durationMs ?? ""}
                      onChange={(e) =>
                        patchScene({
                          ...scene,
                          durationMs: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </label>
                ) : null}
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Max hold (ms)" : "최대 유지 (ms)"}
                  <input
                    className={FIELD}
                    type="number"
                    min={1}
                    value={scene.maxHoldMs ?? ""}
                    onChange={(e) =>
                      patchScene({
                        ...scene,
                        maxHoldMs: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Transition" : "전환"}
                  <select
                    className={FIELD}
                    value={scene.transition}
                    onChange={(e) => patchScene({ ...scene, transition: e.target.value as IntroTransition })}
                  >
                    {INTRO_TRANSITIONS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Transition duration (ms)" : "전환 시간 (ms)"}
                  <input
                    className={FIELD}
                    type="number"
                    min={0}
                    value={scene.transitionMs ?? 280}
                    onChange={(e) =>
                      patchScene({
                        ...scene,
                        transitionMs: e.target.value ? Number(e.target.value) : 280,
                      })
                    }
                  />
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Transition easing" : "전환 이징"}
                  <select
                    className={FIELD}
                    value={scene.transitionEasing ?? "ease_out"}
                    onChange={(e) => patchScene({ ...scene, transitionEasing: e.target.value })}
                  >
                    {INTRO_EASINGS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Skip" : "건너뛰기"}
                  <select
                    className={FIELD}
                    value={scene.skipPolicy}
                    onChange={(e) => patchScene({ ...scene, skipPolicy: e.target.value as IntroSkipPolicy })}
                  >
                    {INTRO_SKIP_POLICIES.map((value) => (
                      <option key={value} value={value}>
                        {value === "allow" ? (lang === "en" ? "Allow" : "허용") : lang === "en" ? "Deny" : "불가"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Background" : "배경"}
                  <input
                    type="color"
                    className="ml-2 align-middle"
                    value={scene.backgroundColor || "#ffffff"}
                    onChange={(e) => patchScene({ ...scene, backgroundColor: e.target.value })}
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(scene.cta?.enabled)}
                    onChange={(e) =>
                      patchScene({
                        ...scene,
                        cta: {
                          ...(scene.cta ?? { destination: { type: "COMMUNITY" }, label: "" }),
                          enabled: e.target.checked,
                          destination: scene.cta?.destination ?? { type: "COMMUNITY" },
                        },
                      })
                    }
                  />
                  {lang === "en" ? "CTA enabled" : "CTA 사용"}
                </label>
                {scene.cta?.enabled ? (
                  <>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "CTA label" : "CTA 문구"}
                      <input
                        className={FIELD}
                        value={scene.cta.label ?? ""}
                        onChange={(e) =>
                          patchScene({
                            ...scene,
                            cta: { ...scene.cta!, label: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "CTA action" : "CTA 동작"}
                      <select
                        className={FIELD}
                        value={scene.cta.destination.type}
                        onChange={(e) =>
                          patchScene({
                            ...scene,
                            cta: {
                              ...scene.cta!,
                              destination: { type: e.target.value as IntroCtaDestinationType },
                            },
                          })
                        }
                      >
                        {INTRO_CTA_DESTINATION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    {["STORE", "PRODUCT", "LISTING", "POST", "CHAT_ROOM", "EVENT"].includes(
                      scene.cta.destination.type
                    ) ? (
                      <label className="mt-3 block text-sm">
                        {lang === "en" ? "Target id" : "대상 ID"}
                        <input
                          className={FIELD}
                          value={scene.cta.destination.id ?? ""}
                          onChange={(e) =>
                            patchScene({
                              ...scene,
                              cta: {
                                ...scene.cta!,
                                destination: { ...scene.cta!.destination, id: e.target.value },
                              },
                            })
                          }
                        />
                      </label>
                    ) : null}
                    {scene.cta.destination.type === "INTERNAL_PATH" ? (
                      <label className="mt-3 block text-sm">
                        {lang === "en" ? "Path" : "경로"}
                        <input
                          className={FIELD}
                          value={scene.cta.destination.path ?? ""}
                          onChange={(e) =>
                            patchScene({
                              ...scene,
                              cta: {
                                ...scene.cta!,
                                destination: { ...scene.cta!.destination, path: e.target.value },
                              },
                            })
                          }
                        />
                      </label>
                    ) : null}
                    {scene.cta.destination.type === "EXTERNAL_URL" ? (
                      <label className="mt-3 block text-sm">
                        {lang === "en" ? "https URL" : "https 주소"}
                        <input
                          className={FIELD}
                          value={scene.cta.destination.url ?? ""}
                          onChange={(e) =>
                            patchScene({
                              ...scene,
                              cta: {
                                ...scene.cta!,
                                destination: { ...scene.cta!.destination, url: e.target.value },
                              },
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}
            {layer ? (
              <>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Layer name" : "레이어 이름"}
                  <input
                    className={FIELD}
                    value={layer.name ?? ""}
                    onChange={(e) => patchLayer({ ...layer, name: e.target.value })}
                  />
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={layer.visible !== false}
                    onChange={(e) => patchLayer({ ...layer, visible: e.target.checked })}
                  />
                  {lang === "en" ? "Visible" : "표시"}
                </label>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={layer.safeArea !== false}
                    onChange={(e) => patchLayer({ ...layer, safeArea: e.target.checked })}
                  />
                  {lang === "en" ? "Safe-area relative" : "안전 영역 기준"}
                </label>
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Anchor" : "앵커"}
                  <select
                    className={FIELD}
                    value={layer.anchor}
                    onChange={(e) => patchLayer({ ...layer, anchor: e.target.value as IntroLayerAnchor })}
                  >
                    {INTRO_LAYER_ANCHORS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                {(["xPct", "yPct", "widthPct", "heightPct"] as const).map((key) => (
                  <label key={key} className="mt-3 block text-sm">
                    {key}
                    <input
                      className={FIELD}
                      type="number"
                      min={0}
                      max={100}
                      value={layer[key] ?? ""}
                      onChange={(e) =>
                        patchLayer({
                          ...layer,
                          [key]: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                {layer.type === "IMAGE" || layer.type === "LOGO" || layer.type === "BACKGROUND" ? (
                  <label className="mt-3 block text-sm">
                    {lang === "en" ? "Aspect" : "비율"}
                    <select
                      className={FIELD}
                      value={layer.aspectPolicy ?? "contain"}
                      onChange={(e) =>
                        patchLayer({ ...layer, aspectPolicy: e.target.value as IntroAspectPolicy })
                      }
                    >
                      {INTRO_ASPECT_POLICIES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {layer.type === "TEXT" || layer.type === "CTA" ? (
                  <>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Text" : "텍스트"}
                      <textarea
                        className={FIELD}
                        rows={3}
                        value={layer.text ?? ""}
                        onChange={(e) => patchLayer({ ...layer, text: e.target.value })}
                      />
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Font token" : "글꼴 토큰"}
                      <select
                        className={FIELD}
                        value={layer.fontToken ?? "body"}
                        onChange={(e) =>
                          patchLayer({ ...layer, fontToken: e.target.value as IntroFontToken })
                        }
                      >
                        {INTRO_FONT_TOKENS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Align" : "정렬"}
                      <select
                        className={FIELD}
                        value={layer.textAlign ?? "center"}
                        onChange={(e) =>
                          patchLayer({ ...layer, textAlign: e.target.value as IntroTextAlign })
                        }
                      >
                        {INTRO_TEXT_ALIGNS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Color" : "색"}
                      <input
                        type="color"
                        className="ml-2 align-middle"
                        value={layer.color || "#111827"}
                        onChange={(e) => patchLayer({ ...layer, color: e.target.value })}
                      />
                    </label>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={layer.wrap !== false}
                        onChange={(e) => patchLayer({ ...layer, wrap: e.target.checked })}
                      />
                      {lang === "en" ? "Wrap" : "줄바꿈"}
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Max lines" : "최대 줄"}
                      <input
                        className={FIELD}
                        type="number"
                        min={1}
                        value={layer.maxLines ?? 3}
                        onChange={(e) =>
                          patchLayer({
                            ...layer,
                            maxLines: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </label>
                  </>
                ) : null}
                {layer.type === "DECORATION" ? (
                  <>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Decoration" : "장식"}
                      <select
                        className={FIELD}
                        value={layer.decorationKind ?? "shape"}
                        onChange={(e) =>
                          patchLayer({
                            ...layer,
                            decorationKind: e.target.value as IntroDecorationKind,
                          })
                        }
                      >
                        {INTRO_DECORATION_KINDS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Fill" : "채움"}
                      <input
                        type="color"
                        className="ml-2 align-middle"
                        value={layer.fillColor || "#a855f7"}
                        onChange={(e) => patchLayer({ ...layer, fillColor: e.target.value })}
                      />
                    </label>
                  </>
                ) : null}
                {(["enter", "emphasis", "exit"] as const).map((phase) => {
                  const clip = layerAnimation(layer)[phase] ?? {
                    type: "none" as const,
                    durationMs: 0,
                    delayMs: 0,
                    easing: "ease_out" as const,
                    repeat: "none" as const,
                  };
                  return (
                    <div key={phase} className="mt-3 rounded-ui-rect border border-sam-border p-2">
                      <p className="text-xs font-medium uppercase text-sam-muted">{phase}</p>
                      <label className="mt-2 block text-sm">
                        {lang === "en" ? "Type" : "종류"}
                        <select
                          className={FIELD}
                          value={clip.type}
                          onChange={(e) =>
                            patchLayer({
                              ...layer,
                              animation: {
                                ...layerAnimation(layer),
                                [phase]: { ...clip, type: e.target.value as (typeof INTRO_ANIMATION_TYPES)[number] },
                              },
                            })
                          }
                        >
                          {INTRO_ANIMATION_TYPES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="mt-2 block text-sm">
                        {lang === "en" ? "Duration (ms)" : "시간 (ms)"}
                        <input
                          className={FIELD}
                          type="number"
                          min={0}
                          value={clip.durationMs}
                          onChange={(e) =>
                            patchLayer({
                              ...layer,
                              animation: {
                                ...layerAnimation(layer),
                                [phase]: { ...clip, durationMs: Number(e.target.value || 0) },
                              },
                            })
                          }
                        />
                      </label>
                      <label className="mt-2 block text-sm">
                        {lang === "en" ? "Delay (ms)" : "지연 (ms)"}
                        <input
                          className={FIELD}
                          type="number"
                          min={0}
                          value={clip.delayMs}
                          onChange={(e) =>
                            patchLayer({
                              ...layer,
                              animation: {
                                ...layerAnimation(layer),
                                [phase]: { ...clip, delayMs: Number(e.target.value || 0) },
                              },
                            })
                          }
                        />
                      </label>
                      <label className="mt-2 block text-sm">
                        easing
                        <select
                          className={FIELD}
                          value={clip.easing}
                          onChange={(e) =>
                            patchLayer({
                              ...layer,
                              animation: {
                                ...layerAnimation(layer),
                                [phase]: { ...clip, easing: e.target.value as IntroEasing },
                              },
                            })
                          }
                        >
                          {INTRO_EASINGS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="mt-2 block text-sm">
                        {lang === "en" ? "Repeat" : "반복"}
                        <select
                          className={FIELD}
                          value={clip.repeat}
                          onChange={(e) =>
                            patchLayer({
                              ...layer,
                              animation: {
                                ...layerAnimation(layer),
                                [phase]: { ...clip, repeat: e.target.value as IntroRepeatPolicy },
                              },
                            })
                          }
                        >
                          {INTRO_REPEAT_POLICIES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </>
            ) : null}
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_media", { fallbackKo: "미디어", fallbackEn: "Media" })}
            </h2>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-sm text-sam-muted">
              {lang === "en" ? "PNG, JPEG, static WebP. GIF and MP4 are not in this phase." : "PNG, JPEG, 정적 WebP. GIF/MP4는 이 단계에 없습니다."}
            </p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_schedule", { fallbackKo: "예약", fallbackEn: "Schedule" })}
            </h2>
            <label className="block text-sm">
              {lang === "en" ? "Starts" : "시작"}
              <input
                className={FIELD}
                type="datetime-local"
                value={isoToManilaLocal(campaign.startsAt)}
                onChange={(e) => patchCampaign({ ...campaign, startsAt: manilaLocalToIso(e.target.value) })}
              />
            </label>
            <label className="mt-3 block text-sm">
              {lang === "en" ? "Ends" : "종료"}
              <input
                className={FIELD}
                type="datetime-local"
                value={isoToManilaLocal(campaign.endsAt)}
                onChange={(e) => patchCampaign({ ...campaign, endsAt: manilaLocalToIso(e.target.value) })}
              />
            </label>
            <p className="mt-2 text-xs text-sam-muted">{campaign.timezone || INTRO_ADMIN_DEFAULT_TIMEZONE}</p>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_targeting", { fallbackKo: "대상", fallbackEn: "Targeting" })}
            </h2>
            <p className="mb-2 text-xs text-sam-muted">
              {lang === "en" ? "Empty dimension = all. DeviceClass is eligibility, not a second creative." : "빈 차원은 전체. DeviceClass는 대상 조건이며 별도 크리에이티브가 아닙니다."}
            </p>
            <div className="flex flex-wrap gap-2">
              {INTRO_AUDIENCES.map((value) => (
                <AdminActionButton
                  key={value}
                  variant={targeting?.audiences.includes(value) ? "primary" : "secondary"}
                  onClick={() =>
                    patchCampaign({
                      ...campaign,
                      targeting: buildAdminTargeting({
                        audiences: toggleAudience(targeting?.audiences ?? [], value),
                        platforms: targeting?.platforms ?? [],
                        deviceChips: chips,
                      }),
                    })
                  }
                >
                  {introAudienceLabel(value, lang)}
                </AdminActionButton>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTRO_PLATFORMS.map((value) => (
                <AdminActionButton
                  key={value}
                  variant={targeting?.platforms.includes(value) ? "primary" : "secondary"}
                  onClick={() =>
                    patchCampaign({
                      ...campaign,
                      targeting: buildAdminTargeting({
                        audiences: targeting?.audiences ?? [],
                        platforms: togglePlatform(targeting?.platforms ?? [], value),
                        deviceChips: chips,
                      }),
                    })
                  }
                >
                  {introPlatformLabel(value, lang)}
                </AdminActionButton>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTRO_ADMIN_DEVICE_CHIPS.map((chip) => (
                <AdminActionButton
                  key={chip}
                  variant={chips.includes(chip) ? "primary" : "secondary"}
                  onClick={() =>
                    patchCampaign({
                      ...campaign,
                      targeting: buildAdminTargeting({
                        audiences: targeting?.audiences ?? [],
                        platforms: targeting?.platforms ?? [],
                        deviceChips: toggleDeviceChip(chips, chip),
                      }),
                    })
                  }
                >
                  {chip}
                </AdminActionButton>
              ))}
            </div>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_frequency", { fallbackKo: "노출 빈도", fallbackEn: "Frequency" })}
            </h2>
            <select
              className={FIELD}
              value={campaign.frequencyMode}
              onChange={(e) =>
                patchCampaign({ ...campaign, frequencyMode: e.target.value as IntroFrequencyMode })
              }
            >
              {INTRO_FREQUENCY_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {introFrequencyLabel(mode, lang)}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-sm">
              {lang === "en" ? "Deep link" : "딥링크"}
              <select
                className={FIELD}
                value={campaign.deepLinkPolicy}
                onChange={(e) =>
                  patchCampaign({ ...campaign, deepLinkPolicy: e.target.value as IntroDeepLinkPolicy })
                }
              >
                {INTRO_DEEP_LINK_POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {introDeepLinkLabel(policy, lang)}
                  </option>
                ))}
              </select>
            </label>
          </AdminCard>

          <AdminCard>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_history", { fallbackKo: "개정 / 기록", fallbackEn: "Revision / history" })}
            </h2>
            {campaign.published ? (
              <p className="text-sm text-sam-fg">
                {lang === "en" ? "Published revision" : "게시된 개정"} {campaign.published.revision}
              </p>
            ) : (
              <p className="text-sm text-sam-muted">
                {safeT("admin_intro_no_revision", {
                  fallbackKo: "게시된 개정 없음",
                  fallbackEn: "No published revision",
                })}
              </p>
            )}
            <p className="mt-1 text-xs text-sam-muted">
              {lang === "en" ? "Draft revision" : "초안 개정"} {campaign.draftRevision}
            </p>
          </AdminCard>
        </div>
      </div>

      {guardOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          data-intro-unsaved-guard="1"
        >
          <AdminCard className="max-w-md">
            <h2 className="font-semibold text-sam-fg">
              {safeT("admin_intro_unsaved_title", {
                fallbackKo: "저장하지 않은 변경사항이 있습니다",
                fallbackEn: "You have unsaved changes",
              })}
            </h2>
            <p className="mt-2 text-sm text-sam-muted">
              {safeT("admin_intro_unsaved_body", {
                fallbackKo: "이 페이지를 떠나면 저장하지 않은 내용은 버려집니다.",
                fallbackEn: "If you leave this page, unsaved edits will be discarded.",
              })}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminActionButton variant="primary" onClick={() => confirmGuard("stay")}>
                {safeT("admin_intro_unsaved_stay", { fallbackKo: "계속 편집", fallbackEn: "Keep editing" })}
              </AdminActionButton>
              <AdminActionButton variant="danger" onClick={() => confirmGuard("discard_leave")}>
                {safeT("admin_intro_unsaved_leave", {
                  fallbackKo: "저장하지 않고 나가기",
                  fallbackEn: "Leave without saving",
                })}
              </AdminActionButton>
            </div>
          </AdminCard>
        </div>
      ) : null}
    </div>
  );
}
