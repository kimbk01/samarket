"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { IntroV3MediaLibrary } from "@/components/admin/intro-v3/IntroV3MediaLibrary";
import { IntroV3SceneSurface, type IntroV3LayerPreview } from "@/components/admin/intro-v3/IntroV3SceneSurface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";
import type { IntroV3Document } from "@/lib/startup/intro-v3/document";
import { addImageLayerToDocument, replaceImageLayerMedia } from "@/lib/startup/intro-v3/image-layer-authority";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import type { IntroV3LibraryIntent, IntroV3LibrarySelection, IntroV3MediaDerivative, IntroV3MediaSource } from "@/lib/startup/intro-v3/media-types";

type MediaItem = { source: IntroV3MediaSource; derivative: IntroV3MediaDerivative };

export function AdminIntroV3DraftPage({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const [campaign, setCampaign] = useState<IntroV3CampaignRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryIntent, setLibraryIntent] = useState<IntroV3LibraryIntent>("ADD_IMAGE");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: IntroV3CampaignRow;
    };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intros.",
        })
      );
      setCampaign(null);
      return;
    }
    setCampaign(json.campaign);
    setError(null);
  }, [campaignId, safeT]);

  const loadMedia = useCallback(async () => {
    const res = await fetch("/api/admin/intro-v3/media", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: MediaItem[] };
    setMediaItems(json.items ?? []);
  }, []);

  useEffect(() => {
    void load();
    void loadMedia();
  }, [load, loadMedia]);

  const scene = campaign?.document.scenes[0] ?? null;
  const imageLayers = scene?.layers.filter((layer) => layer.type === "IMAGE") ?? [];
  const replaceTargetId = selectedLayerId && imageLayers.some((layer) => layer.id === selectedLayerId)
    ? selectedLayerId
    : imageLayers[imageLayers.length - 1]?.id ?? null;

  const previewByDerivativeId = useMemo(() => {
    const map: Record<string, IntroV3LayerPreview> = {};
    for (const item of mediaItems) {
      if (item.derivative.status !== "ready" || !item.derivative.publicUrl) continue;
      map[item.derivative.id] = {
        url: item.derivative.publicUrl,
        width: item.derivative.width,
        height: item.derivative.height,
      };
    }
    return map;
  }, [mediaItems]);

  async function persistDocument(document: IntroV3Document): Promise<boolean> {
    setBusy(true);
    setSaveError(null);
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroV3CampaignRow };
    setBusy(false);
    if (!res.ok || !json.ok || !json.campaign) {
      setSaveError(
        safeT("admin_intro_save_failed", {
          fallbackKo: "저장에 실패했습니다. 편집 내용은 그대로 있습니다.",
          fallbackEn: "Save failed. Your edits are still here.",
        })
      );
      return false;
    }
    setCampaign(json.campaign);
    return true;
  }

  function openAdd() {
    setLibraryIntent("ADD_IMAGE");
    setLibraryOpen(true);
  }

  function openReplace() {
    if (!replaceTargetId) return;
    setLibraryIntent("REPLACE_MEDIA");
    setLibraryOpen(true);
  }

  async function onLibrarySelect(selection: IntroV3LibrarySelection) {
    if (!campaign || !scene) return;
    const outcome = applyIntroV3LibraryOutcome({ kind: "select", selection });
    if (!outcome.selected) return;
    if (libraryIntent === "REPLACE_MEDIA") {
      if (!replaceTargetId) return;
      const replaced = replaceImageLayerMedia(campaign.document, replaceTargetId, outcome.selected);
      if (!replaced.ok) return;
      const saved = await persistDocument(replaced.document);
      if (saved) {
        setSelectedLayerId(replaced.layer.id);
        await loadMedia();
      }
      return;
    }
    const added = addImageLayerToDocument(campaign.document, scene.id, outcome.selected);
    if (!added.ok) return;
    const saved = await persistDocument(added.document);
    if (saved) {
      setSelectedLayerId(added.layer.id);
      await loadMedia();
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        backHref="/admin/intro-v3"
        titleKey="admin_intro_v3_title"
        descriptionKey="admin_intro_v3_author_note"
      />
      {error ? <p className="sam-text-body text-red-700">{error}</p> : null}
      {saveError ? <p className="sam-text-body text-red-700">{saveError}</p> : null}
      {scene ? (
        <AdminCard title={campaign?.name}>
          <IntroV3SceneSurface
            background={scene.background}
            layers={scene.layers}
            previewByDerivativeId={previewByDerivativeId}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-intro-v3-add-image="1"
              className="inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              onClick={openAdd}
              disabled={busy}
            >
              {safeT("admin_intro_v3_add_image", { fallbackKo: "+ 이미지", fallbackEn: "+ Image" })}
            </button>
            <button
              type="button"
              data-intro-v3-replace-image="1"
              className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-fg disabled:opacity-50"
              onClick={openReplace}
              disabled={busy || !replaceTargetId}
            >
              {safeT("admin_intro_v3_replace_image", { fallbackKo: "이미지 바꾸기", fallbackEn: "Replace image" })}
            </button>
            <span className="sam-text-helper text-sam-muted" data-intro-v3-layer-count={imageLayers.length}>
              {safeT("admin_intro_v3_image_count", { fallbackKo: "이미지", fallbackEn: "Images" })} {imageLayers.length}
            </span>
          </div>
        </AdminCard>
      ) : null}
      <IntroV3MediaLibrary
        open={libraryOpen}
        intent={libraryIntent}
        onClose={() => setLibraryOpen(false)}
        onSelect={(next) => {
          void onLibrarySelect(next);
        }}
      />
    </div>
  );
}
