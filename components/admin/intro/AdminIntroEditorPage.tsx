"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminIntroPreviewCanvas } from "@/components/admin/intro/AdminIntroPreviewCanvas";
import { isoToManilaLocal, manilaLocalToIso } from "@/components/admin/intro/intro-admin-time";
import {
  INTRO_ADMIN_DEFAULT_MAX_HOLD_MS,
  INTRO_ADMIN_DEFAULT_TIMEZONE,
  INTRO_ADMIN_INTERACTION_UI,
  INTRO_INTERACTION_UI_TO_MODE,
  INTRO_TEXT_ALIGNMENTS,
  INTRO_TEXT_STYLE_TOKENS,
  composeIntroTextAnimation,
  introAdvanceLabel,
  introAudienceLabel,
  introCtaTypeLabel,
  introDeepLinkLabel,
  introDeviceFamilyLabel,
  introFrequencyLabel,
  introInteractionLabel,
  introLayerTypeLabel,
  introPlatformLabel,
  introStatusLabel,
  introTextStyleLabel,
  parseIntroTextAlignment,
  parseIntroTextStyleToken,
  type IntroAdminInteractionUi,
} from "@/lib/startup/intro-v2/admin-labels";
import {
  INTRO_ADMIN_PLANNED_MEDIA,
  INTRO_ADMIN_UPLOADABLE_MEDIA,
} from "@/lib/startup/intro-v2/admin-media";
import {
  INTRO_ADMIN_PREVIEW_PRESETS,
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
  defaultNewScene,
  duplicateScene,
  reorderLayers,
  reorderScenes,
  sceneInteractionUi,
  type IntroAdminAsset,
  type IntroAdminCampaign,
  type IntroAdminScene,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { validateIntroCampaignForPublish, type IntroAdminIssue } from "@/lib/startup/intro-v2/admin-validate";
import {
  INTRO_RESOLVER_PREVIEW_DEFAULT,
  parseIntroResolverPreviewFixture,
  type IntroResolverPreviewResult,
} from "@/lib/startup/intro-v2/admin-resolver-preview";
import {
  INTRO_ADVANCE_MODES,
  INTRO_AUDIENCES,
  INTRO_CTA_DESTINATION_TYPES,
  INTRO_DEEP_LINK_POLICIES,
  INTRO_DEVICE_FAMILIES,
  INTRO_FREQUENCY_MODES,
  INTRO_ASPECT_POLICIES,
  INTRO_LAYER_ANCHORS,
  INTRO_LAYER_TYPES,
  INTRO_PLATFORMS,
  type IntroAdvanceMode,
  type IntroCtaDestinationType,
  type IntroDeviceFamily,
  type IntroFrequencyMode,
  type IntroLayer,
  type IntroLayerType,
} from "@/lib/startup/intro-v2/types";

const ENTITY_KINDS = new Set(["STORE", "PRODUCT", "LISTING", "POST", "CHAT_ROOM", "EVENT"]);

function defaultLayer(type: IntroLayerType, id: string, zIndex: number): IntroLayer {
  return {
    id,
    type,
    zIndex,
    anchor: "center",
    xPct: 50,
    yPct: type === "CTA" ? 82 : 50,
    widthPct: type === "BACKGROUND" ? 100 : 42,
    opacity: 1,
    safeArea: true,
    aspectPolicy: "contain",
    text: type === "TEXT" || type === "CTA" ? (type === "CTA" ? "Continue" : "") : undefined,
    animation: type === "TEXT" ? composeIntroTextAnimation("title", "center", null) : undefined,
  };
}

export function AdminIntroEditorPage({ campaignId }: { campaignId: string }) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [campaign, setCampaign] = useState<IntroAdminCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [preset, setPreset] = useState<IntroAdminPreviewPreset>("samsung_phone");
  const [issues, setIssues] = useState<IntroAdminIssue[]>([]);
  const [resolver, setResolver] = useState<IntroResolverPreviewResult | null>(null);
  const [resolverFixture, setResolverFixture] = useState(INTRO_RESOLVER_PREVIEW_DEFAULT);
  const [entityHits, setEntityHits] = useState<Array<{ id: string; label: string }>>([]);

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
      setCampaign(json.campaign);
      setSceneId(json.campaign.scenes[0]?.id ?? null);
    }
    setLoading(false);
  }, [campaignId, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const scene = campaign?.scenes.find((s) => s.id === sceneId) ?? campaign?.scenes[0] ?? null;
  const layer = scene?.layers.find((l) => l.id === layerId) ?? null;

  const patchCampaign = (next: IntroAdminCampaign) => setCampaign(next);
  const patchScenes = (scenes: IntroAdminScene[]) => {
    if (!campaign) return;
    patchCampaign({ ...campaign, scenes });
  };
  const patchScene = (next: IntroAdminScene) => {
    if (!campaign) return;
    patchScenes(campaign.scenes.map((s) => (s.id === next.id ? next : s)));
  };

  const saveDraft = async () => {
    if (!campaign) return;
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
        timezone: campaign.timezone,
        priority: campaign.priority,
        targeting: campaign.targeting,
        frequencyMode: campaign.frequencyMode,
        deepLinkPolicy: campaign.deepLinkPolicy,
        scenes: campaign.scenes,
        deviceOverrides: campaign.deviceOverrides,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroAdminCampaign; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok || !json.campaign) {
      setError(json.error ?? (lang === "en" ? "Draft save failed." : "초안 저장에 실패했습니다."));
      return;
    }
    setCampaign(json.campaign);
    setError(null);
  };

  const runValidate = async () => {
    if (!campaign) return;
    const local = validateIntroCampaignForPublish(campaign);
    setIssues(local.issues);
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
    await saveDraft();
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
      return;
    }
    if (json.campaign) setCampaign(json.campaign);
    setIssues([]);
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
    if (json.ok && json.campaign) setCampaign(json.campaign);
  };

  const runResolver = async () => {
    const fixture = parseIntroResolverPreviewFixture(resolverFixture);
    const res = await fetch("/api/admin/intro-campaigns/resolver-preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fixture),
    });
    const json = (await res.json().catch(() => ({}))) as { preview?: IntroResolverPreviewResult };
    if (json.preview) setResolver(json.preview);
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
    const json = (await res.json().catch(() => ({}))) as { items?: Array<{ id: string; label: string }> };
    setEntityHits(json.items ?? []);
  };

  const uploadAsset = async (file: File) => {
    if (!campaign) return;
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
    const reg = await fetch("/api/admin/intro-campaigns/assets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicUrl: upJson.url, mime: file.type, bytes: file.size }),
    });
    const regJson = (await reg.json().catch(() => ({}))) as { ok?: boolean; asset?: IntroAdminAsset };
    if (reg.ok && regJson.ok && regJson.asset) {
      setCampaign({ ...campaign, assets: [...campaign.assets, regJson.asset] });
    }
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

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={campaign.name}
        backHref="/admin/intro"
        description={lang === "en" ? "Draft does not change the published snapshot or V1 runtime." : "초안 저장은 게시 스냅샷과 V1 런타임을 바꾸지 않습니다."}
      />

      {error ? <p className="text-red-800">{error}</p> : null}
      {v1Unconfirmed ? (
        <AdminCard>
          <AdminToneBadge tone="warning">{lang === "en" ? "V1 import" : "V1 가져오기"}</AdminToneBadge>
          <p className="mt-2 text-sm text-sam-fg">
            {safeT("admin_intro_v1_warning", {
              fallbackKo:
                "V1에서 가져온 초안입니다. displayDurationMs=0이라 진행 방식이 확정되지 않았습니다. 게시 전에 장면 진행 방법을 직접 선택하세요.",
              fallbackEn:
                "This V1-imported draft has displayDurationMs=0, so advance semantics are unconfirmed. Choose scene advance explicitly before publish.",
            })}
          </p>
        </AdminCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
          {safeT("admin_intro_save_draft", { fallbackKo: "초안 저장", fallbackEn: "Save draft" })}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => void runValidate()}>
          {safeT("admin_intro_validate", { fallbackKo: "검사", fallbackEn: "Validate" })}
        </AdminActionButton>
        <AdminActionButton variant="primary" disabled={busy} onClick={() => void publish()}>
          {safeT("admin_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => void transition("pause")}>
          {safeT("admin_intro_pause", { fallbackKo: "일시중지", fallbackEn: "Pause" })}
        </AdminActionButton>
        {campaign.status === "paused" ? (
          <AdminActionButton variant="secondary" onClick={() => void transition("resume")}>
            {safeT("admin_intro_resume", { fallbackKo: "다시 시작", fallbackEn: "Resume" })}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="danger" onClick={() => void transition("archive")}>
          {safeT("admin_intro_archive", { fallbackKo: "보관", fallbackEn: "Archive" })}
        </AdminActionButton>
      </div>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{lang === "en" ? "Campaign" : "캠페인"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            {lang === "en" ? "Name" : "이름"}
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={campaign.name}
              onChange={(e) => patchCampaign({ ...campaign, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Status" : "상태"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={campaign.status}
              onChange={(e) => patchCampaign({ ...campaign, status: e.target.value as IntroAdminCampaign["status"] })}
            >
              {(["draft", "scheduled", "active", "paused", "expired", "archived"] as const).map((s) => (
                <option key={s} value={s}>{introStatusLabel(s, lang)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Start" : "시작"}
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={isoToManilaLocal(campaign.startsAt)}
              onChange={(e) => patchCampaign({ ...campaign, startsAt: manilaLocalToIso(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            {lang === "en" ? "End" : "종료"}
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={isoToManilaLocal(campaign.endsAt)}
              onChange={(e) => patchCampaign({ ...campaign, endsAt: manilaLocalToIso(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Timezone" : "시간대"}
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={campaign.timezone || INTRO_ADMIN_DEFAULT_TIMEZONE}
              onChange={(e) => patchCampaign({ ...campaign, timezone: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Priority" : "우선순위"}
            <input
              type="number"
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={campaign.priority}
              onChange={(e) => patchCampaign({ ...campaign, priority: Number(e.target.value) })}
            />
          </label>
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
          <label className="block text-sm">
            {lang === "en" ? "Deep link" : "딥링크"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={campaign.deepLinkPolicy}
              onChange={(e) =>
                patchCampaign({ ...campaign, deepLinkPolicy: e.target.value as IntroAdminCampaign["deepLinkPolicy"] })
              }
            >
              {INTRO_DEEP_LINK_POLICIES.map((p) => (
                <option key={p} value={p}>{introDeepLinkLabel(p, lang)}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[12px] text-sam-muted">
          {lang === "en" ? "Published revision" : "게시 리비전"}: {campaign.published?.revision ?? "—"}
          {campaign.published?.publishedAt ? ` · ${campaign.published.publishedAt}` : ""}
          {campaign.published?.publishedBy ? ` · ${campaign.published.publishedBy}` : ""}
        </p>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{lang === "en" ? "Targeting" : "대상"}</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          {lang === "en" ? "Empty selection = ALL. UNKNOWN is never written." : "빈 선택 = 전체. UNKNOWN은 저장하지 않습니다."}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
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
            {campaign.targeting.audiences.length === 0 ? (
              <p className="mt-1 text-[12px] text-sam-muted">{safeT("admin_intro_all", { fallbackKo: "전체", fallbackEn: "All" })}</p>
            ) : null}
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
        </div>
      </AdminCard>

      <AdminCard>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{lang === "en" ? "Scenes" : "장면"}</h2>
          <AdminActionButton
            variant="secondary"
            onClick={() => {
              const id = `tmp-${Date.now()}`;
              const next = defaultNewScene(id, campaign.scenes.length, `Scene ${campaign.scenes.length + 1}`);
              patchScenes([...campaign.scenes, next]);
              setSceneId(id);
            }}
          >
            {lang === "en" ? "Add scene" : "장면 추가"}
          </AdminActionButton>
        </div>
        <div className="space-y-2">
          {campaign.scenes.map((s, index) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center gap-2 rounded-ui-rect border px-2 py-2 ${s.id === scene?.id ? "border-violet-500" : "border-sam-border"}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                patchScenes(reorderScenes(campaign.scenes, from, index));
              }}
            >
              <button type="button" className="font-semibold" onClick={() => setSceneId(s.id)}>
                {index + 1}. {s.name}
              </button>
              <span className="text-[12px] text-sam-muted">{introAdvanceLabel(s.advanceMode, lang)}</span>
              <AdminActionButton
                variant="quiet"
                onClick={() => {
                  const id = `tmp-${Date.now()}`;
                  const copy = duplicateScene(s, id, campaign.scenes.length);
                  patchScenes([...campaign.scenes, copy]);
                }}
              >
                {lang === "en" ? "Duplicate" : "복제"}
              </AdminActionButton>
              <AdminActionButton
                variant="quiet"
                onClick={() => patchScenes(campaign.scenes.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, sortOrder: i })))}
              >
                {lang === "en" ? "Delete" : "삭제"}
              </AdminActionButton>
            </div>
          ))}
        </div>
      </AdminCard>

      {scene ? (
        <AdminCard>
          <h2 className="mb-3 font-semibold">{lang === "en" ? "Scene settings" : "장면 설정"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              {lang === "en" ? "Scene name" : "장면 이름"}
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={scene.name}
                onChange={(e) => patchScene({ ...scene, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              {lang === "en" ? "Advance" : "진행"}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={scene.advanceMode}
                onChange={(e) => {
                  const advanceMode = e.target.value as IntroAdvanceMode;
                  patchScene({
                    ...scene,
                    advanceMode,
                    durationMs: advanceMode === "timer" ? Math.max(1, scene.durationMs ?? 2500) : null,
                    maxHoldMs:
                      advanceMode === "timer" ? null : Math.max(1, scene.maxHoldMs ?? INTRO_ADMIN_DEFAULT_MAX_HOLD_MS),
                  });
                }}
              >
                {INTRO_ADVANCE_MODES.map((m) => (
                  <option key={m} value={m}>{introAdvanceLabel(m, lang)}</option>
                ))}
              </select>
            </label>
            {scene.advanceMode === "timer" ? (
              <label className="block text-sm">
                {lang === "en" ? "Duration (ms)" : "지속 시간 (ms)"}
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                  value={scene.durationMs ?? ""}
                  onChange={(e) => patchScene({ ...scene, durationMs: Number(e.target.value) })}
                />
              </label>
            ) : (
              <label className="block text-sm">
                {lang === "en" ? `Max hold (ms, default ${INTRO_ADMIN_DEFAULT_MAX_HOLD_MS})` : `최대 유지 (ms, 기본 ${INTRO_ADMIN_DEFAULT_MAX_HOLD_MS})`}
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                  value={scene.maxHoldMs ?? INTRO_ADMIN_DEFAULT_MAX_HOLD_MS}
                  onChange={(e) => patchScene({ ...scene, maxHoldMs: Number(e.target.value) })}
                />
              </label>
            )}
            <label className="block text-sm">
              {lang === "en" ? "Interaction" : "상호작용"}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={sceneInteractionUi(scene)}
                onChange={(e) => {
                  const ui = e.target.value as IntroAdminInteractionUi;
                  patchScene({
                    ...scene,
                    interactionMode: INTRO_INTERACTION_UI_TO_MODE[ui],
                    interactionLayerId: ui === "LAYER" ? scene.interactionLayerId : null,
                    cta:
                      ui === "BUTTON"
                        ? { enabled: true, destination: scene.cta?.destination ?? { type: "COMMUNITY" } }
                        : scene.cta,
                  });
                }}
              >
                {INTRO_ADMIN_INTERACTION_UI.map((ui) => (
                  <option key={ui} value={ui}>{introInteractionLabel(ui, lang)}</option>
                ))}
              </select>
            </label>
            {scene.interactionMode === "tap_layer" ? (
              <label className="block text-sm">
                {lang === "en" ? "Target layer" : "대상 레이어"}
                <select
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                  value={scene.interactionLayerId ?? ""}
                  onChange={(e) => patchScene({ ...scene, interactionLayerId: e.target.value || null })}
                >
                  <option value="">{lang === "en" ? "Select" : "선택"}</option>
                  {scene.layers.map((l) => (
                    <option key={l.id} value={l.id}>{l.id} ({l.type})</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              {lang === "en" ? "Background color" : "배경색"}
              <input
                type="color"
                className="mt-1 h-9 w-16"
                value={scene.backgroundColor}
                onChange={(e) => patchScene({ ...scene, backgroundColor: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              {lang === "en" ? "Background media" : "배경 미디어"}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                value={scene.backgroundAssetId ?? ""}
                onChange={(e) => patchScene({ ...scene, backgroundAssetId: e.target.value || null })}
              >
                <option value="">{lang === "en" ? "None" : "없음"}</option>
                {campaign.assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.kind} · {a.id.slice(0, 8)}</option>
                ))}
              </select>
            </label>
          </div>
        </AdminCard>
      ) : null}

      {scene ? (
        <AdminCard>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{lang === "en" ? "Layers" : "레이어"}</h2>
            <div className="flex flex-wrap gap-2">
              {INTRO_LAYER_TYPES.map((type) => (
                <AdminActionButton
                  key={type}
                  variant="quiet"
                  onClick={() => {
                    const id = `layer-${Date.now()}`;
                    const next = defaultLayer(type, id, scene.layers.length + 1);
                    patchScene({ ...scene, layers: [...scene.layers, next] });
                    setLayerId(id);
                  }}
                >
                  + {introLayerTypeLabel(type, lang)}
                </AdminActionButton>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {scene.layers.map((l, i) => (
              <div key={l.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={`rounded-ui-rect border px-2 py-1 text-[12px] ${l.id === layerId ? "border-violet-500" : "border-sam-border"}`}
                  onClick={() => setLayerId(l.id)}
                >
                  {i + 1}. {introLayerTypeLabel(l.type, lang)}
                </button>
                <button
                  type="button"
                  className="rounded-ui-rect border border-sam-border px-1 text-[11px]"
                  disabled={i === 0}
                  onClick={() => {
                    patchScene({ ...scene, layers: reorderLayers(scene.layers, i, i - 1) });
                    setLayerId(l.id);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-ui-rect border border-sam-border px-1 text-[11px]"
                  disabled={i === scene.layers.length - 1}
                  onClick={() => {
                    patchScene({ ...scene, layers: reorderLayers(scene.layers, i, i + 1) });
                    setLayerId(l.id);
                  }}
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
          {layer ? (
            <LayerFields
              layer={layer}
              assets={campaign.assets}
              lang={lang}
              onChange={(next) =>
                patchScene({ ...scene, layers: scene.layers.map((l) => (l.id === next.id ? next : l)) })
              }
              onDelete={() => {
                patchScene({
                  ...scene,
                  layers: scene.layers.filter((l) => l.id !== layer.id),
                  interactionLayerId: scene.interactionLayerId === layer.id ? null : scene.interactionLayerId,
                });
                setLayerId(null);
              }}
            />
          ) : null}
        </AdminCard>
      ) : null}

      {scene?.cta?.enabled || scene?.interactionMode === "tap_cta" ? (
        <AdminCard>
          <h2 className="mb-3 font-semibold">{lang === "en" ? "CTA destination" : "이동 대상"}</h2>
          <CtaFields
            scene={scene}
            lang={lang}
            hits={entityHits}
            onSearch={searchEntity}
            onChange={(next) => patchScene(next)}
          />
        </AdminCard>
      ) : null}

      <AdminCard>
        <h2 className="mb-3 font-semibold">{lang === "en" ? "Media" : "미디어"}</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          {lang === "en"
            ? `Planned: ${INTRO_ADMIN_PLANNED_MEDIA.join(", ")}. Uploadable now: ${INTRO_ADMIN_UPLOADABLE_MEDIA.join(", ")}.`
            : `예정: ${INTRO_ADMIN_PLANNED_MEDIA.join(", ")}. 지금 업로드: ${INTRO_ADMIN_UPLOADABLE_MEDIA.join(", ")}.`}
        </p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadAsset(file);
          }}
        />
        <ul className="mt-2 text-sm">
          {campaign.assets.map((a) => (
            <li key={a.id}>{a.kind} · {a.decodeStatus} · {a.publicUrl ? "https" : "no url"}</li>
          ))}
        </ul>
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{lang === "en" ? "Device overrides" : "기기 설정"}</h2>
        <p className="mb-2 text-[12px] text-sam-muted">
          {lang === "en" ? "Without an override, COMMON composition is used." : "오버라이드가 없으면 공통 구성을 사용합니다."}
        </p>
        <AdminActionButton
          variant="secondary"
          onClick={() =>
            patchCampaign({
              ...campaign,
              deviceOverrides: [
                ...campaign.deviceOverrides,
                {
                  id: `tmp-ov-${Date.now()}`,
                  sceneId: scene?.id ?? null,
                  deviceFamily: "PHONE",
                  layers: scene?.layers ?? [],
                  backgroundAssetId: scene?.backgroundAssetId ?? null,
                },
              ],
            })
          }
        >
          {lang === "en" ? "Add override" : "오버라이드 추가"}
        </AdminActionButton>
        {campaign.deviceOverrides.map((ov, i) => (
          <div key={ov.id} className="mt-2 flex flex-wrap items-center gap-2">
            <select
              className="rounded-ui-rect border border-sam-border px-2 py-1"
              value={ov.deviceFamily}
              onChange={(e) => {
                const next = [...campaign.deviceOverrides];
                next[i] = { ...ov, deviceFamily: e.target.value as IntroDeviceFamily };
                patchCampaign({ ...campaign, deviceOverrides: next });
              }}
            >
              {INTRO_DEVICE_FAMILIES.map((f) => (
                <option key={f} value={f}>{introDeviceFamilyLabel(f, lang)}</option>
              ))}
            </select>
            <AdminActionButton
              variant="quiet"
              onClick={() =>
                patchCampaign({
                  ...campaign,
                  deviceOverrides: campaign.deviceOverrides.filter((x) => x.id !== ov.id),
                })
              }
            >
              {lang === "en" ? "Remove" : "삭제"}
            </AdminActionButton>
          </div>
        ))}
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">{safeT("admin_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {INTRO_ADMIN_PREVIEW_PRESETS.map((p) => (
            <AdminActionButton key={p} variant={preset === p ? "primary" : "secondary"} onClick={() => setPreset(p)}>
              {p.replaceAll("_", " ")}
            </AdminActionButton>
          ))}
        </div>
        <AdminIntroPreviewCanvas
          scene={scene}
          assets={campaign.assets}
          preset={preset}
          selectedLayerId={layerId}
          lang={lang}
          onSelectLayer={setLayerId}
          onMoveLayerPct={(id, xPct, yPct) => {
            if (!scene) return;
            patchScene({
              ...scene,
              layers: scene.layers.map((l) => (l.id === id ? { ...l, xPct, yPct } : l)),
            });
          }}
        />
      </AdminCard>

      <AdminCard>
        <h2 className="mb-3 font-semibold">
          {safeT("admin_intro_resolver_preview", { fallbackKo: "노출 미리보기", fallbackEn: "Resolver preview" })}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            DATETIME
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={resolverFixture.now}
              onChange={(e) => setResolverFixture({ ...resolverFixture, now: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            AUDIENCE
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={resolverFixture.audience}
              onChange={(e) =>
                setResolverFixture({ ...resolverFixture, audience: e.target.value as typeof resolverFixture.audience })
              }
            >
              {["guest", "authenticated", "new", "returning", "unknown"].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            PLATFORM
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={resolverFixture.platform}
              onChange={(e) =>
                setResolverFixture({ ...resolverFixture, platform: e.target.value as typeof resolverFixture.platform })
              }
            >
              {["android", "ios", "web", "unknown"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            DEVICE CLASS
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={resolverFixture.deviceClass}
              onChange={(e) =>
                setResolverFixture({
                  ...resolverFixture,
                  deviceClass: e.target.value as typeof resolverFixture.deviceClass,
                })
              }
            >
              {["PHONE_ANDROID", "PHONE_IOS", "TABLET_ANDROID", "TABLET_IPAD"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={resolverFixture.frequencyEligible}
              onChange={(e) => setResolverFixture({ ...resolverFixture, frequencyEligible: e.target.checked })}
            />
            FREQUENCY ELIGIBLE
          </label>
        </div>
        <AdminActionButton className="mt-3" variant="secondary" onClick={() => void runResolver()}>
          {lang === "en" ? "Run resolver" : "승자 확인"}
        </AdminActionButton>
        {resolver ? (
          <div className="mt-3 text-sm">
            {resolver.zeroIntro ? (
              <>
                <p className="font-semibold">ZERO INTRO</p>
                <p>{lang === "en" ? resolver.reasonEn : resolver.reasonKo}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">WINNER: {resolver.winner?.name}</p>
                <p>{lang === "en" ? resolver.reasonEn : resolver.reasonKo}</p>
              </>
            )}
          </div>
        ) : null}
      </AdminCard>

      {issues.length > 0 ? (
        <AdminCard>
          <h2 className="mb-2 font-semibold">{lang === "en" ? "Validation" : "검사 결과"}</h2>
          <ul className="space-y-1 text-sm text-red-800">
            {issues.map((issue) => (
              <li key={`${issue.path}-${issue.code}`}>
                <span className="font-mono text-[12px]">{issue.path}</span> — {lang === "en" ? issue.messageEn : issue.messageKo}
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}
    </div>
  );
}

function LayerFields({
  layer,
  assets,
  lang,
  onChange,
  onDelete,
}: {
  layer: IntroLayer;
  assets: readonly IntroAdminAsset[];
  lang: "ko" | "en";
  onChange: (layer: IntroLayer) => void;
  onDelete: () => void;
}) {
  const style = parseIntroTextStyleToken(layer.animation);
  const align = parseIntroTextAlignment(layer.animation);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label className="block text-sm">
        Anchor
        <select
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={layer.anchor}
          onChange={(e) => onChange({ ...layer, anchor: e.target.value as IntroLayer["anchor"] })}
        >
          {INTRO_LAYER_ANCHORS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </label>
      {(["xPct", "yPct", "widthPct", "minWidthPct", "maxWidthPct", "opacity", "zIndex"] as const).map((key) => (
        <label key={key} className="block text-sm">
          {key}
          <input
            type="number"
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={layer[key] ?? ""}
            onChange={(e) => onChange({ ...layer, [key]: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={layer.safeArea !== false}
          onChange={(e) => onChange({ ...layer, safeArea: e.target.checked })}
        />
        Safe area
      </label>
      <label className="block text-sm">
        Aspect
        <select
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={layer.aspectPolicy ?? "contain"}
          onChange={(e) =>
            onChange({ ...layer, aspectPolicy: e.target.value as IntroLayer["aspectPolicy"] })
          }
        >
          {INTRO_ASPECT_POLICIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      {(layer.type === "IMAGE" || layer.type === "LOGO" || layer.type === "BACKGROUND" || layer.type === "DECORATION") ? (
        <label className="block text-sm">
          Asset
          <select
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={layer.assetId ?? ""}
            onChange={(e) => onChange({ ...layer, assetId: e.target.value || undefined })}
          >
            <option value="">{lang === "en" ? "None" : "없음"}</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.kind}</option>
            ))}
          </select>
        </label>
      ) : null}
      {layer.type === "TEXT" || layer.type === "CTA" ? (
        <>
          <label className="block text-sm md:col-span-3">
            {lang === "en" ? "Text" : "텍스트"}
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={layer.text ?? ""}
              onChange={(e) => onChange({ ...layer, text: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Style" : "스타일"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={style}
              onChange={(e) =>
                onChange({
                  ...layer,
                  animation: composeIntroTextAnimation(e.target.value as (typeof INTRO_TEXT_STYLE_TOKENS)[number], align, null),
                })
              }
            >
              {INTRO_TEXT_STYLE_TOKENS.map((t) => (
                <option key={t} value={t}>{introTextStyleLabel(t, lang)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {lang === "en" ? "Align" : "정렬"}
            <select
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={align}
              onChange={(e) =>
                onChange({
                  ...layer,
                  animation: composeIntroTextAnimation(style, e.target.value as (typeof INTRO_TEXT_ALIGNMENTS)[number], null),
                })
              }
            >
              {INTRO_TEXT_ALIGNMENTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <AdminActionButton variant="danger" onClick={onDelete}>
        {lang === "en" ? "Delete layer" : "레이어 삭제"}
      </AdminActionButton>
    </div>
  );
}

function CtaFields({
  scene,
  lang,
  hits,
  onSearch,
  onChange,
}: {
  scene: IntroAdminScene;
  lang: "ko" | "en";
  hits: Array<{ id: string; label: string }>;
  onSearch: (kind: string, q: string) => void;
  onChange: (scene: IntroAdminScene) => void;
}) {
  const dest = scene.cta?.destination ?? { type: "COMMUNITY" as const };
  const type = dest.type;
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        {lang === "en" ? "Destination" : "대상"}
        <select
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
          value={type}
          onChange={(e) =>
            onChange({
              ...scene,
              cta: { enabled: true, destination: { type: e.target.value as IntroCtaDestinationType } },
            })
          }
        >
          {INTRO_CTA_DESTINATION_TYPES.map((t) => (
            <option key={t} value={t}>{introCtaTypeLabel(t, lang)}</option>
          ))}
        </select>
      </label>
      {ENTITY_KINDS.has(type) ? (
        <label className="block text-sm">
          {lang === "en" ? "Search" : "검색"}
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            onChange={(e) => onSearch(type, e.target.value)}
          />
          <ul className="mt-1">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className="text-left text-sm underline"
                  onClick={() =>
                    onChange({ ...scene, cta: { enabled: true, destination: { type, id: hit.id } } })
                  }
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
          {dest.id ? <p className="mt-1 text-[12px] text-sam-muted">ID: {dest.id}</p> : null}
        </label>
      ) : null}
      {type === "INTERNAL_PATH" ? (
        <label className="block text-sm">
          Path
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={dest.path ?? ""}
            onChange={(e) =>
              onChange({ ...scene, cta: { enabled: true, destination: { type, path: e.target.value } } })
            }
          />
        </label>
      ) : null}
      {type === "EXTERNAL_URL" ? (
        <label className="block text-sm">
          https URL
          <input
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
            value={dest.url ?? ""}
            onChange={(e) =>
              onChange({ ...scene, cta: { enabled: true, destination: { type, url: e.target.value } } })
            }
          />
        </label>
      ) : null}
    </div>
  );
}
