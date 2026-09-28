"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminIntroCmsCtaDestinationFields } from "@/components/admin/intro/AdminIntroCmsCtaDestinationFields";
import { AdminIntroCompositionCanvas } from "@/components/admin/intro/AdminIntroCompositionCanvas";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { isoToManilaLocal, manilaLocalToIso } from "@/components/admin/intro/intro-admin-time";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import {
  applyIntroCmsSaveResult,
  discardIntroCmsEdits,
  introCmsCanDeleteScene,
  introCmsDraftSavePayload,
  introCmsIsDirty,
  introCmsPreviewFrame,
  resolveIntroCmsUnsavedNavigation,
  type IntroCmsPreviewViewport,
} from "@/lib/startup/intro-v2/admin-cms-phase1";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  INTRO_ADMIN_INTERACTION_UI,
  INTRO_INTERACTION_UI_TO_MODE,
  introAdvanceLabel,
  introAnchorLabel,
  introAspectPolicyLabel,
  introAudienceLabel,
  introDecorationKindLabel,
  introDeepLinkLabel,
  introFrequencyLabel,
  introInteractionLabel,
  introLayerTypeLabel,
  introPlatformLabel,
  introStatusLabel,
  introTransitionLabel,
  type IntroAdminInteractionUi,
} from "@/lib/startup/intro-v2/admin-labels";
import {
  INTRO_OPERATOR_ANIMATION_PRESETS,
  applyOperatorAnimationPreset,
  canDestructivelyRemoveIntroAsset,
  inferOperatorAnimationPreset,
  introAspectRatioLabel,
  introAssetFileName,
  introFormatBytes,
  introOperatorAnimationLabel,
  introSceneDurationLabel,
  resolveIntroUploadAttach,
  type IntroOperatorAnimationPreset,
} from "@/lib/startup/intro-v2/admin-operator-ux";
import { introRichPublishBlockIssue } from "@/lib/startup/intro-v2/compat-publish";
import {
  introLockedHeightPct,
  introLockedWidthPct,
  introMediaAspectRatio,
} from "@/lib/startup/intro-v2/geometry";
import { prepareIntroAdminUploadFile } from "@/lib/startup/intro-v2/admin-upload-client";
import { mapIntroUploadError } from "@/lib/startup/intro-v2/admin-upload";
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
  sceneInteractionUi,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import {
  createLayerOfType,
  defaultImageLayer,
  nextLayerId,
} from "@/lib/startup/intro-v2/composition";
import { searchIntroCtaEntities, withResolvedIntroCtaLabels } from "@/lib/startup/intro-v2/admin-cta-entity-client";
import type { IntroEntityHit } from "@/lib/startup/intro-v2/admin-entity-search";
import { adaptOperatorDraftToCanonical } from "@/lib/startup/intro-v2/legacy-operator-adapter";
import {
  INTRO_ADVANCE_MODES,
  INTRO_ASPECT_POLICIES,
  INTRO_AUDIENCES,
  INTRO_DECORATION_KINDS,
  INTRO_EASINGS,
  INTRO_DEEP_LINK_POLICIES,
  INTRO_FONT_TOKENS,
  INTRO_FREQUENCY_MODES,
  INTRO_LAYER_ANCHORS,
  INTRO_PLATFORMS,
  INTRO_SKIP_POLICIES,
  INTRO_TEXT_ALIGNS,
  INTRO_TRANSITIONS,
  type IntroAdvanceMode,
  type IntroAspectPolicy,
  type IntroDecorationKind,
  type IntroDeepLinkPolicy,
  type IntroFontToken,
  type IntroFrequencyMode,
  type IntroLayer,
  type IntroLayerAnchor,
  type IntroLayerType,
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
  const [uploading, setUploading] = useState(false);
  const [aspectLock, setAspectLock] = useState(true);
  const [inspector, setInspector] = useState<"layer" | "scene" | "campaign">("layer");
  const [validateMessage, setValidateMessage] = useState<string | null>(null);
  const [entityHits, setEntityHits] = useState<IntroEntityHit[]>([]);
  const leaveHrefRef = useRef<string | null>(null);
  const campaignRef = useRef<IntroAdminCampaign | null>(null);
  const layerIdRef = useRef<string | null>(null);
  const sceneIdRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadIntentRef = useRef<"image" | "logo" | "background" | "replace">("image");
  const uploadTargetLayerIdRef = useRef<string | null>(null);

  const applyLoaded = useCallback(async (next: IntroAdminCampaign) => {
    const adapted = adaptOperatorDraftToCanonical(next);
    const labeled = await withResolvedIntroCtaLabels(adapted);
    const copy = discardIntroCmsEdits(labeled);
    setCampaign(copy);
    setSaved(discardIntroCmsEdits(labeled));
    setSceneId((cur) => cur ?? labeled.scenes[0]?.id ?? null);
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
      await applyLoaded(json.campaign);
    }
    setLoading(false);
  }, [applyLoaded, campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  campaignRef.current = campaign;
  layerIdRef.current = layerId;
  sceneIdRef.current = sceneId;
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
      await applyLoaded(json.campaign);
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

  const searchEntity = async (kind: string, q: string) => {
    const items = await searchIntroCtaEntities(kind, q);
    setEntityHits(items);
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
    setInspector("layer");
    if (type === "IMAGE" || type === "LOGO") {
      uploadTargetLayerIdRef.current = next.id;
    }
  };

  const requestUpload = (intent: "image" | "logo" | "background" | "replace") => {
    uploadIntentRef.current = intent;
    if (intent === "background") {
      uploadTargetLayerIdRef.current = null;
    } else if (intent === "replace" && layer) {
      uploadTargetLayerIdRef.current = layer.id;
    }
    fileRef.current?.click();
  };

  const addElement = (type: IntroLayerType) => {
    addLayer(type);
    if (type === "IMAGE") requestUpload("image");
    if (type === "LOGO") requestUpload("logo");
  };

  const patchLayerSize = (next: { widthPct?: number; heightPct?: number }) => {
    if (!layer || !scene) return;
    const frame = introCmsPreviewFrame(viewport);
    const asset = layer.assetId ? campaign?.assets.find((item) => item.id === layer.assetId) : null;
    const aspect =
      asset?.width && asset.height ? introMediaAspectRatio(asset.width, asset.height) : null;
    let widthPct = next.widthPct ?? layer.widthPct ?? 80;
    let heightPct = next.heightPct ?? layer.heightPct ?? 20;
    if (aspectLock && aspect && (layer.type === "IMAGE" || layer.type === "LOGO")) {
      if (next.widthPct != null) {
        heightPct = introLockedHeightPct(widthPct, aspect, frame.width, frame.height);
      } else if (next.heightPct != null) {
        widthPct = introLockedWidthPct(heightPct, aspect, frame.width, frame.height);
      }
    }
    patchLayer({ ...layer, widthPct, heightPct });
  };

  const attachExistingAsset = (asset: IntroAdminAsset) => {
    if (!scene) return;
    if (inspector === "scene" || uploadIntentRef.current === "background") {
      patchScene({ ...scene, backgroundAssetId: asset.id });
      return;
    }
    if (layer && (layer.type === "IMAGE" || layer.type === "LOGO" || layer.type === "BACKGROUND")) {
      patchLayer({ ...layer, assetId: asset.id });
    }
  };

  const detachLayerAsset = () => {
    if (!scene) return;
    if (inspector === "scene") {
      patchScene({ ...scene, backgroundAssetId: null });
      return;
    }
    if (!layer?.assetId) return;
    const referenced =
      campaign?.scenes.some(
        (item) =>
          item.id !== scene.id &&
          (item.backgroundAssetId === layer.assetId ||
            item.layers.some((row) => row.assetId === layer.assetId))
      ) ?? false;
    const publishedIds = campaign?.published
      ? campaign.scenes.flatMap((item) => [
          item.backgroundAssetId,
          ...item.layers.map((row) => row.assetId),
        ])
      : [];
    const canRemove = canDestructivelyRemoveIntroAsset({
      assetId: layer.assetId,
      published: campaign?.published ?? null,
      referenced: referenced || publishedIds.includes(layer.assetId),
    });
    patchLayer({ ...layer, assetId: undefined });
    if (canRemove && campaign) {
      setCampaign({
        ...campaign,
        assets: campaign.assets.filter((asset) => asset.id !== layer.assetId),
        scenes: campaign.scenes.map((item) =>
          item.id === scene.id
            ? {
                ...scene,
                layers: scene.layers.map((row) =>
                  row.id === layer.id ? { ...row, assetId: undefined } : row
                ),
              }
            : item
        ),
      });
    }
  };

  const validateDraft = async () => {
    if (!campaign) return;
    setBusy(true);
    const res = await fetch(`/api/admin/intro-campaigns/${campaign.id}/validate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(introCmsDraftSavePayload(campaign)),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      issues?: { messageKo?: string; messageEn?: string }[];
    };
    setBusy(false);
    if (res.ok && json.ok && !(json.issues && json.issues.length)) {
      setValidateMessage(
        safeT("admin_intro_validate_ok", { fallbackKo: "검사 통과", fallbackEn: "Validation passed" })
      );
      setError(null);
      return;
    }
    setValidateMessage(
      firstIssueMessage(json.issues, lang) ??
        safeT("admin_intro_validate_fail", {
          fallbackKo: "검사에 문제가 있습니다",
          fallbackEn: "Validation found problems",
        })
    );
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

  const attachUploadedAsset = (
    asset: IntroAdminAsset,
    intent: "image" | "logo" | "background" | "replace"
  ) => {
    const current = campaignRef.current;
    const liveSceneId = sceneIdRef.current;
    const currentScene =
      current?.scenes.find((item) => item.id === liveSceneId) ?? current?.scenes[0] ?? null;
    if (!current || !currentScene) return;
    const nextAssets = [...current.assets.filter((item) => item.id !== asset.id), asset];
    if (intent === "background") {
      uploadTargetLayerIdRef.current = null;
      setCampaign({
        ...current,
        assets: nextAssets,
        scenes: current.scenes.map((item) =>
          item.id === currentScene.id ? { ...item, backgroundAssetId: asset.id } : item
        ),
      });
      setInspector("scene");
      return;
    }
    const plan = resolveIntroUploadAttach({
      layers: currentScene.layers,
      selectedLayerId: layerIdRef.current,
      intendedLayerId: uploadTargetLayerIdRef.current,
      intent,
    });
    const mediaLayer = plan.targetLayerId
      ? currentScene.layers.find((item) => item.id === plan.targetLayerId)
      : undefined;
    const target =
      mediaLayer ??
      (plan.createType === "LOGO"
        ? createLayerOfType("LOGO", nextLayerId(), currentScene.layers.length + 1)
        : defaultImageLayer(nextLayerId(), currentScene.layers.length + 1));
    const layers = currentScene.layers.some((item) => item.id === target.id)
      ? currentScene.layers.map((item) => (item.id === target.id ? { ...item, assetId: asset.id } : item))
      : [...currentScene.layers, { ...target, assetId: asset.id }];
    setCampaign({
      ...current,
      assets: nextAssets,
      scenes: current.scenes.map((item) => (item.id === currentScene.id ? { ...item, layers } : item)),
    });
    if (plan.selectAfter) {
      setLayerId(target.id);
      setInspector("layer");
    }
    uploadTargetLayerIdRef.current = null;
  };

  const onUpload = async (file: File) => {
    if (!campaignRef.current) return;
    const intent = uploadIntentRef.current;
    setError(null);
    setUploading(true);
    try {
      const prepared = await prepareIntroAdminUploadFile(file);
      if (!prepared.ok) {
        setError(mapIntroUploadError(prepared.error, lang));
        return;
      }
      const fd = new FormData();
      fd.set("file", prepared.value.file);
      if (prepared.value.width) fd.set("width", String(prepared.value.width));
      if (prepared.value.height) fd.set("height", String(prepared.value.height));
      const up = await fetch("/api/admin/intro-campaigns/upload-image", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const upJson = (await up.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        asset?: IntroAdminAsset;
      };
      if (up.status === 413) {
        setError(mapIntroUploadError("file_too_large", lang));
        return;
      }
      if (!up.ok || !upJson.ok) {
        setError(mapIntroUploadError(upJson.error, lang));
        return;
      }
      const reused = campaignRef.current?.assets.find((asset) => asset.publicUrl === upJson.url);
      if (reused) {
        attachUploadedAsset(reused, intent);
        setError(null);
        return;
      }
      if (!upJson.asset) {
        setError(lang === "en" ? "Could not keep the image." : "이미지를 저장하지 못했습니다.");
        return;
      }
      attachUploadedAsset(upJson.asset, intent);
      setError(null);
    } catch {
      setError(mapIntroUploadError("upload_failed", lang));
    } finally {
      setUploading(false);
    }
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
      data-intro-uploading={uploading ? "true" : "false"}
      data-intro-selected-layer-type={layer?.type ?? ""}
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
        <AdminActionButton variant="quiet" disabled={busy} onClick={() => void validateDraft()}>
          {safeT("admin_intro_validate", { fallbackKo: "검사", fallbackEn: "Validate" })}
        </AdminActionButton>
        <AdminActionButton variant="quiet" disabled={busy || Boolean(introRichPublishBlockIssue(campaign))} onClick={() => void publish()}>
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
      {validateMessage ? <p className="text-sm text-sam-fg">{validateMessage}</p> : null}
      {introRichPublishBlockIssue(campaign) ? (
        <p className="text-sm text-sam-muted" data-intro-publish-blocked="1">
          {safeT("admin_intro_rich_publish_blocked", {
            fallbackKo: "현재 Native에서는 이 초안을 게시할 수 없습니다.",
            fallbackEn: "This draft cannot be published on the current Native runtime.",
          })}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <AdminCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {safeT("admin_intro_storyboard", { fallbackKo: "장면 순서", fallbackEn: "Scene order" })}
            </h2>
            <AdminActionButton variant="secondary" onClick={addScene}>
              {safeT("admin_intro_add_scene", { fallbackKo: "장면 추가", fallbackEn: "Add scene" })}
            </AdminActionButton>
          </div>
          <ol className="space-y-2" data-intro-scene-navigator="1" data-intro-storyboard="1">
            {campaign.scenes.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
                    item.id === scene?.id ? "border-sam-fg bg-sam-surface-muted" : "border-sam-border"
                  }`}
                  onClick={() => {
                    setSceneId(item.id);
                    setLayerId(null);
                    setInspector("scene");
                  }}
                >
                  <span className="block h-10 rounded-ui-rect" style={{ background: item.backgroundColor || "#e5e7eb" }} />
                  <span className="mt-1 font-medium text-sam-fg">
                    {item.name || (lang === "en" ? `Scene ${index + 1}` : `장면 ${index + 1}`)}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-sam-muted">
                    {introSceneDurationLabel(item, lang)}
                  </span>
                </button>
                {index < campaign.scenes.length - 1 ? (
                  <p className="py-1 text-center text-[11px] text-sam-muted">
                    ↓ {introTransitionLabel(item.transition, lang)}
                  </p>
                ) : null}
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
          <div className="mt-4" data-intro-add-elements="1">
            <p className="mb-2 text-xs font-medium text-sam-muted">
              {lang === "en" ? "Add to this scene" : "이 장면에 추가"}
            </p>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton variant="secondary" disabled={!scene} onClick={() => addElement("IMAGE")}>
                + {safeT("admin_intro_add_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
              </AdminActionButton>
              <AdminActionButton variant="secondary" disabled={!scene} onClick={() => addElement("LOGO")}>
                + {safeT("admin_intro_add_logo", { fallbackKo: "로고", fallbackEn: "Logo" })}
              </AdminActionButton>
              <AdminActionButton variant="secondary" disabled={!scene} onClick={() => addElement("TEXT")}>
                + {safeT("admin_intro_add_text", { fallbackKo: "텍스트", fallbackEn: "Text" })}
              </AdminActionButton>
              <AdminActionButton variant="secondary" disabled={!scene} onClick={() => addElement("CTA")}>
                + {safeT("admin_intro_add_cta", { fallbackKo: "버튼", fallbackEn: "Button" })}
              </AdminActionButton>
              <AdminActionButton variant="secondary" disabled={!scene} onClick={() => addElement("DECORATION")}>
                + {safeT("admin_intro_add_decoration", { fallbackKo: "장식", fallbackEn: "Decoration" })}
              </AdminActionButton>
            </div>
          </div>
          <h3 className="mt-4 font-semibold">
            {safeT("admin_intro_layers", { fallbackKo: "레이어", fallbackEn: "Layers" })}
          </h3>
          <ul className="mt-2 space-y-2" data-intro-layer-inventory="1">
            {scene?.layers.length ? (
              scene.layers
                .slice()
                .sort((a, b) => b.zIndex - a.zIndex)
                .map((item) => (
                  <li key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 rounded-ui-rect border px-3 py-2 text-left text-sm ${
                        item.id === layer?.id ? "border-sam-fg bg-sam-surface-muted" : "border-sam-border"
                      }`}
                      onClick={() => {
                        setLayerId(item.id);
                        setInspector("layer");
                      }}
                    >
                      {introLayerTypeLabel(item.type, lang)}
                      {item.visible === false ? (lang === "en" ? " · hidden" : " · 숨김") : ""}
                    </button>
                    <AdminActionButton
                      variant="quiet"
                      onClick={() =>
                        patchLayer({
                          ...item,
                          visible: item.visible === false,
                        })
                      }
                    >
                      {item.visible === false ? "○" : "●"}
                    </AdminActionButton>
                  </li>
                ))
            ) : (
              <li className="text-sm text-sam-muted">{lang === "en" ? "No layers yet." : "레이어가 없습니다."}</li>
            )}
          </ul>
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
        </div>

        <div className="space-y-4">
          <AdminCard>
            <div className="mb-3 flex flex-wrap gap-2">
              {(["layer", "scene", "campaign"] as const).map((tab) => (
                <AdminActionButton
                  key={tab}
                  variant={inspector === tab ? "primary" : "secondary"}
                  onClick={() => setInspector(tab)}
                >
                  {tab === "layer"
                    ? safeT("admin_intro_inspector_layer", { fallbackKo: "레이어", fallbackEn: "Layer" })
                    : tab === "scene"
                      ? safeT("admin_intro_inspector_scene", { fallbackKo: "장면", fallbackEn: "Scene" })
                      : safeT("admin_intro_inspector_campaign", { fallbackKo: "캠페인", fallbackEn: "Campaign" })}
                </AdminActionButton>
              ))}
            </div>
            <h2 className="mb-3 font-semibold">
              {safeT("admin_intro_properties", { fallbackKo: "속성", fallbackEn: "Properties" })}
            </h2>
            {inspector === "campaign" ? (
            <label className="block text-sm">
              {lang === "en" ? "Campaign name" : "캠페인 이름"}
              <input
                className={FIELD}
                value={campaign.name}
                onChange={(e) => patchCampaign({ ...campaign, name: e.target.value })}
              />
            </label>
            ) : null}
            {inspector === "campaign" ? (
            <p className="mt-3 text-sm text-sam-muted">
              {lang === "en" ? "Status" : "상태"}: {introStatusLabel(campaign.status, lang)}
            </p>
            ) : null}
            {inspector === "scene" && scene ? (
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
                        {introTransitionLabel(value, lang)}
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
                  {safeT("admin_intro_tap_action", { fallbackKo: "누르기 방식", fallbackEn: "Tap action" })}
                  <select
                    className={FIELD}
                    data-intro-interaction="1"
                    value={sceneInteractionUi(scene)}
                    onChange={(e) => {
                      const ui = e.target.value as IntroAdminInteractionUi;
                      patchScene({
                        ...scene,
                        interactionMode: INTRO_INTERACTION_UI_TO_MODE[ui],
                        interactionLayerId: ui === "LAYER" ? scene.interactionLayerId : null,
                        cta: {
                          ...(scene.cta ?? { destination: { type: "COMMUNITY" }, label: "" }),
                          enabled: ui === "BUTTON",
                          destination: scene.cta?.destination ?? { type: "COMMUNITY" },
                        },
                      });
                    }}
                  >
                    {INTRO_ADMIN_INTERACTION_UI.map((ui) => (
                      <option key={ui} value={ui}>
                        {introInteractionLabel(ui, lang)}
                      </option>
                    ))}
                  </select>
                </label>
                {scene.interactionMode === "tap_layer" ? (
                  <label className="mt-3 block text-sm">
                    {safeT("admin_intro_choose_element", { fallbackKo: "요소 선택", fallbackEn: "Choose element" })}
                    <select
                      className={FIELD}
                      value={scene.interactionLayerId ?? ""}
                      onChange={(e) => patchScene({ ...scene, interactionLayerId: e.target.value || null })}
                    >
                      <option value="">{lang === "en" ? "Choose element" : "요소 선택"}</option>
                      {scene.layers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || introLayerTypeLabel(item.type, lang)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                    <AdminIntroCmsCtaDestinationFields
                      cta={scene.cta}
                      lang={lang}
                      hits={entityHits}
                      onSearch={(kind, q) => void searchEntity(kind, q)}
                      onChange={(cta) => patchScene({ ...scene, cta })}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {inspector === "layer" && layer ? (
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
                        {introAnchorLabel(value, lang)}
                      </option>
                    ))}
                  </select>
                </label>
                {(["xPct", "yPct"] as const).map((key) => (
                  <label key={key} className="mt-3 block text-sm">
                    {key === "xPct" ? (lang === "en" ? "X position" : "가로 위치") : lang === "en" ? "Y position" : "세로 위치"}
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
                {(layer.type === "IMAGE" || layer.type === "LOGO") ? (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aspectLock}
                      onChange={(e) => setAspectLock(e.target.checked)}
                    />
                    {safeT("admin_intro_aspect_lock", { fallbackKo: "비율 고정", fallbackEn: "Lock aspect" })}
                  </label>
                ) : null}
                {(["widthPct", "heightPct"] as const).map((key) => (
                  <label key={key} className="mt-3 block text-sm">
                    {key === "widthPct" ? (lang === "en" ? "Width" : "너비") : lang === "en" ? "Height" : "높이"}
                    <input
                      className={FIELD}
                      type="number"
                      min={0}
                      max={100}
                      value={layer[key] ?? ""}
                      onChange={(e) =>
                        patchLayerSize({
                          [key]: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                {layer.type === "IMAGE" || layer.type === "LOGO" || layer.type === "BACKGROUND" ? (
                  <label className="mt-3 block text-sm">
                    {lang === "en" ? "Fit" : "맞춤"}
                    <select
                      className={FIELD}
                      value={layer.aspectPolicy ?? "contain"}
                      onChange={(e) =>
                        patchLayer({ ...layer, aspectPolicy: e.target.value as IntroAspectPolicy })
                      }
                    >
                      {INTRO_ASPECT_POLICIES.filter((value) => value === "contain" || value === "cover").map(
                        (value) => (
                          <option key={value} value={value}>
                            {introAspectPolicyLabel(value, lang)}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                ) : null}
                {layer.type === "TEXT" || layer.type === "CTA" ? (
                  <>
                    <label className="mt-3 block text-sm">
                      {lang === "en" ? "Text" : "텍스트"}
                      <textarea
                        data-intro-layer-text="1"
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
                            {introDecorationKindLabel(value, lang)}
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
                {layer.type === "CTA" && scene ? (
                  <AdminIntroCmsCtaDestinationFields
                    cta={
                      scene.cta ?? {
                        enabled: true,
                        destination: { type: "COMMUNITY" },
                        label: "",
                      }
                    }
                    lang={lang}
                    hits={entityHits}
                    onSearch={(kind, q) => void searchEntity(kind, q)}
                    onChange={(cta) => patchScene({ ...scene, cta: { ...cta, enabled: true } })}
                  />
                ) : null}
                <label className="mt-3 block text-sm">
                  {lang === "en" ? "Appear" : "등장"}
                  <select
                    className={FIELD}
                    value={inferOperatorAnimationPreset(layer.animation)}
                    onChange={(e) =>
                      patchLayer({
                        ...layer,
                        animation: applyOperatorAnimationPreset(
                          e.target.value as IntroOperatorAnimationPreset
                        ),
                      })
                    }
                  >
                    {INTRO_OPERATOR_ANIMATION_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {introOperatorAnimationLabel(preset, lang)}
                      </option>
                    ))}
                  </select>
                </label>
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
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUpload(file);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <p className="mb-2 text-sm text-sam-muted">
                {safeT("admin_intro_upload_progress", { fallbackKo: "올리는 중…", fallbackEn: "Uploading…" })}
              </p>
            ) : null}
            {(() => {
              const mediaAssetId =
                inspector === "scene" ? scene?.backgroundAssetId : layer?.assetId;
              const media = mediaAssetId
                ? campaign.assets.find((asset) => asset.id === mediaAssetId) ?? null
                : null;
              return media ? (
                <div className="space-y-2 text-sm">
                  <div className="overflow-hidden rounded-ui-rect border border-sam-border">
                    <SamarketThumbnail
                      src={media.publicUrl}
                      alt={introAssetFileName(media)}
                      size={120}
                    />
                  </div>
                  <p className="font-medium">{introAssetFileName(media)}</p>
                  <p className="text-sam-muted">
                    {media.mime} · {introFormatBytes(media.bytes)}
                  </p>
                  <p>
                    {safeT("admin_intro_media_original", { fallbackKo: "원본 크기", fallbackEn: "Original size" })}
                    : {media.width && media.height ? `${media.width}×${media.height}` : "—"}
                  </p>
                  <p>
                    {safeT("admin_intro_media_aspect", { fallbackKo: "비율", fallbackEn: "Aspect" })}
                    : {introAspectRatioLabel(media.width, media.height)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <AdminActionButton
                      variant="secondary"
                      onClick={() =>
                        requestUpload(inspector === "scene" ? "background" : "replace")
                      }
                    >
                      {safeT("admin_intro_media_replace", { fallbackKo: "이미지 바꾸기", fallbackEn: "Replace" })}
                    </AdminActionButton>
                    <AdminActionButton variant="danger" onClick={detachLayerAsset}>
                      {safeT("admin_intro_media_remove", { fallbackKo: "이미지 빼기", fallbackEn: "Remove" })}
                    </AdminActionButton>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-sam-muted">
                  {safeT("admin_intro_no_file", { fallbackKo: "선택한 파일 없음", fallbackEn: "No file selected" })}
                </p>
              );
            })()}
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminActionButton
                variant="secondary"
                disabled={!scene}
                onClick={() => requestUpload(inspector === "scene" ? "background" : "image")}
              >
                {inspector === "scene"
                  ? safeT("admin_intro_bg_image", { fallbackKo: "배경 이미지", fallbackEn: "Background image" })
                  : `+ ${safeT("admin_intro_add_image", { fallbackKo: "이미지", fallbackEn: "Image" })}`}
              </AdminActionButton>
            </div>
            {campaign.assets.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {campaign.assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="overflow-hidden rounded-ui-rect border border-sam-border"
                    onClick={() => attachExistingAsset(asset)}
                  >
                    <SamarketThumbnail src={asset.publicUrl} alt={introAssetFileName(asset)} size={80} />
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-sm text-sam-muted">
              {lang === "en"
                ? "PNG, JPEG, static WebP. GIF and MP4 are not in this phase."
                : "PNG, JPEG, 정적 WebP. GIF/MP4는 이 단계에 없습니다."}
            </p>
          </AdminCard>

          {inspector === "campaign" ? (
          <>
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
          </>
          ) : null}
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
