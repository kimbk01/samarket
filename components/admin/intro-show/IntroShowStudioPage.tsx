"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  cloneIntroShowDocument,
  endPointer,
  getWorkingDocument,
  isPointerTransactionActive,
  mountSceneRenderer,
  mutateWorkingDocument,
  replaceWorkingDocument,
  resetWorkingDocumentStore,
  startLayerDrag,
  startLayerResize,
  subscribeWorkingDocument,
  updatePointer,
  type IntroShowDocument,
  type IntroShowLayer,
  type IntroShowMediaFit,
  type ResizeCorner,
  type SceneRendererHandle,
} from "@/intro-engine";
import type { IntroShowMediaRecord } from "@/intro-engine/LayerRenderer";
import {
  INTRO_SHOW_IMAGE_DEFAULT_FRAME,
  INTRO_SHOW_LOGO_DEFAULT_FRAME,
} from "@/lib/intro-show/frames";

type SaveState = "DIRTY" | "SAVING" | "SAVED" | "ERROR";

type DraftPayload = {
  id: string;
  title: string;
  document: IntroShowDocument;
  isLive: boolean;
  publishedRevisionId: string | null;
  media?: Array<{ id: string; width: number | null; height: number | null; status: string }>;
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const CORNERS: ResizeCorner[] = ["nw", "ne", "sw", "se"];

function mediaUrl(showId: string, mediaId: string): string {
  return `/api/admin/intro-shows/${showId}/media/${mediaId}/file?variant=runtime`;
}

export function IntroShowStudioPage({ showId }: { showId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<SceneRendererHandle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("SAVED");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [docTick, setDocTick] = useState(0);
  const [media, setMedia] = useState<Record<string, IntroShowMediaRecord>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [publishedRevisionId, setPublishedRevisionId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const working = getWorkingDocument();

  useEffect(() => {
    resetWorkingDocumentStore();
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/intro-shows/${showId}`, { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<DraftPayload>;
      if (cancelled || !res.ok || !json.ok || !json.document) return;
      replaceWorkingDocument(json.document);
      setTitle(json.title ?? "");
      setPublishedRevisionId(json.publishedRevisionId ?? null);
      setIsLive(Boolean(json.isLive));
      setSaveState("SAVED");
      const nextMedia: Record<string, IntroShowMediaRecord> = {};
      const meta = new Map((json.media ?? []).map((row) => [row.id, row]));
      for (const layer of json.document.scene.layers) {
        const row = meta.get(layer.mediaId);
        nextMedia[layer.mediaId] = {
          mediaId: layer.mediaId,
          url: mediaUrl(showId, layer.mediaId),
          width: row?.width && row.width > 0 ? row.width : 1,
          height: row?.height && row.height > 0 ? row.height : 1,
        };
        const img = new Image();
        img.onload = () => {
          setMedia((prev) => ({
            ...prev,
            [layer.mediaId]: {
              mediaId: layer.mediaId,
              url: mediaUrl(showId, layer.mediaId),
              width: img.naturalWidth,
              height: img.naturalHeight,
            },
          }));
        };
        img.src = mediaUrl(showId, layer.mediaId);
      }
      setMedia(nextMedia);
    })();
    return () => {
      cancelled = true;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      resetWorkingDocumentStore();
    };
  }, [showId]);

  useEffect(() => {
    return subscribeWorkingDocument(() => setDocTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const host = stageRef.current;
    const document = getWorkingDocument();
    if (!host || !document) return;
    if (!rendererRef.current) {
      rendererRef.current = mountSceneRenderer(host, {
        document,
        media,
        mode: "authoring",
      });
      return;
    }
    rendererRef.current.update({ document, media });
  }, [docTick, media]);

  const markDirty = () => {
    if (saveState !== "SAVING") setSaveState("DIRTY");
  };

  const save = async () => {
    const document = getWorkingDocument();
    if (!document || saveState === "SAVING") return;
    setSaveState("SAVING");
    const res = await fetch(`/api/admin/intro-shows/${showId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, document }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; document?: IntroShowDocument };
    if (!res.ok || !json.ok || !json.document) {
      setSaveState("ERROR");
      return;
    }
    replaceWorkingDocument(json.document);
    setSaveState("SAVED");
  };

  const stageOrigin = () => {
    const el = stageRef.current;
    if (!el) return { left: 0, top: 0, width: 1, height: 1 };
    const rect = el.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  };

  const onPointerDownLayer = (layerId: string, clientX: number, clientY: number) => {
    const origin = stageOrigin();
    setSelectedId(layerId);
    startLayerDrag(layerId, clientX, clientY, { left: origin.left, top: origin.top }, origin);
  };

  const onPointerDownHandle = (layerId: string, corner: ResizeCorner) => {
    const origin = stageOrigin();
    setSelectedId(layerId);
    startLayerResize(layerId, corner, { left: origin.left, top: origin.top }, origin);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!isPointerTransactionActive()) return;
      const origin = stageOrigin();
      updatePointer(event.clientX, event.clientY, { left: origin.left, top: origin.top }, origin);
    };
    const onUp = () => {
      if (!isPointerTransactionActive()) return;
      endPointer();
      markDirty();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  const addLayer = (layer: IntroShowLayer, record: IntroShowMediaRecord) => {
    mutateWorkingDocument((doc) => ({
      ...doc,
      scene: { ...doc.scene, layers: [...doc.scene.layers, layer] },
    }));
    setMedia((prev) => ({ ...prev, [record.mediaId]: record }));
    setSelectedId(layer.id);
    markDirty();
  };

  const nextZ = () => {
    const doc = getWorkingDocument();
    if (!doc || doc.scene.layers.length === 0) return 1;
    return Math.max(...doc.scene.layers.map((layer) => layer.zIndex)) + 1;
  };

  const seedLogo = async () => {
    if (busy) return;
    setBusy("logo");
    const res = await fetch(`/api/admin/intro-shows/${showId}/media/seed-logo`, {
      method: "POST",
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      mediaId?: string;
      width?: number;
      height?: number;
    };
    setBusy(null);
    if (!res.ok || !json.ok || !json.mediaId) return;
    addLayer(
      {
        id: crypto.randomUUID(),
        type: "LOGO",
        frame: { ...INTRO_SHOW_LOGO_DEFAULT_FRAME },
        zIndex: nextZ(),
        visible: true,
        opacity: 1,
        mediaId: json.mediaId,
        fit: "contain",
      },
      {
        mediaId: json.mediaId,
        url: mediaUrl(showId, json.mediaId),
        width: json.width ?? 1,
        height: json.height ?? 1,
      },
    );
  };

  const pickImage = () => fileRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!ALLOWED_MIME.has(file.type)) return;
    setBusy("image");
    const signRes = await fetch(`/api/admin/intro-shows/${showId}/media/sign`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "IMAGE", mimeType: file.type }),
    });
    const signed = (await signRes.json().catch(() => ({}))) as {
      ok?: boolean;
      mediaId?: string;
      signedUrl?: string;
    };
    if (!signRes.ok || !signed.ok || !signed.mediaId || !signed.signedUrl) {
      setBusy(null);
      return;
    }
    const put = await fetch(signed.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!put.ok) {
      setBusy(null);
      return;
    }
    const processRes = await fetch(`/api/admin/intro-shows/${showId}/media/${signed.mediaId}`, {
      method: "POST",
      credentials: "same-origin",
    });
    const processed = (await processRes.json().catch(() => ({}))) as {
      ok?: boolean;
      mediaId?: string;
      width?: number;
      height?: number;
    };
    setBusy(null);
    if (!processRes.ok || !processed.ok || !processed.mediaId) return;
    addLayer(
      {
        id: crypto.randomUUID(),
        type: "IMAGE",
        frame: { ...INTRO_SHOW_IMAGE_DEFAULT_FRAME },
        zIndex: nextZ(),
        visible: true,
        opacity: 1,
        mediaId: processed.mediaId,
        fit: "contain",
      },
      {
        mediaId: processed.mediaId,
        url: mediaUrl(showId, processed.mediaId),
        width: processed.width ?? 1,
        height: processed.height ?? 1,
      },
    );
  };

  const selected = working?.scene.layers.find((layer) => layer.id === selectedId) ?? null;

  const setFit = (fit: IntroShowMediaFit) => {
    if (!selected) return;
    mutateWorkingDocument((doc) => ({
      ...doc,
      scene: {
        ...doc.scene,
        layers: doc.scene.layers.map((layer) => (layer.id === selected.id ? { ...layer, fit } : layer)),
      },
    }));
    markDirty();
  };

  const shiftZ = (delta: number) => {
    if (!selected) return;
    mutateWorkingDocument((doc) => ({
      ...doc,
      scene: {
        ...doc.scene,
        layers: doc.scene.layers.map((layer) =>
          layer.id === selected.id ? { ...layer, zIndex: layer.zIndex + delta } : layer,
        ),
      },
    }));
    markDirty();
  };

  const publish = async () => {
    const document = getWorkingDocument();
    if (!document || busy) return;
    setBusy("publish");
    const res = await fetch(`/api/admin/intro-shows/${showId}/publish`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; revisionId?: string };
    setBusy(null);
    if (!res.ok || !json.ok || !json.revisionId) return;
    setPublishedRevisionId(json.revisionId);
  };

  const setLive = async () => {
    if (!publishedRevisionId || busy) return;
    setBusy("live");
    const res = await fetch(`/api/admin/intro-shows/${showId}/set-live`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: publishedRevisionId }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    setBusy(null);
    if (!res.ok || !json.ok) return;
    setIsLive(true);
  };

  const saveLabel =
    saveState === "SAVING"
      ? t("admin_intro_show_saving")
      : saveState === "SAVED"
        ? t("admin_intro_show_saved")
        : saveState === "ERROR"
          ? t("admin_intro_show_save_error")
          : t("admin_intro_show_dirty");

  const previewDoc = useMemo(() => (working ? cloneIntroShowDocument(working) : null), [working, docTick]);

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100dvh-4.5rem)] min-h-[36rem] flex-col bg-sam-app text-sam-fg">
      <header className="flex flex-wrap items-center gap-2 border-b border-sam-border px-3 py-2">
        <AdminActionButton variant="ghost" onClick={() => router.push("/admin/intro")}>
          {t("admin_intro_show_back")}
        </AdminActionButton>
        <input
          className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sm"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            markDirty();
          }}
          aria-label={t("admin_intro_show_name")}
        />
        <span className="text-xs text-sam-muted">{saveLabel}</span>
        <AdminActionButton variant="secondary" onClick={() => void save()} disabled={saveState === "SAVING"}>
          {t("admin_intro_show_save")}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => setPreviewOpen(true)}>
          {t("admin_intro_show_preview")}
        </AdminActionButton>
        <AdminActionButton variant="secondary" onClick={() => void publish()} disabled={busy === "publish"}>
          {busy === "publish" ? t("admin_intro_show_publishing") : t("admin_intro_show_publish")}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          onClick={() => void setLive()}
          disabled={!publishedRevisionId || busy === "live" || isLive}
        >
          {busy === "live" ? t("admin_intro_show_setting_live") : t("admin_intro_show_set_live")}
        </AdminActionButton>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-36 shrink-0 border-r border-sam-border p-3 text-sm">
          {t("admin_intro_show_scene_one")}
        </aside>
        <div className="relative min-w-0 flex-1 bg-[#0B421A]">
          <div ref={stageRef} className="absolute inset-0" />
          {working?.scene.layers.map((layer) => (
            <StageChrome
              key={layer.id}
              layer={layer}
              selected={layer.id === selectedId}
              onPointerDown={(x, y) => onPointerDownLayer(layer.id, x, y)}
              onHandle={(corner) => onPointerDownHandle(layer.id, corner)}
            />
          ))}
        </div>
        <aside className="w-56 shrink-0 border-l border-sam-border p-3 text-sm">
          <p className="mb-2 font-semibold">{t("admin_intro_show_properties")}</p>
          {!selected ? (
            <p className="text-sam-muted">{t("admin_intro_show_no_selection")}</p>
          ) : (
            <div className="space-y-2">
              <p>
                {selected.type === "LOGO" ? t("admin_intro_show_layer_logo") : t("admin_intro_show_layer_image")}
              </p>
              <div className="flex gap-2">
                <AdminActionButton
                  variant={selected.fit === "contain" ? "primary" : "neutral"}
                  onClick={() => setFit("contain")}
                >
                  {t("admin_intro_show_fit_contain")}
                </AdminActionButton>
                <AdminActionButton
                  variant={selected.fit === "cover" ? "primary" : "neutral"}
                  onClick={() => setFit("cover")}
                >
                  {t("admin_intro_show_fit_cover")}
                </AdminActionButton>
              </div>
              <div className="flex gap-2">
                <AdminActionButton variant="neutral" onClick={() => shiftZ(1)}>
                  {t("admin_intro_show_bring_forward")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" onClick={() => shiftZ(-1)}>
                  {t("admin_intro_show_send_back")}
                </AdminActionButton>
              </div>
            </div>
          )}
          {busy === "image" || busy === "logo" ? (
            <p className="mt-3 text-sam-muted">{t("admin_intro_show_media_processing")}</p>
          ) : null}
        </aside>
      </div>

      <footer className="flex gap-2 border-t border-sam-border px-3 py-2">
        <AdminActionButton variant="secondary" onClick={pickImage} disabled={Boolean(busy)}>
          {t("admin_intro_show_add_image")}
        </AdminActionButton>
        <AdminActionButton variant="secondary" onClick={() => void seedLogo()} disabled={Boolean(busy)}>
          {t("admin_intro_show_add_logo")}
        </AdminActionButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onFile(file);
          }}
        />
      </footer>

      {previewOpen && previewDoc ? (
        <IntroPreviewOverlay
          document={previewDoc}
          media={media}
          onClose={() => setPreviewOpen(false)}
          closeLabel={t("admin_intro_show_close_preview")}
        />
      ) : null}
    </div>
  );
}

