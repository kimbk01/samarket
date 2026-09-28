"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IntroMediaLibrary } from "@/components/admin/intro/IntroEditor/IntroMediaLibrary";
import { ScenePropertiesPanel } from "@/components/admin/intro/IntroEditor/ScenePropertiesPanel";
import { SceneStoryboard } from "@/components/admin/intro/IntroEditor/SceneStoryboard";
import { SceneWorkspace } from "@/components/admin/intro/IntroEditor/SceneWorkspace";
import { patchSceneBackgroundColor } from "@/lib/startup/intro/domain/patch-scene-background";
import { introSceneBackgroundCssColor } from "@/lib/startup/intro/renderer/scene-background";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";
import { isIntroV3HexColor, type IntroV3Document } from "@/lib/startup/intro-v3/document";
import type { IntroV3Fit, IntroV3Geometry } from "@/lib/startup/intro-v3/geometry";
import {
  applyLocalImageGeometry,
  commitIntroV3ImageLibraryOutcome,
  deleteImageLayerFromDocument,
  introV3IsDirty,
  introV3WorkingFingerprint,
  setImageLayerFit,
  setImageLayerVisible,
  setImageLayerZ,
} from "@/lib/startup/intro-v3/image-layer-authority";
import type { IntroV3LibraryIntent, IntroV3LibrarySelection } from "@/lib/startup/intro-v3/media-types";
import {
  fetchIntroV3ReadyMediaCatalog,
  introV3CatalogToken,
  type IntroV3ReadyCatalogItem,
} from "@/lib/startup/intro-v3/media-upload-client";

type LibrarySession = { intent: IntroV3LibraryIntent; replaceLayerId?: string };

