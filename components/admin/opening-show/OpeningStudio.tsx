"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { OpeningImageProperties } from "@/components/admin/opening-show/OpeningImageProperties";
import { OpeningLiveStage } from "@/components/admin/opening-show/OpeningLiveStage";
import { OpeningMediaPicker } from "@/components/admin/opening-show/OpeningMediaPicker";
import { OpeningPreviewTheater } from "@/components/admin/opening-show/OpeningPreviewTheater";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { uploadOpeningImageFile } from "@/lib/opening-show/client-upload";
import {
  createEmptyOpeningDocument,
  openingPrimaryScene,
  parseOpeningDocument,
  type OpeningDocument,
  type OpeningImageFit,
} from "@/lib/opening-show/document";
import { defaultImageFrame } from "@/lib/opening-show/geometry";
import {
  addImageLayer,
  findLayer,
  moveLayerZ,
  removeLayer,
  replaceLayerMedia,
  setLayerFit,
  setLayerVisible,
} from "@/lib/opening-show/layer-ops";
import type { OpeningReadyMedia, OpeningShowDetail } from "@/lib/opening-show/types";
import {
  openingPublishFailCopy,
  type OpeningPublishFailReason,
} from "@/lib/opening-show/publish-validate";

type PickerMode = { kind: "add" } | { kind: "replace"; layerId: string };

