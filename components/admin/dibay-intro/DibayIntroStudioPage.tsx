"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { DibayIntroStage } from "@/components/admin/dibay-intro/DibayIntroStage";
import { DibayIntroMediaLibrary } from "@/components/admin/dibay-intro/DibayIntroMediaLibrary";
import { attachIntroPlayer } from "@/lib/dibay-intro/engine/player";
import { resolveCtaRuntimeAction } from "@/lib/dibay-intro/engine/cta-action";
import { applyMediaAttach } from "@/lib/dibay-intro/media-layer-ops";
import {
  DIBAY_INTRO_CTA_ROUTE_OPTIONS,
} from "@/lib/dibay-intro/cta-routes";
import {
  documentsSemanticallyEqual,
  SCENE_DURATION_MS_MAX,
  SCENE_DURATION_MS_MIN,
  type CtaActionKind,
  type DibayIntroDocument,
  type DibayIntroLayer,
  type NormalizedFrame,
  type SceneTransition,
} from "@/lib/dibay-intro/document";
import {
  createCtaLayer,
  createTextLayer,
  nextLayerZ,
} from "@/lib/dibay-intro/default-layers";
import { DibayIntroWorkingDocument } from "@/lib/dibay-intro/working-document";
import type { DibayIntroRecord } from "@/lib/dibay-intro/admin-store";
import type { DibayIntroMediaRecord } from "@/lib/dibay-intro/media-store";
import { introOperatorLabelEn, introOperatorLabelKo } from "@/lib/dibay-intro/lifecycle";

type LoadPayload = { intro: DibayIntroRecord; media: DibayIntroMediaRecord[] };