export function IntroEditor({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const [campaign, setCampaign] = useState<IntroV3CampaignRow | null>(null);
  const [name, setName] = useState("");
  const [working, setWorking] = useState<IntroV3Document | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<IntroV3ReadyCatalogItem[]>([]);
  const [library, setLibrary] = useState<LibrarySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rememberCatalog = useCallback((item: IntroV3ReadyCatalogItem) => {
    setCatalog((current) => {
      const token = introV3CatalogToken(item);
      return [item, ...current.filter((entry) => introV3CatalogToken(entry) !== token)];
    });
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroV3CampaignRow };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로를 불러오지 못했습니다.",
          fallbackEn: "Could not load intro.",
        })
      );
      return;
    }
    setCampaign(json.campaign);
    setName(json.campaign.name);
    setWorking(json.campaign.document);
    setSavedFingerprint(introV3WorkingFingerprint({ name: json.campaign.name, document: json.campaign.document }));
    setError(null);
    const listed = await fetchIntroV3ReadyMediaCatalog();
    setCatalog(listed);
  }, [campaignId, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const scene = working?.scenes[0] ?? null;
  const color = introSceneBackgroundCssColor(scene?.background ?? null);
  const selected = scene?.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const dirty = working
    ? introV3IsDirty(savedFingerprint, introV3WorkingFingerprint({ name, document: working }))
    : false;

  const onColorChange = (next: string) => {
    if (!working || !scene || !isIntroV3HexColor(next)) return;
    const patched = patchSceneBackgroundColor(working, scene.id, next);
    if (patched) setWorking(patched);
  };

  const onGeometryChange = (layerId: string, geometry: IntroV3Geometry) => {
    if (!working) return;
    const next = applyLocalImageGeometry(working, layerId, geometry);
    if (next.ok) setWorking(next.document);
  };

  const onLibraryReady = (selection: IntroV3LibrarySelection) => {
    if (!working || !scene) return;
    const committed = commitIntroV3ImageLibraryOutcome({
      document: working,
      sceneId: scene.id,
      outcome: { kind: "select", selection },
      replaceLayerId: library?.replaceLayerId ?? null,
    });
    setWorking(committed.document);
    if (committed.selectedLayerId) setSelectedLayerId(committed.selectedLayerId);
    setLibrary(null);
  };

  const onSave = async () => {
    if (!working) return;
    setSaving(true);
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: working, name }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroV3CampaignRow };
    setSaving(false);
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_save_failed", {
          fallbackKo: "저장에 실패했습니다. 편집 내용은 그대로 있습니다.",
          fallbackEn: "Save failed. Your unsaved edits are still here.",
        })
      );
      return;
    }
    setCampaign(json.campaign);
    setName(json.campaign.name);
    setWorking(json.campaign.document);
    setSavedFingerprint(introV3WorkingFingerprint({ name: json.campaign.name, document: json.campaign.document }));
    setError(null);
  };

  const sceneLabel = useMemo(
    () => safeT("admin_intro_scene_one", { fallbackKo: "Scene 1", fallbackEn: "Scene 1" }),
    [safeT]
  );

  if (!campaign || !working || !scene) {
    return (
      <div className="sam-text-body text-sam-muted" data-intro-editor-loading="1">
        {error}
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100dvh-8.5rem)] min-h-0 flex-col"
      data-intro-editor="cut-1-image"
      data-intro-dirty={dirty ? "1" : "0"}
    >
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2"
        data-intro-topbar="1"
      >
        <Link href="/admin/intro" className="text-[13px] font-semibold text-sam-fg">
          ← {safeT("admin_intro_title", { fallbackKo: "인트로", fallbackEn: "Intro" })}
        </Link>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-9 min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 text-[14px] font-semibold text-sam-fg"
          data-intro-campaign-name="1"
        />
        <span
          className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
            dirty ? "bg-amber-100 text-amber-900" : "bg-sam-app text-sam-muted"
          }`}
          data-intro-dirty-badge={dirty ? "dirty" : "clean"}
        >
          {dirty
            ? safeT("admin_intro_dirty", { fallbackKo: "저장하지 않은 변경사항", fallbackEn: "Unsaved changes" })
            : safeT("admin_intro_saved", { fallbackKo: "저장됨", fallbackEn: "Saved" })}
        </span>
        <AdminActionButton variant="primary" onClick={() => void onSave()} disabled={saving} data-intro-save="1">
          {safeT("admin_intro_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </AdminActionButton>
      </header>
      {error ? <p className="px-3 py-1 text-[13px] text-red-800">{error}</p> : null}
      <div className="flex min-h-0 flex-1">
        <SceneStoryboard sceneId={scene.id} sceneLabel={sceneLabel} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2" data-intro-element-toolbar="1">
            <AdminActionButton
              variant="secondary"
              onClick={() => setLibrary({ intent: "ADD_IMAGE" })}
              data-intro-add-image="1"
            >
              {safeT("admin_intro_v3_add_image", { fallbackKo: "+ 이미지", fallbackEn: "+ Image" })}
            </AdminActionButton>
          </div>
          <SceneWorkspace
            scene={scene}
            selectedLayerId={selectedLayerId}
            catalog={catalog}
            onSelect={setSelectedLayerId}
            onGeometryChange={onGeometryChange}
          />
        </div>
        <ScenePropertiesPanel
          color={color}
          selected={selected}
          catalog={catalog}
          onColorChange={onColorChange}
          onFitChange={(fit: IntroV3Fit) => {
            if (!working || !selectedLayerId) return;
            const next = setImageLayerFit(working, selectedLayerId, fit);
            if (next.ok) setWorking(next.document);
          }}
          onVisibleChange={(visible) => {
            if (!working || !selectedLayerId) return;
            const next = setImageLayerVisible(working, selectedLayerId, visible);
            if (next.ok) setWorking(next.document);
          }}
          onZChange={(direction) => {
            if (!working || !selected) return;
            const nextZ = direction === "forward" ? selected.z + 1 : selected.z - 1;
            const next = setImageLayerZ(working, selected.id, nextZ);
            if (next.ok) setWorking(next.document);
          }}
          onReplace={() => {
            if (!selectedLayerId) return;
            setLibrary({ intent: "REPLACE_MEDIA", replaceLayerId: selectedLayerId });
          }}
          onDelete={() => {
            if (!working || !selectedLayerId) return;
            const next = deleteImageLayerFromDocument(working, selectedLayerId);
            if (!next.ok) return;
            setWorking(next.document);
            setSelectedLayerId(null);
          }}
        />
      </div>
      {library ? (
        <IntroMediaLibrary
          intent={library.intent}
          onCancel={() => setLibrary(null)}
          onReady={onLibraryReady}
          onCatalogReady={rememberCatalog}
        />
      ) : null}
    </div>
  );
}
