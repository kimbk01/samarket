"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { IntroMediaPicker } from "@/components/admin/intro/media/IntroMediaPicker";
import type { IntroMediaPickerResult } from "@/components/admin/intro/media/types";
import type {
  FrameV1,
  IntroDocumentV1,
  LayerV1,
  PretendardWeightV1,
  SceneV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import { PRETENDARD_WEIGHT_TO_ASSET } from "@/lib/intro/contracts/document";
import {
  fitContentRegion,
  mapFrameToDevice,
} from "@/lib/intro/geometry/responsive-mapping";
import { computeIntroDurationMs } from "@/lib/intro/timeline/compute-duration";
import {
  addLayer,
  addScene,
  clampNormalizedFrame,
  clearTabletOverride,
  deleteLayer,
  deleteScene,
  moveLayerZ,
  reorderScenes,
  setDocumentTitle,
  setLayerFrame,
  setLayerMediaRef,
  setLayerVisibility,
  setSceneBackground,
  setSceneDuration,
  setSceneTransition,
  updateLayer,
} from "@/lib/intro/document/mutations";
import {
  getIntroDocumentApi,
  saveIntroDocumentApi,
} from "./introDocumentApi";

type DevicePreview = "PHONE" | "TABLET";
type SaveUi =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

type PickerState =
  | null
  | {
      mode: "add";
      type: "IMAGE" | "LOGO";
      sceneId: string;
    }
  | {
      mode: "replace";
      type: "IMAGE" | "LOGO";
      sceneId: string;
      layerId: string;
      previousMediaRefId: string;
    };

function colorCss(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && "r" in (c as object)) {
    const o = c as { r: number; g: number; b: number; a: number };
    return `rgba(${Math.round(o.r * 255)},${Math.round(o.g * 255)},${Math.round(o.b * 255)},${o.a})`;
  }
  return "#000";
}

function sceneBgCss(scene: SceneV1): string {
  return colorCss(scene.background.color);
}