export function DibayIntroStudioPage({ introId }: { introId: string }) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const searchParams = useSearchParams();
  const workingRef = useRef<DibayIntroWorkingDocument | null>(null);
  const savedRef = useRef<DibayIntroDocument | null>(null);
  const previewHostRef = useRef<HTMLDivElement>(null);
  const previewDocRef = useRef<DibayIntroDocument | null>(null);
  const [tick, setTick] = useState(0);
  const [title, setTitle] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [lifecycle, setLifecycle] = useState<DibayIntroRecord["lifecycle"]>("draft");
  const [isLive, setIsLive] = useState(false);
  const [media, setMedia] = useState<DibayIntroMediaRecord[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryIntent, setLibraryIntent] = useState<"IMAGE" | "LOGO" | "replace" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const bump = useCallback(() => {
    const snap = workingRef.current?.snapshot();
    if (snap && savedRef.current) {
      setDirty(!documentsSemanticallyEqual(snap, savedRef.current) || title !== savedTitle);
    }
    setTick((n) => n + 1);
  }, [title, savedTitle]);

  const applyLoad = useCallback((payload: LoadPayload) => {
    const working = new DibayIntroWorkingDocument(payload.intro.document);
    workingRef.current = working;
    savedRef.current = working.snapshot();
    setTitle(payload.intro.title);
    setSavedTitle(payload.intro.title);
    setLifecycle(payload.intro.lifecycle);
    setIsLive(payload.intro.isLive);
    setMedia(payload.media);
    setSceneId(working.scenes()[0]?.id ?? null);
    setLayerId(null);
    setDirty(false);
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/dibay-intros/${introId}`, { credentials: "same-origin", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<LoadPayload> & { ok?: boolean };
      if (cancelled) return;
      if (!res.ok || !json.ok || !json.intro) {
        setLoadError(
          safeT("admin_dibay_intro_not_found", { fallbackKo: "인트로를 찾을 수 없습니다.", fallbackEn: "Intro not found." }),
        );
        return;
      }
      applyLoad({ intro: json.intro, media: json.media ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLoad, introId, safeT]);

  useEffect(() => {
    if (searchParams.get("preview") === "1" && workingRef.current) {
      previewDocRef.current = workingRef.current.snapshot();
      setPreviewOpen(true);
    }
  }, [searchParams, tick]);

  const documentSnap = workingRef.current?.snapshot();
  const scenes = documentSnap?.scenes ?? [];
  const scene = scenes.find((s) => s.id === sceneId) ?? scenes[0] ?? null;
  const layer = scene?.layers.find((l) => l.id === layerId) ?? null;

  const mediaUrlById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of media) {
      if (item.status === "ready" && item.signedUrl) map[item.id] = item.signedUrl;
    }
    return map;
  }, [media]);
  const mediaSizeById = useMemo(() => {
    const map: Record<string, { width: number; height: number }> = {};
    for (const item of media) {
      if (item.width && item.height) map[item.id] = { width: item.width, height: item.height };
    }
    return map;
  }, [media]);

  useEffect(() => {
    if (!previewOpen || !previewHostRef.current || !previewDocRef.current) return;
    const player = attachIntroPlayer(previewHostRef.current, {
      document: previewDocRef.current,
      mediaUrlById,
      mediaSizeById,
      mode: "preview",
      interactive: true,
      onCta: (layer) => {
        const doc = previewDocRef.current;
        if (!doc) return;
        const action = resolveCtaRuntimeAction(layer, doc, player.getElapsedMs());
        if (action.kind === "CONTINUE") player.seek(action.seekMs);
        if (action.kind === "FINISH") player.pause();
      },
    });
    return () => player.destroy();
  }, [previewOpen, mediaUrlById, mediaSizeById]);

  function mutate(run: (working: DibayIntroWorkingDocument) => void) {
    const working = workingRef.current;
    if (!working) return;
    run(working);
    bump();
  }

  async function persist() {
    const working = workingRef.current;
    if (!working) return false;
    const ok = await dibayConfirm({
      title: safeT("admin_dibay_intro_save_confirm", {
        fallbackKo: "현재 인트로를 저장하시겠습니까?",
        fallbackEn: "Save this intro?",
      }),
      confirmLabel: safeT("admin_dibay_intro_confirm", { fallbackKo: "확인", fallbackEn: "OK" }),
      cancelLabel: safeT("admin_dibay_intro_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (!ok) return false;
    setSaving(true);
    const requestDoc = working.snapshot();
    const res = await fetch(`/api/admin/dibay-intros/${introId}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, document: requestDoc }),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<LoadPayload> & { ok?: boolean };
    setSaving(false);
    if (!res.ok || !json.ok || !json.intro) {
      setDirty(true);
      await dibayAlert({
        title: safeT("admin_dibay_intro_save_fail", {
          fallbackKo: "인트로 저장에 실패했습니다.",
          fallbackEn: "Could not save the intro.",
        }),
      });
      return false;
    }
    if (!documentsSemanticallyEqual(requestDoc, json.intro.document)) {
      setDirty(true);
      await dibayAlert({
        title: safeT("admin_dibay_intro_save_fail", {
          fallbackKo: "인트로 저장에 실패했습니다.",
          fallbackEn: "Could not save the intro.",
        }),
      });
      return false;
    }
    applyLoad({ intro: json.intro, media: json.media ?? media });
    await dibayAlert({
      title: safeT("admin_dibay_intro_save_ok", {
        fallbackKo: "인트로가 저장되었습니다.",
        fallbackEn: "Intro saved.",
      }),
    });
    return true;
  }

  async function publish() {
    const ok = await dibayConfirm({
      title: safeT("admin_dibay_intro_publish_confirm", {
        fallbackKo: "현재 인트로를 게시하시겠습니까?",
        fallbackEn: "Publish this intro?",
      }),
      confirmLabel: safeT("admin_dibay_intro_confirm", { fallbackKo: "확인", fallbackEn: "OK" }),
      cancelLabel: safeT("admin_dibay_intro_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/dibay-intros/${introId}/publish`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) {
      await dibayAlert({
        title: safeT("admin_dibay_intro_publish_fail", {
          fallbackKo: "인트로 게시에 실패했습니다.",
          fallbackEn: "Could not publish the intro.",
        }),
      });
      return;
    }
    await dibayAlert({
      title: safeT("admin_dibay_intro_publish_ok", {
        fallbackKo: "인트로가 게시되었습니다.",
        fallbackEn: "Intro published.",
      }),
    });
    const reload = await fetch(`/api/admin/dibay-intros/${introId}`, { credentials: "same-origin", cache: "no-store" });
    const json = (await reload.json().catch(() => ({}))) as Partial<LoadPayload> & { ok?: boolean };
    if (json.ok && json.intro) applyLoad({ intro: json.intro, media: json.media ?? media });
  }

  async function setLive() {
    const ok = await dibayConfirm({
      title: safeT("admin_dibay_intro_live_confirm", {
        fallbackKo: "이 인트로를 앱 시작 화면에 노출하시겠습니까?",
        fallbackEn: "Show this intro on the app start screen?",
      }),
      confirmLabel: safeT("admin_dibay_intro_confirm", { fallbackKo: "확인", fallbackEn: "OK" }),
      cancelLabel: safeT("admin_dibay_intro_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" }),
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/dibay-intros/${introId}/set-live`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) {
      await dibayAlert({
        title: safeT("admin_dibay_intro_live_fail", {
          fallbackKo: "앱 노출을 변경하지 못했습니다.",
          fallbackEn: "Could not change the live intro.",
        }),
      });
      return;
    }
    await dibayAlert({
      title: safeT("admin_dibay_intro_live_ok", {
        fallbackKo: "앱 노출 인트로가 변경되었습니다.",
        fallbackEn: "The live intro has been changed.",
      }),
    });
    const reload = await fetch(`/api/admin/dibay-intros/${introId}`, { credentials: "same-origin", cache: "no-store" });
    const json = (await reload.json().catch(() => ({}))) as Partial<LoadPayload> & { ok?: boolean };
    if (json.ok && json.intro) applyLoad({ intro: json.intro, media: json.media ?? media });
  }

  function openLibrary(intent: "IMAGE" | "LOGO" | "replace") {
    setLibraryIntent(intent);
    setLibraryOpen(true);
  }

  function onPicked(item: DibayIntroMediaRecord) {
    if (item.status !== "ready") return;
    const currentSceneId = scene?.id;
    if (!currentSceneId) return;
    mutate((working) => {
      if (libraryIntent === "IMAGE" || libraryIntent === "LOGO") {
        applyMediaAttach(working, { kind: "create", sceneId: currentSceneId, type: libraryIntent }, { ok: true, mediaId: item.id, ready: true });
      } else if (libraryIntent === "replace" && layerId) {
        applyMediaAttach(working, { kind: "replace", sceneId: currentSceneId, layerId }, { ok: true, mediaId: item.id, ready: true });
      }
    });
    setLibraryOpen(false);
    setLibraryIntent(null);
  }

  function onUploaded(item: DibayIntroMediaRecord) {
    setMedia((prev) => [item, ...prev.filter((row) => row.id !== item.id)]);
  }

  if (loadError) {
    return <p className="p-6 text-sm text-sam-danger">{loadError}</p>;
  }
  if (!documentSnap || !scene) {
    return <p className="p-6 text-sm text-sam-muted">…</p>;
  }

  const statusLabel = isLive
    ? lang === "en"
      ? introOperatorLabelEn("live")
      : introOperatorLabelKo("live")
    : lang === "en"
      ? introOperatorLabelEn(lifecycle)
      : introOperatorLabelKo(lifecycle);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-sam-app text-sam-fg" data-dibay-intro-studio="1">
      <header className="flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2">
        <AdminActionButton variant="ghost" onClick={() => router.push("/admin/intro")}>
          {safeT("admin_dibay_intro_back", { fallbackKo: "목록", fallbackEn: "List" })}
        </AdminActionButton>
        <input
          className="min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setDirty(true);
          }}
          aria-label={safeT("admin_dibay_intro_title_field", { fallbackKo: "제목", fallbackEn: "Title" })}
        />
        <span className="text-xs text-sam-muted">
          {saving
            ? safeT("admin_dibay_intro_saving", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
            : dirty
              ? safeT("admin_dibay_intro_dirty", { fallbackKo: "수정됨", fallbackEn: "Unsaved" })
              : safeT("admin_dibay_intro_saved", { fallbackKo: "저장됨", fallbackEn: "Saved" })}
        </span>
        <span className="text-xs font-semibold">{statusLabel}</span>
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void persist()}>
          {safeT("admin_dibay_intro_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </AdminActionButton>
        <AdminActionButton
          variant="neutral"
          onClick={() => {
            previewDocRef.current = workingRef.current?.snapshot() ?? null;
            setPreviewOpen(true);
          }}
        >
          {safeT("admin_dibay_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
        </AdminActionButton>
        <AdminActionButton variant="neutral" onClick={() => void publish()}>
          {safeT("admin_dibay_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
        {lifecycle !== "draft" ? (
          <AdminActionButton variant="primary" onClick={() => void setLive()}>
            {safeT("admin_dibay_intro_set_live", { fallbackKo: "앱 노출", fallbackEn: "Show on app" })}
          </AdminActionButton>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-sam-border bg-sam-surface p-2">
          <AdminActionButton
            className="mb-2 w-full"
            onClick={() =>
              mutate((working) => {
                const id = working.addScene(scene.id);
                setSceneId(id);
                setLayerId(null);
              })
            }
          >
            {safeT("admin_dibay_intro_add_scene", { fallbackKo: "장면 추가", fallbackEn: "Add scene" })}
          </AdminActionButton>
          {scenes.map((item, index) => (
            <div
              key={item.id}
              data-dibay-intro-scene-rail={item.id}
              className={
                item.id === scene.id
                  ? "mb-2 rounded-ui-rect border border-[#0B421A] bg-[#0B421A] p-2 text-white"
                  : "mb-2 rounded-ui-rect border border-sam-border p-2"
              }
            >
              <button type="button" className="w-full text-left text-sm font-semibold" onClick={() => { setSceneId(item.id); setLayerId(null); }}>
                {item.name.trim() || `${index + 1}`}
              </button>
              <div
                className="mt-1 h-16 overflow-hidden rounded-ui-rect bg-black"
                style={{ background: item.background.color }}
              />
              <label className="mt-1 block text-[11px]">
                {safeT("admin_dibay_intro_duration", { fallbackKo: "길이", fallbackEn: "Duration" })}
                <input
                  type="number"
                  min={SCENE_DURATION_MS_MIN}
                  max={SCENE_DURATION_MS_MAX}
                  className="mt-0.5 w-full rounded-ui-rect px-1 py-0.5 text-sam-fg"
                  value={item.durationMs}
                  onChange={(event) =>
                    mutate((working) => working.setSceneDuration(item.id, Number(event.target.value)))
                  }
                />
              </label>
              <label className="mt-1 block text-[11px]">
                {safeT("admin_dibay_intro_transition", { fallbackKo: "전환", fallbackEn: "Transition" })}
                <select
                  className="mt-0.5 w-full rounded-ui-rect px-1 py-0.5 text-sam-fg"
                  value={item.transition.kind}
                  onChange={(event) => {
                    const kind = event.target.value as SceneTransition["kind"];
                    const next: SceneTransition =
                      kind === "CUT"
                        ? { kind: "CUT" }
                        : kind === "FADE"
                          ? { kind: "FADE", durationMs: 240 }
                          : { kind: "SLIDE", durationMs: 320, direction: "left" };
                    mutate((working) => working.setSceneTransition(item.id, next));
                  }}
                >
                  <option value="CUT">CUT</option>
                  <option value="FADE">FADE</option>
                  <option value="SLIDE">SLIDE</option>
                </select>
              </label>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="text-[11px] underline"
                  onClick={() =>
                    mutate((working) => {
                      const id = working.duplicateScene(item.id);
                      if (id) setSceneId(id);
                    })
                  }
                >
                  {safeT("admin_dibay_intro_duplicate_scene", { fallbackKo: "복제", fallbackEn: "Duplicate" })}
                </button>
                <button
                  type="button"
                  className="text-[11px] underline"
                  onClick={() => {
                    if (index === 0) return;
                    const ids = scenes.map((s) => s.id);
                    const tmp = ids[index - 1];
                    ids[index - 1] = ids[index];
                    ids[index] = tmp;
                    mutate((working) => working.reorderScenes(ids));
                  }}
                >
                  {safeT("admin_dibay_intro_scene_up", { fallbackKo: "위로", fallbackEn: "Move up" })}
                </button>
                <button
                  type="button"
                  className="text-[11px] underline"
                  onClick={() => {
                    if (index >= scenes.length - 1) return;
                    const ids = scenes.map((s) => s.id);
                    const tmp = ids[index + 1];
                    ids[index + 1] = ids[index];
                    ids[index] = tmp;
                    mutate((working) => working.reorderScenes(ids));
                  }}
                >
                  {safeT("admin_dibay_intro_scene_down", { fallbackKo: "아래로", fallbackEn: "Move down" })}
                </button>
                <button
                  type="button"
                  className="text-[11px] underline"
                  onClick={() =>
                    mutate((working) => {
                      const result = working.deleteScene(item.id);
                      if (!result.ok) return;
                      const next = working.scenes()[0];
                      setSceneId(next?.id ?? null);
                    })
                  }
                >
                  {safeT("admin_dibay_intro_delete_scene", { fallbackKo: "삭제", fallbackEn: "Delete" })}
                </button>
              </div>
            </div>
          ))}
        </aside>
        <main className="flex min-w-0 flex-1 flex-col items-center overflow-auto p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <AdminActionButton onClick={() => openLibrary("IMAGE")}>
              {safeT("admin_dibay_intro_add_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
            </AdminActionButton>
            <AdminActionButton onClick={() => openLibrary("LOGO")}>
              {safeT("admin_dibay_intro_add_logo", { fallbackKo: "로고", fallbackEn: "Logo" })}
            </AdminActionButton>
            <AdminActionButton
              onClick={() =>
                mutate((working) => {
                  working.addLayer(scene.id, createTextLayer(nextLayerZ(scene.layers)));
                })
              }
            >
              {safeT("admin_dibay_intro_add_text", { fallbackKo: "텍스트", fallbackEn: "Text" })}
            </AdminActionButton>
            <AdminActionButton
              onClick={() =>
                mutate((working) => {
                  working.addLayer(scene.id, createCtaLayer(nextLayerZ(scene.layers)));
                })
              }
            >
              {safeT("admin_dibay_intro_add_cta", { fallbackKo: "버튼", fallbackEn: "Button" })}
            </AdminActionButton>
          </div>
          <DibayIntroStage
            document={documentSnap}
            sceneId={scene.id}
            selectedLayerId={layerId}
            mediaUrlById={mediaUrlById}
            mediaSizeById={mediaSizeById}
            onSelectLayer={setLayerId}
            onPointerBegin={() => workingRef.current?.beginPointer()}
            onPointerEnd={() => workingRef.current?.commitPointer()}
            onFrameCommit={(id, frame: NormalizedFrame) =>
              mutate((working) => working.setLayerFrame(scene.id, id, frame))
            }
          />
        </main>
        <aside className="w-72 shrink-0 overflow-auto border-l border-sam-border bg-sam-surface p-3">
          <label className="mb-2 block text-xs">
            {safeT("admin_dibay_intro_scene_name", { fallbackKo: "장면 이름", fallbackEn: "Scene name" })}
            <input
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
              value={scene.name}
              onChange={(event) => mutate((working) => working.setSceneName(scene.id, event.target.value))}
            />
          </label>
          <label className="mb-3 block text-xs">
            {safeT("admin_dibay_intro_background", { fallbackKo: "배경", fallbackEn: "Background" })}
            <input
              type="color"
              className="mt-1 h-8 w-full"
              value={scene.background.color}
              onChange={(event) => mutate((working) => working.setSceneBackgroundColor(scene.id, event.target.value.toUpperCase()))}
            />
          </label>
          {!layer ? (
            <p className="text-sm text-sam-muted">
              {safeT("admin_dibay_intro_inspector_empty", {
                fallbackKo: "장면 또는 레이어를 선택하세요.",
                fallbackEn: "Select a scene or layer.",
              })}
            </p>
          ) : (
            <Inspector
              layer={layer}
              lang={lang}
              onPatch={(patch) => mutate((working) => working.updateLayer(scene.id, layer.id, patch))}
              onZ={(dir) => mutate((working) => working.moveLayerZ(scene.id, layer.id, dir))}
              onDelete={() =>
                mutate((working) => {
                  working.deleteLayer(scene.id, layer.id);
                  setLayerId(null);
                })
              }
              onReplace={() => openLibrary("replace")}
            />
          )}
        </aside>
      </div>
      {libraryOpen ? (
        <DibayIntroMediaLibrary
          introId={introId}
          media={media}
          onClose={() => {
            setLibraryOpen(false);
            setLibraryIntent(null);
          }}
          onPicked={onPicked}
          onUploaded={onUploaded}
        />
      ) : null}
      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm">
            <div className="mb-2 flex justify-end">
              <AdminActionButton variant="secondary" onClick={() => setPreviewOpen(false)}>
                {safeT("admin_dibay_intro_preview_close", { fallbackKo: "닫기", fallbackEn: "Close" })}
              </AdminActionButton>
            </div>
            <div ref={previewHostRef} className="aspect-[9/16] w-full overflow-hidden rounded-ui-rect bg-black" data-dibay-intro-preview="1" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Inspector({
  layer,
  lang,
  onPatch,
  onZ,
  onDelete,
  onReplace,
}: {
  layer: DibayIntroLayer;
  lang: string;
  onPatch: (patch: Partial<DibayIntroLayer>) => void;
  onZ: (dir: "forward" | "backward") => void;
  onDelete: () => void;
  onReplace: () => void;
}) {
  const { safeT } = useI18n();
  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold">{layer.type}</p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(event) => onPatch({ visible: event.target.checked })}
        />
        {safeT("admin_dibay_intro_visible", { fallbackKo: "보이기", fallbackEn: "Visible" })}
      </label>
      {(layer.type === "IMAGE" || layer.type === "LOGO") && (
        <>
          {layer.type === "IMAGE" ? (
            <label className="block">
              {safeT("admin_dibay_intro_fit", { fallbackKo: "맞춤", fallbackEn: "Fit" })}
              <select
                className="mt-1 w-full rounded-ui-rect border px-2 py-1"
                value={layer.fit}
                onChange={(event) => onPatch({ fit: event.target.value as "contain" | "cover" })}
              >
                <option value="contain">
                  {safeT("admin_dibay_intro_fit_contain", { fallbackKo: "안에 맞추기", fallbackEn: "Contain" })}
                </option>
                <option value="cover">
                  {safeT("admin_dibay_intro_fit_cover", { fallbackKo: "채우기", fallbackEn: "Cover" })}
                </option>
              </select>
            </label>
          ) : null}
          <AdminActionButton className="w-full" onClick={onReplace}>
            {safeT("admin_dibay_intro_replace_media", { fallbackKo: "미디어 바꾸기", fallbackEn: "Replace media" })}
          </AdminActionButton>
        </>
      )}
      {layer.type === "TEXT" ? (
        <>
          <label className="block">
            {safeT("admin_dibay_intro_text_content", { fallbackKo: "문구", fallbackEn: "Text" })}
            <textarea
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.content}
              onChange={(event) => onPatch({ content: event.target.value })}
            />
          </label>
          <label className="block">
            {safeT("admin_dibay_intro_font_size", { fallbackKo: "글자 크기", fallbackEn: "Size" })}
            <input
              type="number"
              min={10}
              max={96}
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.fontSizePx}
              onChange={(event) => onPatch({ fontSizePx: Number(event.target.value) })}
            />
          </label>
          <label className="block">
            {safeT("admin_dibay_intro_font_weight", { fallbackKo: "굵기", fallbackEn: "Weight" })}
            <select
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.fontWeight}
              onChange={(event) => onPatch({ fontWeight: Number(event.target.value) as 400 | 500 | 600 | 700 })}
            >
              <option value={400}>400</option>
              <option value={500}>500</option>
              <option value={600}>600</option>
              <option value={700}>700</option>
            </select>
          </label>
          <label className="block">
            {safeT("admin_dibay_intro_align", { fallbackKo: "정렬", fallbackEn: "Align" })}
            <select
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.align}
              onChange={(event) => onPatch({ align: event.target.value as "left" | "center" | "right" })}
            >
              <option value="left">left</option>
              <option value="center">center</option>
              <option value="right">right</option>
            </select>
          </label>
          <label className="block">
            {safeT("admin_dibay_intro_color", { fallbackKo: "색", fallbackEn: "Color" })}
            <input type="color" className="mt-1 h-8 w-full" value={layer.color} onChange={(event) => onPatch({ color: event.target.value.toUpperCase() })} />
          </label>
        </>
      ) : null}
      {layer.type === "CTA" ? (
        <>
          <label className="block">
            {safeT("admin_dibay_intro_cta_label", { fallbackKo: "버튼 문구", fallbackEn: "Button label" })}
            <input
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.label}
              onChange={(event) => onPatch({ label: event.target.value })}
            />
          </label>
          <label className="block">
            {safeT("admin_dibay_intro_cta_action", { fallbackKo: "동작", fallbackEn: "Action" })}
            <select
              className="mt-1 w-full rounded-ui-rect border px-2 py-1"
              value={layer.action}
              onChange={(event) => {
                const action = event.target.value as CtaActionKind;
                onPatch({
                  action,
                  destination: action === "APPROVED_INTERNAL_ROUTE" ? "/philife" : null,
                } as Partial<DibayIntroLayer>);
              }}
            >
              <option value="CONTINUE">
                {safeT("admin_dibay_intro_cta_continue", { fallbackKo: "다음 장면", fallbackEn: "Next scene" })}
              </option>
              <option value="FINISH_INTRO">
                {safeT("admin_dibay_intro_cta_finish", { fallbackKo: "인트로 끝내기", fallbackEn: "Finish intro" })}
              </option>
              <option value="APPROVED_INTERNAL_ROUTE">
                {safeT("admin_dibay_intro_cta_route", { fallbackKo: "앱 화면으로 이동", fallbackEn: "Open an app screen" })}
              </option>
            </select>
          </label>
          {layer.action === "APPROVED_INTERNAL_ROUTE" ? (
            <select
              className="w-full rounded-ui-rect border px-2 py-1"
              value={layer.destination ?? "/philife"}
              onChange={(event) => onPatch({ destination: event.target.value } as Partial<DibayIntroLayer>)}
            >
              {DIBAY_INTRO_CTA_ROUTE_OPTIONS.map((opt) => (
                <option key={opt.href} value={opt.href}>
                  {lang === "en" ? opt.labelEn : opt.labelKo}
                </option>
              ))}
            </select>
          ) : null}
        </>
      ) : null}
      <div className="flex gap-2">
        <AdminActionButton onClick={() => onZ("forward")}>
          {safeT("admin_dibay_intro_z_forward", { fallbackKo: "앞으로", fallbackEn: "Bring forward" })}
        </AdminActionButton>
        <AdminActionButton onClick={() => onZ("backward")}>
          {safeT("admin_dibay_intro_z_back", { fallbackKo: "뒤로", fallbackEn: "Send backward" })}
        </AdminActionButton>
      </div>
      <AdminActionButton variant="danger" className="w-full" onClick={onDelete}>
        {safeT("admin_dibay_intro_delete_layer", { fallbackKo: "레이어 삭제", fallbackEn: "Delete layer" })}
      </AdminActionButton>
    </div>
  );
}