function StageChrome({
  layer,
  selected,
  onPointerDown,
  onHandle,
}: {
  layer: IntroShowLayer;
  selected: boolean;
  onPointerDown: (x: number, y: number) => void;
  onHandle: (corner: ResizeCorner) => void;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${layer.frame.x * 100}%`,
        top: `${layer.frame.y * 100}%`,
        width: `${layer.frame.width * 100}%`,
        height: `${layer.frame.height * 100}%`,
        zIndex: layer.zIndex + 1000,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        onPointerDown(event.clientX, event.clientY);
      }}
    >
      {selected ? (
        <>
          <div className="pointer-events-none absolute inset-0 ring-2 ring-white/80" />
          {CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              aria-label={corner}
              className="absolute h-3 w-3 rounded-sm bg-white"
              style={{
                left: corner.includes("w") ? "-6px" : "auto",
                right: corner.includes("e") ? "-6px" : "auto",
                top: corner.includes("n") ? "-6px" : "auto",
                bottom: corner.includes("s") ? "-6px" : "auto",
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onHandle(corner);
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function IntroPreviewOverlay({
  document,
  media,
  onClose,
  closeLabel,
}: {
  document: IntroShowDocument;
  media: Record<string, IntroShowMediaRecord>;
  onClose: () => void;
  closeLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = mountSceneRenderer(host, { document, media, mode: "preview" });
    return () => renderer.destroy();
  }, [document, media]);
  return (
    <div className="fixed inset-0 z-[80] bg-[#0B421A]">
      <div ref={hostRef} className="absolute inset-0" />
      <button
        type="button"
        className="absolute right-4 top-4 z-[81] rounded-ui-rect bg-white/90 px-3 py-1 text-sm"
        onClick={onClose}
      >
        {closeLabel}
      </button>
    </div>
  );
}