export function IntroStudio({
  documentId,
  ko,
}: {
  documentId: string;
  ko: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [document, setDocument] = useState<IntroDocumentV1 | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [devicePreview, setDevicePreview] = useState<DevicePreview>("PHONE");
  const [tabletEdit, setTabletEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveUi, setSaveUi] = useState<SaveUi>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [confirmDeleteScene, setConfirmDeleteScene] = useState<string | null>(
    null,
  );

  const applyLocal = useCallback((next: IntroDocumentV1) => {
    setDocument(next);
    setDirty(true);
    setSaveUi("dirty");
    setSaveMessage(null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await getIntroDocumentApi(documentId);
    if (!res.ok || !res.record) {
      setLoadError(res.error ?? "load_failed");
      setDocument(null);
      setLoading(false);
      return;
    }
    setDocument(res.record.document);
    setDraftVersion(res.record.draftVersion);
    setSelectedSceneId(res.record.document.scenes[0]?.sceneId ?? null);
    setSelectedLayerId(null);
    setDirty(false);
    setSaveUi("idle");
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const selectedScene = useMemo(() => {
    if (!document || !selectedSceneId) return null;
    return document.scenes.find((s) => s.sceneId === selectedSceneId) ?? null;
  }, [document, selectedSceneId]);

  const selectedLayer = useMemo(() => {
    if (!selectedScene || !selectedLayerId) return null;
    return (
      selectedScene.layers.find((l) => l.layerId === selectedLayerId) ?? null
    );
  }, [selectedScene, selectedLayerId]);

  const totalMs = useMemo(
    () => (document ? computeIntroDurationMs(document) : 0),
    [document],
  );

  const onSave = async () => {
    if (!document || saveUi === "saving") return;
    setSaveUi("saving");
    setSaveMessage(ko ? "저장 중…" : "Saving…");
    const res = await saveIntroDocumentApi({
      documentId,
      expectedDraftVersion: draftVersion,
      document,
    });
    if (res.status === 409) {
      setSaveUi("conflict");
      setSaveMessage(
        ko
          ? "다른 편집본과 충돌했습니다. 다시 불러온 뒤 편집하세요."
          : "Version conflict. Reload and re-apply edits.",
      );
      return;
    }
    if (!res.ok || !res.record) {
      setSaveUi("error");
      setSaveMessage(
        ko
          ? `저장 실패: ${res.error ?? "error"}`
          : `Save failed: ${res.error ?? "error"}`,
      );
      return;
    }
    setDocument(res.record.document);
    setDraftVersion(res.record.draftVersion);
    setDirty(false);
    setSaveUi("saved");
    setSaveMessage(ko ? "저장됨" : "Saved");
  };

  const openAddMediaLayer = (type: "IMAGE" | "LOGO") => {
    if (!selectedSceneId) return;
    setPicker({ mode: "add", type, sceneId: selectedSceneId });
  };

  const openReplaceMedia = () => {
    if (!selectedScene || !selectedLayer) return;
    if (selectedLayer.type !== "IMAGE" && selectedLayer.type !== "LOGO") return;
    setPicker({
      mode: "replace",
      type: selectedLayer.type,
      sceneId: selectedScene.sceneId,
      layerId: selectedLayer.layerId,
      previousMediaRefId: selectedLayer.mediaRefId,
    });
  };

  const onPickerConfirm = (result: IntroMediaPickerResult) => {
    if (!document || !picker) return;
    if (picker.mode === "add") {
      const { document: next, layerId } = addLayer(
        document,
        picker.sceneId,
        picker.type,
        { mediaRefId: result.mediaRefId },
      );
      applyLocal(next);
      setSelectedLayerId(layerId);
    } else {
      applyLocal(
        setLayerMediaRef(
          document,
          picker.sceneId,
          picker.layerId,
          result.mediaRefId,
        ),
      );
    }
    setPicker(null);
  };

  const onPickerCancel = () => {
    // Cancel: no ghost layer; replace keeps previous mediaRefId (never touched).
    setPicker(null);
  };

  if (loading) {
    return (
      <p className="p-6 text-sm text-sam-muted" data-intro-studio-loading="1">
        {ko ? "스튜디오 불러오는 중…" : "Loading Studio…"}
      </p>
    );
  }

  if (loadError || !document) {
    return (
      <div className="space-y-3 p-6" data-intro-studio-error="1">
        <p className="text-sm text-red-600">{loadError ?? "not_found"}</p>
        <Link href="/admin/intro" className="text-sm underline">
          {ko ? "목록으로" : "Back to list"}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col"
      data-intro-studio="1"
      data-document-id={documentId}
      data-draft-version={draftVersion}
      data-dirty={dirty ? "1" : "0"}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-sam-border bg-sam-surface px-4 py-3">
        <Link
          href="/admin/intro"
          className="text-xs text-sam-muted hover:text-sam-fg"
        >
          ← {ko ? "인트로 목록" : "Intro list"}
        </Link>
        <input
          className="min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-bg px-2 py-1.5 text-sm font-semibold text-sam-fg"
          value={document.title}
          onChange={(e) => applyLocal(setDocumentTitle(document, e.target.value))}
          data-intro-studio-title="1"
        />
        <span className="text-xs text-sam-muted">
          {ko ? "총" : "Total"} {totalMs}ms · v{draftVersion}
        </span>
        <AdminActionButton
          variant="primary"
          disabled={!dirty || saveUi === "saving"}
          onClick={() => void onSave()}
          data-intro-save="1"
        >
          {saveUi === "saving"
            ? ko
              ? "저장 중…"
              : "Saving…"
            : ko
              ? "저장"
              : "Save"}
        </AdminActionButton>
        <span
          className="text-xs text-sam-muted"
          data-intro-save-state={saveUi}
        >
          {saveMessage ??
            (dirty
              ? ko
                ? "저장되지 않음"
                : "Unsaved"
              : ko
                ? "저장됨"
                : "Saved")}
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_280px]">
        {/* Scene rail */}
        <aside
          className="border-b border-sam-border p-3 lg:border-b-0 lg:border-r"
          data-intro-scene-rail="1"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
              {ko ? "장면" : "Scenes"}
            </h2>
            <AdminActionButton
              variant="secondary"
              className="!min-h-7 !px-2 !text-xs"
              onClick={() => {
                const { document: next, sceneId } = addScene(document);
                applyLocal(next);
                setSelectedSceneId(sceneId);
                setSelectedLayerId(null);
              }}
              data-intro-add-scene="1"
            >
              +
            </AdminActionButton>
          </div>
          <ul className="space-y-1">
            {document.scenes.map((scene, idx) => (
              <li key={scene.sceneId}>
                <button
                  type="button"
                  className={`w-full rounded-ui-rect border px-2 py-2 text-left text-xs ${
                    scene.sceneId === selectedSceneId
                      ? "border-sam-fg bg-sam-bg"
                      : "border-transparent hover:bg-sam-bg"
                  }`}
                  onClick={() => {
                    setSelectedSceneId(scene.sceneId);
                    setSelectedLayerId(null);
                  }}
                  data-intro-scene={scene.sceneId}
                >
                  <span className="font-medium text-sam-fg">
                    {idx + 1}. {scene.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-sam-muted">
                    {scene.durationMs}ms
                    {scene.transitionAfter
                      ? ` · ${scene.transitionAfter.type}`
                      : ""}
                  </span>
                </button>
                <div className="mt-0.5 flex gap-1 px-1">
                  <button
                    type="button"
                    className="text-[10px] text-sam-muted hover:text-sam-fg"
                    disabled={idx === 0}
                    onClick={() => {
                      const ids = document.scenes.map((s) => s.sceneId);
                      const t = ids[idx]!;
                      ids[idx] = ids[idx - 1]!;
                      ids[idx - 1] = t;
                      applyLocal(reorderScenes(document, ids));
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-sam-muted hover:text-sam-fg"
                    disabled={idx >= document.scenes.length - 1}
                    onClick={() => {
                      const ids = document.scenes.map((s) => s.sceneId);
                      const t = ids[idx]!;
                      ids[idx] = ids[idx + 1]!;
                      ids[idx + 1] = t;
                      applyLocal(reorderScenes(document, ids));
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-[10px] text-red-600"
                    onClick={() => setConfirmDeleteScene(scene.sceneId)}
                    data-intro-delete-scene={scene.sceneId}
                  >
                    {ko ? "삭제" : "Del"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {document.scenes.length === 0 ? (
            <p className="mt-3 text-xs text-sam-muted">
              {ko ? "장면을 추가하세요." : "Add a scene to begin."}
            </p>
          ) : null}
        </aside>

        {/* Canvas */}
        <main className="flex flex-col gap-3 p-4" data-intro-canvas-panel="1">
          <div className="flex flex-wrap items-center gap-2">
            <AdminActionButton
              variant={devicePreview === "PHONE" ? "primary" : "secondary"}
              className="!min-h-8 !text-xs"
              onClick={() => {
                setDevicePreview("PHONE");
                setTabletEdit(false);
              }}
              data-intro-preview-phone="1"
            >
              Phone 9:16
            </AdminActionButton>
            <AdminActionButton
              variant={devicePreview === "TABLET" ? "primary" : "secondary"}
              className="!min-h-8 !text-xs"
              onClick={() => setDevicePreview("TABLET")}
              data-intro-preview-tablet="1"
            >
              Tablet 16:10
            </AdminActionButton>
            {devicePreview === "TABLET" ? (
              <AdminActionButton
                variant={tabletEdit ? "primary" : "secondary"}
                className="!min-h-8 !text-xs"
                onClick={() => setTabletEdit((v) => !v)}
                data-intro-tablet-adjust="1"
              >
                {ko ? "태블릿 위치 조정" : "Tablet position adjust"}
              </AdminActionButton>
            ) : null}
            <span className="text-[10px] text-sam-muted">
              {ko
                ? "작성용 캔버스 (런타임 Preview 아님)"
                : "Authoring canvas (not runtime Preview)"}
            </span>
          </div>

          {selectedScene ? (
            <StudioCanvas
              scene={selectedScene}
              devicePreview={devicePreview}
              tabletEdit={tabletEdit}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onFrameChange={(layerId, frame) => {
                applyLocal(
                  setLayerFrame(document, selectedScene.sceneId, layerId, frame, {
                    tabletLandscape: tabletEdit && devicePreview === "TABLET",
                  }),
                );
              }}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-sm text-sam-muted">
              {ko ? "장면을 선택하세요" : "Select a scene"}
            </div>
          )}

          {selectedScene ? (
            <div className="flex flex-wrap gap-2" data-intro-layer-add="1">
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => openAddMediaLayer("IMAGE")}
                data-intro-add-image="1"
              >
                + IMAGE
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => openAddMediaLayer("LOGO")}
                data-intro-add-logo="1"
              >
                + LOGO
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => {
                  const { document: next, layerId } = addLayer(
                    document,
                    selectedScene.sceneId,
                    "TEXT",
                  );
                  applyLocal(next);
                  setSelectedLayerId(layerId);
                }}
                data-intro-add-text="1"
              >
                + TEXT
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                className="!text-xs"
                onClick={() => {
                  const { document: next, layerId } = addLayer(
                    document,
                    selectedScene.sceneId,
                    "CTA",
                  );
                  applyLocal(next);
                  setSelectedLayerId(layerId);
                }}
                data-intro-add-cta="1"
              >
                + CTA
              </AdminActionButton>
            </div>
          ) : null}
        </main>

        {/* Inspector */}
        <aside
          className="space-y-4 border-t border-sam-border p-3 lg:border-l lg:border-t-0"
          data-intro-inspector="1"
        >
          {selectedScene ? (
            <SceneInspector
              ko={ko}
              scene={selectedScene}
              isLast={
                document.scenes[document.scenes.length - 1]?.sceneId ===
                selectedScene.sceneId
              }
              onDuration={(ms) =>
                applyLocal(
                  setSceneDuration(document, selectedScene.sceneId, ms),
                )
              }
              onTransition={(t) =>
                applyLocal(
                  setSceneTransition(document, selectedScene.sceneId, t),
                )
              }
              onBackground={(color) =>
                applyLocal(
                  setSceneBackground(document, selectedScene.sceneId, {
                    type: "SOLID",
                    color,
                  }),
                )
              }
            />
          ) : null}

          {selectedScene && selectedLayer ? (
            <LayerInspector
              ko={ko}
              layer={selectedLayer}
              tabletEdit={tabletEdit && devicePreview === "TABLET"}
              onUpdate={(patch) =>
                applyLocal(
                  updateLayer(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    patch,
                  ),
                )
              }
              onVisibility={(v) =>
                applyLocal(
                  setLayerVisibility(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    v,
                  ),
                )
              }
              onZ={(dir) =>
                applyLocal(
                  moveLayerZ(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                    dir,
                  ),
                )
              }
              onDelete={() => {
                applyLocal(
                  deleteLayer(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                  ),
                );
                setSelectedLayerId(null);
              }}
              onReplaceMedia={openReplaceMedia}
              onClearTablet={() =>
                applyLocal(
                  clearTabletOverride(
                    document,
                    selectedScene.sceneId,
                    selectedLayer.layerId,
                  ),
                )
              }
            />
          ) : (
            <p className="text-xs text-sam-muted">
              {ko ? "레이어를 선택하세요." : "Select a layer."}
            </p>
          )}

          <p className="text-[10px] text-sam-muted">
            {ko
              ? "Preview / Publish / Live는 CUT A에서 구현하지 않습니다."
              : "Preview / Publish / Live are not in CUT A."}
          </p>
        </aside>
      </div>

      <IntroMediaPicker
        ko={ko}
        open={picker != null}
        context={picker?.type ?? "ANY"}
        initialMediaRefId={
          picker?.mode === "replace" ? picker.previousMediaRefId : null
        }
        onConfirm={onPickerConfirm}
        onCancel={onPickerCancel}
      />

      {confirmDeleteScene ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-sm text-sam-fg">
              {ko ? "이 장면을 삭제할까요?" : "Delete this scene?"}
            </p>
            <div className="mt-3 flex gap-2">
              <AdminActionButton
                variant="danger"
                onClick={() => {
                  applyLocal(deleteScene(document, confirmDeleteScene));
                  if (selectedSceneId === confirmDeleteScene) {
                    setSelectedSceneId(null);
                    setSelectedLayerId(null);
                  }
                  setConfirmDeleteScene(null);
                }}
              >
                {ko ? "삭제" : "Delete"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                onClick={() => setConfirmDeleteScene(null)}
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudioCanvas({
  scene,
  devicePreview,
  tabletEdit,
  selectedLayerId,
  onSelectLayer,
  onFrameChange,
}: {
  scene: SceneV1;
  devicePreview: DevicePreview;
  tabletEdit: boolean;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onFrameChange: (layerId: string, frame: FrameV1) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewport =
    devicePreview === "TABLET"
      ? { width: 640, height: 400 }
      : { width: 360, height: 640 };
  const aspect =
    devicePreview === "TABLET"
      ? { w: 16, h: 10 }
      : { w: 9, h: 16 };
  const region = fitContentRegion(viewport, aspect);

  const dragRef = useRef<{
    layerId: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origin: FrameV1;
  } | null>(null);

  const layersSorted = useMemo(
    () => [...scene.layers].sort((a, b) => a.zIndex - b.zIndex),
    [scene.layers],
  );

  const onPointerDown = (
    e: ReactPointerEvent,
    layer: LayerV1,
    mode: "move" | "resize",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectLayer(layer.layerId);
    const frame =
      tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE
        ? layer.layoutOverrides.TABLET_LANDSCAPE.frame
        : layer.frame;
    dragRef.current = {
      layerId: layer.layerId,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...frame },
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // LOCAL ONLY — no fetch / save / media / navigation.
    const dx = (e.clientX - drag.startX) / region.RW;
    const dy = (e.clientY - drag.startY) / region.RH;
    let next: FrameV1;
    if (drag.mode === "move") {
      next = clampNormalizedFrame({
        x: drag.origin.x + dx,
        y: drag.origin.y + dy,
        w: drag.origin.w,
        h: drag.origin.h,
      });
    } else {
      next = clampNormalizedFrame({
        x: drag.origin.x,
        y: drag.origin.y,
        w: drag.origin.w + dx,
        h: drag.origin.h + dy,
      });
    }
    onFrameChange(drag.layerId, next);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-neutral-900 shadow-inner"
      style={{ width: viewport.width, height: viewport.height }}
      data-intro-canvas="1"
      data-device={devicePreview}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => onSelectLayer(null)}
    >
      {/* FIT composition region */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: region.OX,
          top: region.OY,
          width: region.RW,
          height: region.RH,
          background: sceneBgCss(scene),
        }}
        data-intro-composition="1"
      >
        {/* Safe-area guide only — not SSOT */}
        <div
          className="pointer-events-none absolute inset-[6%] border border-dashed border-white/20"
          data-intro-safe-area-guide="1"
        />
        {layersSorted.map((layer) => {
          if (!layer.visible) return null;
          const frame =
            tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE
              ? layer.layoutOverrides.TABLET_LANDSCAPE.frame
              : layer.frame;
          const rect = mapFrameToDevice(frame, {
            ...region,
            OX: 0,
            OY: 0,
          });
          const selected = layer.layerId === selectedLayerId;
          return (
            <div
              key={layer.layerId}
              className={`absolute box-border cursor-move ${
                selected ? "ring-2 ring-sky-400" : "ring-1 ring-white/20"
              }`}
              style={{
                left: rect.vx,
                top: rect.vy,
                width: rect.vw,
                height: rect.vh,
                opacity: layer.opacity,
                zIndex: layer.zIndex,
              }}
              data-intro-layer={layer.layerId}
              data-layer-type={layer.type}
              onPointerDown={(e) => onPointerDown(e, layer, "move")}
            >
              <LayerPreview layer={layer} />
              {selected ? (
                <div
                  className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-sky-400"
                  data-intro-resize-handle={layer.layerId}
                  onPointerDown={(e) => onPointerDown(e, layer, "resize")}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LayerPreview({ layer }: { layer: LayerV1 }) {
  if (layer.type === "TEXT") {
    return (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden px-1 text-center"
        style={{
          color: colorCss(layer.color),
          fontSize: Math.max(10, layer.fontSize * 400),
          fontWeight:
            layer.font.weight === "BOLD"
              ? 700
              : layer.font.weight === "SEMIBOLD"
                ? 600
                : layer.font.weight === "MEDIUM"
                  ? 500
                  : 400,
        }}
      >
        {layer.content}
      </div>
    );
  }
  if (layer.type === "CTA") {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-xs font-semibold"
        style={{
          background: colorCss(layer.background.color),
          color: colorCss(layer.text.color),
          borderRadius: layer.background.cornerRadius * 200,
        }}
      >
        {layer.label}
      </div>
    );
  }
  // IMAGE / LOGO — mediaRefId only; signed preview is optional later.
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/10 text-[10px] text-white/80">
      {layer.type}
      {layer.mediaRefId ? "" : " (no media)"}
    </div>
  );
}

function SceneInspector({
  ko,
  scene,
  isLast,
  onDuration,
  onTransition,
  onBackground,
}: {
  ko: boolean;
  scene: SceneV1;
  isLast: boolean;
  onDuration: (ms: number) => void;
  onTransition: (t: TransitionV1 | null) => void;
  onBackground: (c: { r: number; g: number; b: number; a: number }) => void;
}) {
  const t = scene.transitionAfter;
  const bg =
    typeof scene.background.color === "string"
      ? "#000000"
      : `#${[scene.background.color.r, scene.background.color.g, scene.background.color.b]
          .map((n) =>
            Math.round(n * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;

  return (
    <section className="space-y-2" data-intro-scene-inspector="1">
      <h3 className="text-xs font-semibold uppercase text-sam-muted">
        {ko ? "장면 타이밍" : "Scene timing"}
      </h3>
      <label className="block text-[11px] text-sam-muted">
        {ko ? "지속 시간 (ms)" : "Duration (ms)"}
        <input
          type="number"
          className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
          value={scene.durationMs}
          min={100}
          max={60000}
          onChange={(e) => onDuration(Number(e.target.value))}
          data-intro-scene-duration="1"
        />
      </label>
      {!isLast ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "전환" : "Transition"}
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={t?.type ?? "FADE"}
              onChange={(e) => {
                const type = e.target.value as "CUT" | "FADE" | "SLIDE";
                if (type === "CUT") onTransition({ type: "CUT", durationMs: 0 });
                else if (type === "FADE")
                  onTransition({
                    type: "FADE",
                    durationMs: t && t.type !== "CUT" ? t.durationMs : 300,
                  });
                else
                  onTransition({
                    type: "SLIDE",
                    durationMs: t && t.type !== "CUT" ? t.durationMs : 300,
                    direction:
                      t && t.type === "SLIDE" ? t.direction : "LEFT",
                  });
              }}
              data-intro-transition-type="1"
            >
              <option value="CUT">CUT</option>
              <option value="FADE">FADE</option>
              <option value="SLIDE">SLIDE</option>
            </select>
          </label>
          {t && t.type !== "CUT" ? (
            <label className="block text-[11px] text-sam-muted">
              {ko ? "전환 시간 (ms)" : "Transition ms"}
              <input
                type="number"
                className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                value={t.durationMs}
                min={1}
                onChange={(e) => {
                  const durationMs = Math.max(1, Number(e.target.value) || 1);
                  if (t.type === "FADE")
                    onTransition({ type: "FADE", durationMs });
                  else if (t.type === "SLIDE")
                    onTransition({
                      type: "SLIDE",
                      durationMs,
                      direction: t.direction,
                    });
                }}
                data-intro-transition-duration="1"
              />
            </label>
          ) : null}
        </>
      ) : (
        <p className="text-[11px] text-sam-muted">
          {ko ? "마지막 장면 — 전환 없음" : "Last scene — no transition"}
        </p>
      )}
      <label className="block text-[11px] text-sam-muted">
        {ko ? "배경색" : "Background"}
        <input
          type="color"
          className="mt-1 block h-8 w-full"
          value={bg}
          onChange={(e) => {
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            onBackground({ r, g, b, a: 1 });
          }}
          data-intro-scene-bg="1"
        />
      </label>
    </section>
  );
}

function LayerInspector({
  ko,
  layer,
  tabletEdit,
  onUpdate,
  onVisibility,
  onZ,
  onDelete,
  onReplaceMedia,
  onClearTablet,
}: {
  ko: boolean;
  layer: LayerV1;
  tabletEdit: boolean;
  onUpdate: (patch: Omit<Partial<LayerV1>, "layerId" | "type">) => void;
  onVisibility: (v: boolean) => void;
  onZ: (dir: "forward" | "backward") => void;
  onDelete: () => void;
  onReplaceMedia: () => void;
  onClearTablet: () => void;
}) {
  return (
    <section className="space-y-2" data-intro-layer-inspector="1">
      <h3 className="text-xs font-semibold uppercase text-sam-muted">
        {layer.type}
      </h3>
      <div className="flex flex-wrap gap-1">
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onZ("backward")}
          data-intro-z-back="1"
        >
          {ko ? "뒤로" : "Back"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onZ("forward")}
          data-intro-z-forward="1"
        >
          {ko ? "앞으로" : "Forward"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="!min-h-7 !px-2 !text-xs"
          onClick={() => onVisibility(!layer.visible)}
          data-intro-visibility="1"
        >
          {layer.visible
            ? ko
              ? "숨기기"
              : "Hide"
            : ko
              ? "보이기"
              : "Show"}
        </AdminActionButton>
      </div>

      {(layer.type === "IMAGE" || layer.type === "LOGO") && (
        <div className="space-y-1">
          <p className="truncate text-[10px] text-sam-muted">
            mediaRefId: {layer.mediaRefId ? "set" : "(empty)"}
          </p>
          <AdminActionButton
            variant="secondary"
            className="!text-xs"
            onClick={onReplaceMedia}
            data-intro-replace-media="1"
          >
            {ko ? "미디어 교체" : "Replace media"}
          </AdminActionButton>
          {layer.type === "IMAGE" ? (
            <label className="block text-[11px] text-sam-muted">
              Surface
              <select
                className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
                value={layer.surface}
                onChange={(e) =>
                  onUpdate({
                    surface: e.target.value as "CONTENT" | "VIEWPORT",
                  } as Partial<LayerV1>)
                }
              >
                <option value="CONTENT">CONTENT</option>
                <option value="VIEWPORT">VIEWPORT</option>
              </select>
            </label>
          ) : null}
        </div>
      )}

      {layer.type === "TEXT" ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "텍스트" : "Text"}
            <textarea
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              rows={3}
              value={layer.content}
              onChange={(e) => onUpdate({ content: e.target.value } as Partial<LayerV1>)}
              data-intro-text-content="1"
            />
          </label>
          <label className="block text-[11px] text-sam-muted">
            Weight
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.font.weight}
              onChange={(e) => {
                const weight = e.target.value as PretendardWeightV1;
                onUpdate({
                  font: {
                    family: "Pretendard",
                    weight,
                    assetId: PRETENDARD_WEIGHT_TO_ASSET[weight],
                  },
                } as Partial<LayerV1>);
              }}
            >
              <option value="REGULAR">Regular</option>
              <option value="MEDIUM">Medium</option>
              <option value="SEMIBOLD">SemiBold</option>
              <option value="BOLD">Bold</option>
            </select>
          </label>
        </>
      ) : null}

      {layer.type === "CTA" ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            Label
            <input
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.label}
              onChange={(e) =>
                onUpdate({ label: e.target.value } as Partial<LayerV1>)
              }
              data-intro-cta-label="1"
            />
          </label>
          <label className="block text-[11px] text-sam-muted">
            Action
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={layer.action.type}
              onChange={(e) => {
                const type = e.target.value as
                  | "CONTINUE"
                  | "FINISH_INTRO"
                  | "APPROVED_INTERNAL_ROUTE";
                if (type === "APPROVED_INTERNAL_ROUTE") {
                  // Only expose when a validated routeId exists — block fake routes.
                  // CUT A: no approved route catalog wired → keep FINISH/CONTINUE only in UI choices that validate.
                  onUpdate({
                    action: { type: "FINISH_INTRO" },
                  } as Partial<LayerV1>);
                  return;
                }
                onUpdate({ action: { type } } as Partial<LayerV1>);
              }}
              data-intro-cta-action="1"
            >
              <option value="CONTINUE">CONTINUE</option>
              <option value="FINISH_INTRO">FINISH_INTRO</option>
            </select>
          </label>
        </>
      ) : null}

      {tabletEdit && layer.layoutOverrides?.TABLET_LANDSCAPE ? (
        <AdminActionButton
          variant="secondary"
          className="!text-xs"
          onClick={onClearTablet}
          data-intro-clear-tablet="1"
        >
          {ko ? "태블릿 오버라이드 제거" : "Remove tablet override"}
        </AdminActionButton>
      ) : null}

      <AdminActionButton
        variant="danger"
        className="!text-xs"
        onClick={onDelete}
        data-intro-delete-layer="1"
      >
        {ko ? "레이어 삭제" : "Delete layer"}
      </AdminActionButton>
      <p className="text-[10px] text-sam-muted">
        {ko
          ? "레이어 삭제는 미디어를 삭제하지 않습니다."
          : "Deleting a layer does not delete Media."}
      </p>
    </section>
  );
}
