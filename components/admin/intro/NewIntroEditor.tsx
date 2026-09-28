"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IntroV3MediaLibrary } from "@/components/admin/intro-v3/IntroV3MediaLibrary";
import {
  IntroEditorCanvas,
  type IntroEditorLayerPreview,
} from "@/components/admin/intro/IntroEditorCanvas";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";
import type { IntroV3Document, IntroV3Layer } from "@/lib/startup/intro-v3/document";
import { addImageLayerToDocument } from "@/lib/startup/intro-v3/image-layer-authority";
import { applyIntroV3LibraryOutcome } from "@/lib/startup/intro-v3/media-library";
import type {
  IntroV3LibrarySelection,
  IntroV3MediaDerivative,
  IntroV3MediaSource,
} from "@/lib/startup/intro-v3/media-types";

type MediaItem = { source: IntroV3MediaSource; derivative: IntroV3MediaDerivative };

function cloneDocument(document: IntroV3Document): IntroV3Document {
  return JSON.parse(JSON.stringify(document)) as IntroV3Document;
}

function documentsEqual(a: IntroV3Document | null, b: IntroV3Document | null): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function NewIntroEditor({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const [campaign, setCampaign] = useState<IntroV3CampaignRow | null>(null);
  const [working, setWorking] = useState<IntroV3Document | null>(null);
  const [saved, setSaved] = useState<IntroV3Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [previewByDerivativeId, setPreviewByDerivativeId] = useState<Record<string, IntroEditorLayerPreview>>(
    {}
  );
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
      setWorking(null);
      setSaved(null);
      return;
    }
    const document = cloneDocument(json.campaign.document);
    setCampaign(json.campaign);
    setWorking(document);
    setSaved(cloneDocument(document));
    setSelectedSceneId(document.scenes[0]?.id ?? null);
    setError(null);
  }, [campaignId, safeT]);

  const loadMedia = useCallback(async () => {
    const res = await fetch("/api/admin/intro-v3/media", { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: MediaItem[] };
    const next: Record<string, IntroEditorLayerPreview> = {};
    for (const item of json.items ?? []) {
      if (item.derivative.status !== "ready" || !item.derivative.publicUrl) continue;
      next[item.derivative.id] = {
        url: item.derivative.publicUrl,
        width: item.derivative.width,
        height: item.derivative.height,
      };
    }
    setPreviewByDerivativeId((prev) => ({ ...next, ...prev }));
  }, []);

  useEffect(() => {
    void load();
    void loadMedia();
  }, [load, loadMedia]);

  const dirty = useMemo(() => !documentsEqual(working, saved), [working, saved]);
  const scene = working?.scenes.find((item) => item.id === selectedSceneId) ?? working?.scenes[0] ?? null;
  const imageLayers = scene?.layers.filter((layer) => layer.type === "IMAGE") ?? [];
  const selectedLayer: IntroV3Layer | null =
    scene?.layers.find((layer) => layer.id === selectedLayerId) ?? null;

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
    const next = cloneDocument(json.campaign.document);
    setCampaign(json.campaign);
    setWorking(next);
    setSaved(cloneDocument(next));
    return true;
  }

  function openAddImage() {
    setLibraryOpen(true);
  }

  function rememberPreview(selection: IntroV3LibrarySelection) {
    const url = selection.derivative.publicUrl;
    if (selection.derivative.status !== "ready" || !url) return;
    setPreviewByDerivativeId((prev) => ({
      ...prev,
      [selection.derivative.id]: {
        url,
        width: selection.derivative.width,
        height: selection.derivative.height,
      },
    }));
  }

  async function onLibrarySelect(selection: IntroV3LibrarySelection) {
    if (!working || !scene) return;
    const outcome = applyIntroV3LibraryOutcome({ kind: "select", selection });
    if (!outcome.selected) return;
    const added = addImageLayerToDocument(working, scene.id, outcome.selected);
    if (!added.ok) return;
    rememberPreview(outcome.selected);
    setWorking(added.document);
    setSelectedLayerId(added.layer.id);
    await loadMedia();
  }

  const addDisabledClass =
    "inline-flex min-h-8 items-center rounded-ui-rect border border-sam-border px-2.5 py-1 text-[12px] font-semibold text-sam-muted disabled:opacity-50";

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[36rem] flex-col" data-intro-editor="rebuild-v3">
      <header
        className="flex shrink-0 items-center gap-3 border-b border-sam-border bg-sam-surface px-3 py-2"
        data-intro-topbar="1"
      >
        <Link
          href="/admin/intro"
          className="inline-flex min-h-9 items-center rounded-ui-rect px-2 text-[18px] font-semibold text-sam-fg"
          aria-label={safeT("admin_back_to_list", { fallbackKo: "목록으로", fallbackEn: "Back to list" })}
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate sam-text-section-title text-sam-fg">{campaign?.name ?? "…"}</h1>
        </div>
        <span
          className="rounded-full border border-sam-border px-2 py-0.5 text-[11px] font-semibold text-sam-muted"
          data-intro-status={campaign?.status ?? "draft"}
        >
          {safeT("admin_intro_status_draft", { fallbackKo: "초안", fallbackEn: "Draft" })}
        </span>
        {dirty ? (
          <span className="text-[11px] font-semibold text-amber-700">
            {safeT("admin_intro_dirty", {
              fallbackKo: "저장하지 않은 변경사항",
              fallbackEn: "Unsaved changes",
            })}
          </span>
        ) : null}
        <button
          type="button"
          data-intro-save="1"
          className="inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          disabled={busy || !working || !dirty}
          onClick={() => {
            if (working) void persistDocument(working);
          }}
        >
          {safeT("admin_intro_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </button>
        <button
          type="button"
          data-intro-preview="1"
          className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-muted"
          disabled
        >
          {safeT("admin_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
        </button>
        <button
          type="button"
          data-intro-publish="1"
          className="inline-flex min-h-9 items-center rounded-ui-rect border border-sam-border px-3 py-1.5 text-[13px] font-semibold text-sam-muted"
          disabled
        >
          {safeT("admin_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </button>
      </header>

      {error ? <p className="px-3 py-2 sam-text-body text-red-700">{error}</p> : null}
      {saveError ? <p className="px-3 py-2 sam-text-body text-red-700">{saveError}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)_16rem] divide-x divide-sam-border bg-sam-app">
        <aside className="min-h-0 overflow-y-auto bg-sam-surface p-3" data-intro-storyboard="1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_intro_storyboard", { fallbackKo: "장면 순서", fallbackEn: "Scenes" })}
          </p>
          <ul className="mt-2 space-y-2">
            {(working?.scenes ?? []).map((item, index) => {
              const active = item.id === scene?.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    data-intro-scene={item.id}
                    className={`w-full rounded-ui-rect border px-2 py-2 text-left text-[13px] font-semibold ${
                      active ? "border-sam-fg bg-sam-app" : "border-sam-border text-sam-fg"
                    }`}
                    onClick={() => setSelectedSceneId(item.id)}
                  >
                    Scene {index + 1}
                    <span className="mt-1 block text-[11px] font-normal text-sam-muted">{item.holdMs}ms</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className={`${addDisabledClass} mt-3 w-full justify-center`} disabled>
            {safeT("admin_intro_add_scene", { fallbackKo: "장면 추가", fallbackEn: "Add scene" })}
          </button>
          <div className="mt-4 space-y-1.5">
            <button
              type="button"
              data-intro-add-image="1"
              className="inline-flex min-h-8 w-full items-center justify-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
              onClick={openAddImage}
              disabled={busy || !scene}
            >
              {safeT("admin_intro_v3_add_image", { fallbackKo: "+ 이미지", fallbackEn: "+ Image" })}
            </button>
            <button type="button" className={`${addDisabledClass} w-full justify-center`} disabled>
              {safeT("admin_intro_add_logo_plus", { fallbackKo: "+ 로고", fallbackEn: "+ Logo" })}
            </button>
            <button type="button" className={`${addDisabledClass} w-full justify-center`} disabled>
              {safeT("admin_intro_add_text_plus", { fallbackKo: "+ 텍스트", fallbackEn: "+ Text" })}
            </button>
            <button type="button" className={`${addDisabledClass} w-full justify-center`} disabled>
              {safeT("admin_intro_add_cta_plus", { fallbackKo: "+ 버튼", fallbackEn: "+ Button" })}
            </button>
            <button type="button" className={`${addDisabledClass} w-full justify-center`} disabled>
              {safeT("admin_intro_add_decoration_plus", { fallbackKo: "+ 장식", fallbackEn: "+ Decoration" })}
            </button>
          </div>
        </aside>

        <section className="flex min-h-0 items-center justify-center bg-[#0a0a0a] p-4" data-intro-canvas-stage="1">
          <div className="relative h-full max-h-full w-auto" style={{ aspectRatio: "9 / 16" }}>
            <IntroEditorCanvas
              background={scene?.background ?? { type: "COLOR", color: "#0B5F3A" }}
              layers={scene?.layers ?? []}
              previewByDerivativeId={previewByDerivativeId}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
            />
          </div>
        </section>

        <aside className="min-h-0 overflow-y-auto bg-sam-surface p-3" data-intro-properties="1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_intro_properties", { fallbackKo: "속성", fallbackEn: "Properties" })}
          </p>
          {selectedLayer && selectedLayer.type === "IMAGE" ? (
            <div className="mt-3 space-y-2" data-intro-selected-layer={selectedLayer.id}>
              <p className="text-[13px] font-semibold text-sam-fg">IMAGE</p>
              <p className="sam-text-helper text-sam-muted">{selectedLayer.payload.alt ?? ""}</p>
              <p className="sam-text-helper text-sam-muted" data-intro-layer-count={imageLayers.length}>
                {safeT("admin_intro_v3_image_count", { fallbackKo: "이미지", fallbackEn: "Images" })}{" "}
                {imageLayers.length}
              </p>
            </div>
          ) : (
            <p className="mt-3 sam-text-helper text-sam-muted">
              {safeT("admin_intro_layer_none", {
                fallbackKo: "레이어를 선택하세요.",
                fallbackEn: "Select a layer.",
              })}
            </p>
          )}
        </aside>
      </div>

      <IntroV3MediaLibrary
        open={libraryOpen}
        intent="ADD_IMAGE"
        onClose={() => setLibraryOpen(false)}
        onSelect={(next) => {
          void onLibrarySelect(next);
        }}
      />
    </div>
  );
}