export function OpeningStudio({ showId }: { showId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [document, setDocument] = useState<OpeningDocument>(createEmptyOpeningDocument);
  const [savedDocument, setSavedDocument] = useState<OpeningDocument>(createEmptyOpeningDocument);
  const [media, setMedia] = useState<OpeningReadyMedia[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 9, h: 16 });
  const [stageHost, setStageHost] = useState<HTMLDivElement | null>(null);
  const [latestRevisionId, setLatestRevisionId] = useState<string | null>(null);
  const [latestRevisionNumber, setLatestRevisionNumber] = useState<number | null>(null);
  const [liveRevisionNumber, setLiveRevisionNumber] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [settingLive, setSettingLive] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const mediaById = useMemo(() => new Map(media.map((item) => [item.id, item])), [media]);
  const selected = findLayer(document, selectedLayerId);
  const dirty =
    title.trim() !== savedTitle.trim() || JSON.stringify(document) !== JSON.stringify(savedDocument);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetch(`/api/admin/opening-shows/${showId}`, { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      show?: OpeningShowDetail;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.show) {
      setLoadError(
        safeT("admin_opening_load_studio_error", {
          fallbackKo: "스튜디오를 불러오지 못했습니다.",
          fallbackEn: "Could not load the studio.",
        })
      );
      setLoading(false);
      return;
    }
    const parsed = parseOpeningDocument(json.show.document) ?? createEmptyOpeningDocument();
    setTitle(json.show.title);
    setSavedTitle(json.show.title);
    setDocument(parsed);
    setSavedDocument(parsed);
    setMedia(json.show.media);
    setLatestRevisionId(json.show.latestRevisionId);
    setLatestRevisionNumber(json.show.latestRevisionNumber);
    setLiveRevisionNumber(json.show.liveRevisionNumber);
    setIsLive(json.show.isLive);
    setLoading(false);
  }, [safeT, showId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!stageHost) return;
    const update = () => {
      const rect = stageHost.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      setStageSize((prev) =>
        Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1
          ? prev
          : { w: rect.width, h: rect.height }
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stageHost);
    return () => observer.disconnect();
  }, [stageHost]);

  const markDocument = (next: OpeningDocument) => {
    setDocument(next);
    setSaveError(null);
  };

  const applyReadyMedia = (item: OpeningReadyMedia) => {
    setMedia((prev) => {
      if (prev.some((row) => row.id === item.id)) return prev;
      return [item, ...prev];
    });
    const surfaceAspect = stageSize.w / Math.max(stageSize.h, 1);
    const imageAspect = item.width / Math.max(item.height, 1);
    if (picker?.kind === "replace") {
      const layerId = picker.layerId;
      setDocument((current) => replaceLayerMedia(current, layerId, item.id));
      setSelectedLayerId(layerId);
    } else {
      const layerId = globalThis.crypto.randomUUID();
      setDocument((current) =>
        addImageLayer(current, {
          id: layerId,
          mediaId: item.id,
          frame: defaultImageFrame(imageAspect, surfaceAspect),
          fit: "contain",
        })
      );
      setSelectedLayerId(layerId);
    }
    setPicker(null);
    setUploadError(null);
    setSaveError(null);
  };

  const onUploadFile = async (file: File) => {
    setUploadBusy(true);
    setUploadError(null);
    const before = document;
    const result = await uploadOpeningImageFile({ showId, file });
    setUploadBusy(false);
    if (!result.ok) {
      setDocument(before);
      setUploadError(
        picker?.kind === "replace"
          ? safeT("admin_opening_replace_keep", {
              fallbackKo: "교체 실패. 기존 이미지를 유지합니다.",
              fallbackEn: "Replace failed. The existing image stays.",
            })
          : safeT("admin_opening_upload_error", {
              fallbackKo: "이미지를 올리지 못했습니다. 화면은 그대로입니다.",
              fallbackEn: "Could not add the image. Nothing changed.",
            })
      );
      return;
    }
    applyReadyMedia(result.media);
  };

  const onSave = async () => {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/admin/opening-shows/${showId}/draft`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, document }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; document?: unknown };
    setSaving(false);
    if (!res.ok || json.ok !== true) {
      setSaveError(
        safeT("admin_opening_save_error", {
          fallbackKo: "저장하지 못했습니다. 변경은 유지됩니다.",
          fallbackEn: "Save failed. Your edits are still here.",
        })
      );
      return;
    }
    const parsed = parseOpeningDocument(json.document) ?? document;
    setDocument(parsed);
    setSavedDocument(parsed);
    setSavedTitle(title.trim());
  };

  const onPublish = async () => {
    if (dirty) {
      setPublishError(
        safeT("admin_opening_publish_need_save", {
          fallbackKo: "먼저 저장한 뒤에 게시하세요.",
          fallbackEn: "Save first, then publish.",
        })
      );
      return;
    }
    setPublishing(true);
    setPublishError(null);
    const res = await fetch(`/api/admin/opening-shows/${showId}/publish`, {
      method: "POST",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      revisionId?: string;
      revisionNumber?: number;
      reason?: OpeningPublishFailReason;
    };
    setPublishing(false);
    if (!res.ok || json.ok !== true) {
      if (json.reason) {
        const copy = openingPublishFailCopy(json.reason);
        setPublishError(safeT("admin_opening_publish_error", copy));
      } else {
        setPublishError(
          safeT("admin_opening_publish_error", {
            fallbackKo: "게시하지 못했습니다.",
            fallbackEn: "Could not publish.",
          })
        );
      }
      return;
    }
    setLatestRevisionId(json.revisionId ?? null);
    setLatestRevisionNumber(json.revisionNumber ?? null);
  };

  const onSetLive = async () => {
    if (!latestRevisionId) {
      setPublishError(
        safeT("admin_opening_live_need_publish", {
          fallbackKo: "먼저 게시한 뒤에 앱에 적용하세요.",
          fallbackEn: "Publish first, then set live.",
        })
      );
      return;
    }
    setSettingLive(true);
    setPublishError(null);
    const res = await fetch(`/api/admin/opening-shows/${showId}/live`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: latestRevisionId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    setSettingLive(false);
    if (!res.ok || json.ok !== true) {
      setPublishError(
        safeT("admin_opening_live_error", {
          fallbackKo: "앱에 적용하지 못했습니다.",
          fallbackEn: "Could not apply to the app.",
        })
      );
      return;
    }
    setIsLive(true);
    setLiveRevisionNumber(latestRevisionNumber);
  };

  if (loading) {
    return (
      <p className="p-6 text-sm text-sam-muted">
        {safeT("admin_opening_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }
  if (loadError) {
    return <p className="p-6 text-sm text-red-700">{loadError}</p>;
  }

  const scene = openingPrimaryScene(document);

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[40rem] flex-col bg-sam-app" data-opening-studio="1">
      <header className="flex items-center gap-3 border-b border-sam-border bg-sam-surface px-3 py-2">
        <AdminActionButton variant="quiet" onClick={() => router.push("/admin/intro")}>
          ← {safeT("admin_opening_back", { fallbackKo: "인트로", fallbackEn: "Intro" })}
        </AdminActionButton>
        <input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setSaveError(null);
          }}
          className="min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-sm text-sam-fg"
          aria-label={safeT("admin_opening_title_label", { fallbackKo: "이름", fallbackEn: "Name" })}
        />
        <p className="hidden min-w-0 max-w-[18rem] truncate text-xs text-sam-muted sm:block">
          {dirty
            ? safeT("admin_opening_unsaved", { fallbackKo: "저장되지 않음", fallbackEn: "Unsaved" })
            : latestRevisionNumber
              ? `${safeT("admin_opening_saved", { fallbackKo: "저장됨", fallbackEn: "Saved" })} · ${safeT(
                  "admin_opening_published",
                  { fallbackKo: "게시됨", fallbackEn: "Published" }
                )} v${latestRevisionNumber}${
                  isLive && liveRevisionNumber
                    ? ` · ${safeT("admin_opening_live_now", {
                        fallbackKo: "현재 앱 적용 중",
                        fallbackEn: "Live on the app",
                      })} v${liveRevisionNumber}`
                    : ` · ${safeT("admin_opening_not_live", {
                        fallbackKo: "앱에 아직 적용되지 않음",
                        fallbackEn: "Not live on the app yet",
                      })}`
                }`
              : `${safeT("admin_opening_draft", { fallbackKo: "초안", fallbackEn: "Draft" })} · ${safeT(
                  "admin_opening_saved",
                  { fallbackKo: "저장됨", fallbackEn: "Saved" }
                )}`}
        </p>
        <AdminActionButton variant="secondary" onClick={() => setPreviewing(true)}>
          {safeT("admin_opening_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
        </AdminActionButton>
        <AdminActionButton variant="primary" disabled={saving || !dirty} onClick={() => void onSave()}>
          {saving
            ? safeT("admin_opening_saving", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
            : safeT("admin_opening_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled={publishing || dirty} onClick={() => void onPublish()}>
          {publishing
            ? safeT("admin_opening_publishing", { fallbackKo: "게시 중…", fallbackEn: "Publishing…" })
            : safeT("admin_opening_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          disabled={settingLive || dirty || !latestRevisionId || (isLive && liveRevisionNumber === latestRevisionNumber)}
          onClick={() => void onSetLive()}
        >
          {settingLive
            ? safeT("admin_opening_setting_live", { fallbackKo: "적용 중…", fallbackEn: "Applying…" })
            : safeT("admin_opening_set_live", { fallbackKo: "Live 적용", fallbackEn: "Set live" })}
        </AdminActionButton>
      </header>
      {saveError ? <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{saveError}</p> : null}
      {publishError ? <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{publishError}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <aside className="border-b border-sam-border bg-sam-surface p-3 md:border-b-0 md:border-r">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_opening_scene", { fallbackKo: "장면", fallbackEn: "Scene" })}
          </p>
          <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sm font-medium text-sam-fg">
            {safeT("admin_opening_scene_one", { fallbackKo: "Scene 1", fallbackEn: "Scene 1" })}
          </div>
          <ul className="mt-3 space-y-1">
            {scene.layers
              .slice()
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((layer) => {
                const item = mediaById.get(layer.mediaId);
                return (
                  <li key={layer.id}>
                    <button
                      type="button"
                      className={`w-full truncate rounded-ui-rect px-2 py-1 text-left text-xs ${
                        selectedLayerId === layer.id ? "bg-sam-surface-muted font-semibold" : "text-sam-muted"
                      }`}
                      onClick={() => setSelectedLayerId(layer.id)}
                    >
                      {item?.fileName || safeT("admin_opening_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
                    </button>
                  </li>
                );
              })}
          </ul>
        </aside>

        <div className="min-h-[24rem] bg-sam-app p-3" ref={setStageHost}>
          <OpeningLiveStage
            document={document}
            mediaById={mediaById}
            selectedLayerId={selectedLayerId}
            onSelect={setSelectedLayerId}
            onDocumentChange={markDocument}
          />
        </div>

        <aside className="border-t border-sam-border bg-sam-surface p-3 md:border-l md:border-t-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("admin_opening_properties", { fallbackKo: "속성", fallbackEn: "Properties" })}
          </p>
          {selected ? (
            <OpeningImageProperties
              layer={selected}
              fileName={mediaById.get(selected.mediaId)?.fileName ?? ""}
              onFit={(fit: OpeningImageFit) => {
                const layerId = selected.id;
                setDocument((current) => setLayerFit(current, layerId, fit));
                setSaveError(null);
              }}
              onVisible={(visible) => {
                const layerId = selected.id;
                setDocument((current) => setLayerVisible(current, layerId, visible));
                setSaveError(null);
              }}
              onForward={() => {
                const layerId = selected.id;
                setDocument((current) => moveLayerZ(current, layerId, "forward"));
                setSaveError(null);
              }}
              onBackward={() => {
                const layerId = selected.id;
                setDocument((current) => moveLayerZ(current, layerId, "backward"));
                setSaveError(null);
              }}
              onReplace={() => {
                setUploadError(null);
                setPicker({ kind: "replace", layerId: selected.id });
              }}
              onDelete={() => {
                const layerId = selected.id;
                setDocument((current) => removeLayer(current, layerId));
                setSelectedLayerId(null);
                setSaveError(null);
              }}
            />
          ) : (
            <p className="text-sm text-sam-muted">
              {safeT("admin_opening_properties_empty", {
                fallbackKo: "이미지를 선택하면 속성이 나타납니다.",
                fallbackEn: "Select an image to edit its properties.",
              })}
            </p>
          )}
        </aside>
      </div>

      <div className="border-t border-sam-border bg-sam-surface px-3 py-2">
        <AdminActionButton
          variant="primary"
          onClick={() => {
            setUploadError(null);
            setPicker({ kind: "add" });
          }}
        >
          {safeT("admin_opening_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
        </AdminActionButton>
      </div>

      {picker ? (
        <OpeningMediaPicker
          media={media}
          busy={uploadBusy}
          error={uploadError}
          onClose={() => {
            if (!uploadBusy) setPicker(null);
          }}
          onUploadFile={(file) => void onUploadFile(file)}
          onPickReady={applyReadyMedia}
        />
      ) : null}

      {previewing ? (
        <OpeningPreviewTheater
          document={document}
          mediaById={mediaById}
          onExit={() => setPreviewing(false)}
        />
      ) : null}
    </div>
  );
}
