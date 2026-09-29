"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  CtaPayloadV1,
  FrameV1,
  ImagePayloadV1,
  IntroDocumentV1,
  MotionTypeV1,
  SceneV1,
  TextPayloadV1,
  TransitionV1,
} from "@/lib/intro/contracts/document";
import {
  cryptoRandomId,
  DEFAULT_MOTION,
} from "@/lib/intro/contracts/document";
import { IntroCanonicalPreview } from "@/components/admin/intro/IntroCanonicalPreview";
import { IntroCanvas } from "@/components/admin/intro/IntroCanvas";
import { Sam } from "@/lib/ui/css-vars";

type Props = { documentId: string };

type Authority = {
  draftVersion: number;
  latestReleaseId: string | null;
  latestReleaseSourceDraftVersion: number | null;
  draftMatchesLatestRelease: boolean;
  liveMatchesLatestRelease: boolean;
  liveReleaseId: string | null;
  isLive: boolean;
};

type MediaItem = {
  mediaId: string;
  mediaKind: string;
  originalName: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
};

const MOTION_OPTIONS: { value: MotionTypeV1; label: string }[] = [
  { value: "NONE", label: "없음" },
  { value: "FADE_IN", label: "Fade In" },
  { value: "ENTER_LEFT", label: "Slide In Left" },
  { value: "ENTER_RIGHT", label: "Slide In Right" },
  { value: "ENTER_TOP", label: "Slide In Up" },
  { value: "ENTER_BOTTOM", label: "Slide In Down" },
  { value: "SCALE_IN", label: "Scale In" },
];

export function IntroStudioPage({ documentId }: Props) {
  const search = useSearchParams();
  const [document, setDocument] = useState<IntroDocumentV1 | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [draftVersion, setDraftVersion] = useState(1);
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [lastApply, setLastApply] = useState<{
    releaseId: string;
    packageId: string;
    draftVersion: number;
  } | null>(null);
  const [applyDetailsOpen, setApplyDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaPicker, setMediaPicker] = useState<"IMAGE" | "LOGO" | "BG" | null>(
    null,
  );
  const [pendingMediaElement, setPendingMediaElement] = useState<{
    id: string;
    type: "IMAGE" | "LOGO";
  } | null>(null);

  useEffect(() => {
    if (search.get("preview") === "1") setPreviewOpen(true);
  }, [search]);

  const dirty = useMemo(() => {
    if (!document) return false;
    return JSON.stringify(document) !== savedSnapshot;
  }, [document, savedSnapshot]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const loadMedia = useCallback(async () => {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; items?: MediaItem[] };
    if (json.ok) setMediaItems(json.items ?? []);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const [dRes, aRes] = await Promise.all([
      fetch(`/api/admin/intro/documents/${documentId}`, { cache: "no-store" }),
      fetch(`/api/admin/intro/documents/${documentId}/authority`, {
        cache: "no-store",
      }),
    ]);
    const dJson = (await dRes.json()) as {
      ok: boolean;
      document?: {
        document: IntroDocumentV1;
        draft_version: number;
        title: string;
      };
      error?: string;
    };
    const aJson = (await aRes.json()) as {
      ok: boolean;
      authority?: Authority;
    };
    if (!dJson.ok || !dJson.document) {
      setError(dJson.error ?? "load_failed");
      return;
    }
    setDocument(dJson.document.document);
    setSavedSnapshot(JSON.stringify(dJson.document.document));
    setDraftVersion(dJson.document.draft_version);
    if (aJson.ok && aJson.authority) setAuthority(aJson.authority);
  }, [documentId]);

  useEffect(() => {
    void load();
    void loadMedia();
  }, [load, loadMedia]);

  function updateScene(mutator: (scene: SceneV1) => SceneV1) {
    setDocument((prev) => {
      if (!prev || !prev.scenes[sceneIndex]) return prev;
      const scenes = [...prev.scenes];
      scenes[sceneIndex] = mutator(scenes[sceneIndex]);
      return { ...prev, scenes };
    });
  }

  function updateElement(
    elementId: string,
    mutator: (el: SceneV1["elements"][number]) => SceneV1["elements"][number],
  ) {
    updateScene((s) => ({
      ...s,
      elements: s.elements.map((el) => (el.id === elementId ? mutator(el) : el)),
    }));
  }

  function addScene() {
    setDocument((prev) => {
      if (!prev) return prev;
      const next: SceneV1 = {
        id: cryptoRandomId(),
        durationMs: 3000,
        background: { type: "COLOR", color: "#1E293B" },
        transition: { type: "FADE", durationMs: 400 },
        elements: [],
      };
      return { ...prev, scenes: [...prev.scenes, next] };
    });
    setSceneIndex((i) => i + 1);
    setSelectedElementId(null);
  }

  function duplicateScene(index: number) {
    setDocument((prev) => {
      if (!prev?.scenes[index]) return prev;
      const src = prev.scenes[index];
      const copy: SceneV1 = {
        ...src,
        id: cryptoRandomId(),
        elements: src.elements.map((el) => ({ ...el, id: cryptoRandomId() })),
      };
      const scenes = [...prev.scenes];
      scenes.splice(index + 1, 0, copy);
      return { ...prev, scenes };
    });
    setSceneIndex(index + 1);
  }

  function moveScene(index: number, dir: -1 | 1) {
    setDocument((prev) => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.scenes.length) return prev;
      const scenes = [...prev.scenes];
      const tmp = scenes[index];
      scenes[index] = scenes[j];
      scenes[j] = tmp;
      return { ...prev, scenes };
    });
    setSceneIndex((i) => i + dir);
  }

  function deleteScene(index: number) {
    if (!document || document.scenes.length <= 1) {
      setError("최소 1개 장면이 필요합니다");
      return;
    }
    if (!window.confirm("이 장면을 삭제하시겠습니까?")) return;
    setDocument((prev) => {
      if (!prev) return prev;
      const scenes = prev.scenes.filter((_, i) => i !== index);
      return { ...prev, scenes };
    });
    setSceneIndex((i) => Math.max(0, Math.min(i, (document.scenes.length - 2))));
    setSelectedElementId(null);
  }

  function addElement(type: "IMAGE" | "LOGO" | "TEXT" | "CTA") {
    if (type === "IMAGE" || type === "LOGO") {
      // Create after media pick — empty mediaId fails validateDocumentV0.
      const id = cryptoRandomId();
      setSelectedElementId(id);
      setPendingMediaElement({ id, type });
      setMediaPicker(type);
      return;
    }
    const id = cryptoRandomId();
    updateScene((s) => {
      const z = s.elements.length + 1;
      if (type === "TEXT") {
        return {
          ...s,
          elements: [
            ...s.elements,
            {
              id,
              type: "TEXT",
              frame: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
              zIndex: z,
              visible: true,
              opacity: 1,
              motion: { type: "FADE_IN", startMs: 0, durationMs: 500 },
              payload: {
                text: "텍스트",
                color: "#FFFFFF",
                fontSizeNorm: 0.045,
                align: "center",
                weight: "bold",
              },
            },
          ],
        };
      }
      return {
        ...s,
        elements: [
          ...s.elements,
          {
            id,
            type: "CTA",
            frame: { x: 0.2, y: 0.78, w: 0.6, h: 0.08 },
            zIndex: z,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: {
              label: "시작하기",
              action: { type: "FINISH_INTRO" },
              backgroundColor: "#4F46E5",
              textColor: "#FFFFFF",
            },
          },
        ],
      };
    });
    setSelectedElementId(id);
  }

  function deleteElement(elementId: string) {
    if (!window.confirm("이 요소를 삭제할까요?")) return;
    updateScene((s) => ({
      ...s,
      elements: s.elements.filter((el) => el.id !== elementId),
    }));
    setSelectedElementId(null);
  }

  async function save() {
    if (!document) return;
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/intro/documents/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedDraftVersion: draftVersion,
          document,
          title: document.title,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        document?: { document: IntroDocumentV1; draft_version: number };
        error?: string;
      };
      if (!json.ok || !json.document) {
        setError(json.error ?? "save_failed");
        return;
      }
      setDocument(json.document.document);
      setSavedSnapshot(JSON.stringify(json.document.document));
      setDraftVersion(json.document.draft_version);
      setMessage("저장됨");
      await load();
    } finally {
      setBusy(null);
    }
  }

  /**
   * Owner atomic 서비스 적용.
   * Internally: validate Draft → Release → Package → Live.
   * Separate Publish is never required in the primary workflow.
   */
  async function applyService() {
    if (dirty) {
      setError("먼저 저장하세요");
      return;
    }
    setBusy("apply");
    setError(null);
    setMessage(null);
    setApplyDetailsOpen(false);
    try {
      const res = await fetch(
        `/api/admin/intro/documents/${documentId}/apply-service`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `apply_${documentId}_${draftVersion}_${Date.now()}`,
          }),
        },
      );
      const json = (await res.json()) as {
        ok: boolean;
        releaseId?: string;
        packageId?: string;
        draftVersion?: number;
        error?: string;
      };
      if (!json.ok || !json.releaseId || !json.packageId) {
        setError(json.error ?? "apply_failed");
        return;
      }
      setLastApply({
        releaseId: json.releaseId,
        packageId: json.packageId,
        draftVersion: json.draftVersion ?? draftVersion,
      });
      setMessage("서비스 적용됨");
      setApplyDetailsOpen(true);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function uploadMedia(file: File, asLogo = false) {
    setBusy(asLogo ? "upload-logo" : "upload");
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (asLogo) form.set("asLogo", "1");
      const res = await fetch("/api/admin/intro/media", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        ok: boolean;
        item?: MediaItem;
        error?: string;
      };
      if (!json.ok || !json.item) {
        setError(json.error ?? "upload_failed");
        return;
      }
      await loadMedia();
      if (selectedElementId && (mediaPicker === "IMAGE" || mediaPicker === "LOGO")) {
        applyMediaToSelection(json.item.mediaId);
      } else if (mediaPicker === "BG") {
        updateScene((s) => ({
          ...s,
          background: { type: "IMAGE", mediaId: json.item!.mediaId, fit: "COVER" },
        }));
        setMediaPicker(null);
      }
      setMessage("미디어 준비됨");
    } finally {
      setBusy(null);
    }
  }

  function applyMediaToSelection(mediaId: string) {
    if (pendingMediaElement) {
      const { id, type } = pendingMediaElement;
      updateScene((s) => {
        const existing = s.elements.find((el) => el.id === id);
        if (existing) {
          return {
            ...s,
            elements: s.elements.map((el) => {
              if (el.id !== id) return el;
              const p = el.payload as ImagePayloadV1;
              return { ...el, payload: { ...p, mediaId } };
            }),
          };
        }
        return {
          ...s,
          elements: [
            ...s.elements,
            {
              id,
              type,
              frame:
                type === "LOGO"
                  ? { x: 0.3, y: 0.1, w: 0.4, h: 0.12 }
                  : { x: 0.1, y: 0.2, w: 0.8, h: 0.35 },
              zIndex: s.elements.length + 1,
              visible: true,
              opacity: 1,
              motion: DEFAULT_MOTION,
              payload: { mediaId, fit: "CONTAIN" as const },
            },
          ],
        };
      });
      setSelectedElementId(id);
      setPendingMediaElement(null);
      setMediaPicker(null);
      return;
    }
    if (!selectedElementId) return;
    updateElement(selectedElementId, (el) => {
      if (el.type !== "IMAGE" && el.type !== "LOGO") return el;
      const p = el.payload as ImagePayloadV1;
      return { ...el, payload: { ...p, mediaId } };
    });
    setMediaPicker(null);
  }

  const mediaUrls = Object.fromEntries(
    mediaItems
      .filter((m) => m.previewUrl)
      .map((m) => [m.mediaId, m.previewUrl as string]),
  );

  if (!document) {
    return (
      <div className="p-6 text-sm text-sam-muted">
        {error ? error : "불러오는 중…"}
      </div>
    );
  }

  const scene = document.scenes[sceneIndex] ?? document.scenes[0];
  const selected = scene?.elements.find((e) => e.id === selectedElementId) ?? null;
  const durationSec = ((scene?.durationMs ?? 0) / 1000).toFixed(1);

  return (
    <div
      className="flex h-[calc(100vh-4rem)] flex-col bg-sam-app"
      data-intro13-studio="1"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sam-border bg-sam-surface px-4 py-3">
        <div className="min-w-0">
          <Link href="/admin/intro" className="text-xs text-sam-muted hover:underline">
            ← 인트로 목록
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              className={`${Sam.input.base} max-w-xs font-semibold`}
              value={document.title}
              onChange={(e) =>
                setDocument((prev) =>
                  prev ? { ...prev, title: e.target.value } : prev,
                )
              }
            />
            {authority?.isLive && authority.liveMatchesLatestRelease && authority.draftMatchesLatestRelease ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                서비스 적용됨 · 현재 초안과 동일
              </span>
            ) : authority?.isLive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                서비스 중 · 초안과 다름 (서비스 적용 필요)
              </span>
            ) : null}
            <span
              className={`text-xs ${
                dirty ||
                (authority &&
                  !(
                    authority.isLive &&
                    authority.liveMatchesLatestRelease &&
                    authority.draftMatchesLatestRelease
                  ))
                  ? "font-medium text-amber-700"
                  : "text-sam-muted"
              }`}
            >
              {dirty
                ? "저장하지 않은 변경사항"
                : authority?.isLive &&
                    authority.liveMatchesLatestRelease &&
                    authority.draftMatchesLatestRelease
                  ? "저장됨 · 서비스 적용됨"
                  : authority?.draftMatchesLatestRelease
                    ? "저장됨 · 서비스 미적용"
                    : "저장됨"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={Boolean(busy) || !dirty}
            title="현재 편집 내용을 초안으로 저장"
            onClick={() => void save()}
          >
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={Boolean(busy)}
            title="현재 편집 중인 정확한 화면 (앱과 동일 semantics)"
            onClick={() => setPreviewOpen(true)}
          >
            미리보기
          </button>
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={Boolean(busy) || dirty}
            title="저장된 초안을 서비스에 적용 (내부적으로 버전 생성 + Live 전환)"
            onClick={() => void applyService()}
          >
            {busy === "apply" ? "적용 중…" : "서비스 적용"}
          </button>
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border px-2 py-1.5 text-xs text-sam-muted hover:bg-sam-app"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            버전 기록
          </button>
        </div>
      </header>

      {message ? (
        <div className="border-b border-sam-border bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{message}</span>
            {lastApply ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() => setApplyDetailsOpen((v) => !v)}
              >
                {applyDetailsOpen ? "세부 숨기기" : "세부 상태"}
              </button>
            ) : null}
          </div>
          {applyDetailsOpen && lastApply ? (
            <ul className="mt-1 list-inside list-disc text-xs text-emerald-900/90">
              <li>서비스 버전 생성 완료 (초안 v{lastApply.draftVersion})</li>
              <li>Live 적용 완료</li>
              <li>기기 전달: 앱 재실행 시 최신 Live 확인 (store clear 불필요)</li>
            </ul>
          ) : null}
        </div>
      ) : null}
      {historyOpen ? (
        <div className="border-b border-sam-border bg-sam-surface px-4 py-2 text-xs text-sam-muted">
          <p className="font-medium text-sam-fg">버전 기록 (고급)</p>
          <p className="mt-1">
            최신 서비스 버전:{" "}
            {authority?.latestReleaseId
              ? `${authority.latestReleaseId.slice(0, 8)}… (초안 v${authority.latestReleaseSourceDraftVersion ?? "?"})`
              : "없음"}
          </p>
          <p>
            현재 Live:{" "}
            {authority?.liveReleaseId
              ? `${authority.liveReleaseId.slice(0, 8)}…`
              : "없음"}
          </p>
          <p className="mt-1 text-sam-muted">
            Owner 기본 흐름은 저장 → 미리보기 → 서비스 적용입니다. 별도 게시 단계는
            필요 없습니다.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="border-b border-sam-border bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* SCENES */}
        <aside className="overflow-y-auto border-r border-sam-border bg-sam-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
              Scenes
            </h2>
            <button
              type="button"
              className="text-xs text-sky-700 hover:underline"
              onClick={() => addScene()}
            >
              + 장면
            </button>
          </div>
          <ul className="space-y-2">
            {document.scenes.map((s, i) => {
              const bg =
                s.background.type === "COLOR" ? s.background.color : "#334155";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full rounded-ui-rect border p-2 text-left ${
                      i === sceneIndex
                        ? "border-sky-500 ring-1 ring-sky-400"
                        : "border-sam-border"
                    }`}
                    onClick={() => {
                      setSceneIndex(i);
                      setSelectedElementId(null);
                    }}
                  >
                    <div
                      className="mb-1 h-12 w-full rounded-ui-rect border border-black/10"
                      style={{ backgroundColor: bg }}
                    />
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-sam-fg">
                        Scene {i + 1}
                      </span>
                      <span className="text-[10px] text-sam-muted">
                        {(s.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                    {s.background.type === "COLOR" ? (
                      <span className="mt-0.5 block text-[10px] text-sam-muted">
                        ■ {s.background.color}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-[10px] text-sam-muted">
                        배경 이미지
                      </span>
                    )}
                  </button>
                  {i === sceneIndex ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <MiniBtn label="복제" onClick={() => duplicateScene(i)} />
                      <MiniBtn label="↑" onClick={() => moveScene(i, -1)} />
                      <MiniBtn label="↓" onClick={() => moveScene(i, 1)} />
                      <MiniBtn
                        label="삭제"
                        danger
                        onClick={() => deleteScene(i)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {authority?.isLive ? (
            <div className="mt-4 rounded-ui-rect border border-emerald-400 bg-emerald-50 p-2 text-[11px] text-emerald-900">
              <div className="font-semibold">● 현재 서비스 중</div>
              <div className="mt-1">
                Scene {document.scenes.length} ·{" "}
                {(
                  document.scenes.reduce((sum, s) => sum + (s.durationMs || 0), 0) /
                  1000
                ).toFixed(1)}
                s
              </div>
              {document.scenes.map((s, i) => (
                <div key={s.id} className="mt-1 flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-black/10"
                    style={{
                      backgroundColor:
                        s.background.type === "COLOR"
                          ? s.background.color
                          : "#64748B",
                    }}
                  />
                  Scene{i + 1}
                  {s.background.type === "COLOR" ? ` ${s.background.color}` : " 이미지"}
                </div>
              ))}
              {!(
                authority.liveMatchesLatestRelease &&
                authority.draftMatchesLatestRelease
              ) ? (
                <p className="mt-2 text-amber-800">
                  초안이 서비스 버전과 다릅니다. 「서비스 적용」으로 반영하세요.
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>

        {/* CANVAS */}
        <main className="overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={Sam.btn.secondary}
              onClick={() => {
                const t = window.prompt(
                  "추가할 요소",
                  "IMAGE / LOGO / TEXT / CTA",
                );
                const v = (t || "").trim().toUpperCase();
                if (v === "IMAGE" || v === "LOGO" || v === "TEXT" || v === "CTA") {
                  addElement(v);
                }
              }}
            >
              + 요소 추가
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => addElement("IMAGE")}>
              이미지
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => addElement("LOGO")}>
              로고
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => addElement("TEXT")}>
              텍스트
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => addElement("CTA")}>
              버튼
            </button>
          </div>
          {scene ? (
            <IntroCanvas
              document={document}
              scene={scene}
              selectedElementId={selectedElementId}
              mediaUrls={mediaUrls}
              onSelectElement={setSelectedElementId}
              onUpdateFrame={(elementId, frame) =>
                updateElement(elementId, (el) => ({ ...el, frame }))
              }
            />
          ) : null}
        </main>

        {/* PROPERTIES */}
        <aside className="overflow-y-auto border-l border-sam-border bg-sam-surface p-3">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sam-muted">
            Properties
          </h2>

          {scene ? (
            <div className="mb-4 space-y-3 border-b border-sam-border pb-4">
              <div className="text-sm font-medium text-sam-fg">장면</div>
              <label className="block text-xs text-sam-muted">
                재생 시간 {durationSec}초
                <input
                  type="range"
                  min={0.5}
                  max={12}
                  step={0.1}
                  className="mt-1 w-full"
                  value={Number(durationSec)}
                  onChange={(e) =>
                    updateScene((s) => ({
                      ...s,
                      durationMs: Math.round(Number(e.target.value) * 1000),
                    }))
                  }
                />
              </label>
              <label className="block text-xs text-sam-muted">
                배경색
                <div className="mt-1 flex gap-2">
                  <input
                    type="color"
                    value={
                      scene.background.type === "COLOR"
                        ? scene.background.color.slice(0, 7)
                        : "#000000"
                    }
                    onChange={(e) =>
                      updateScene((s) => ({
                        ...s,
                        background: {
                          type: "COLOR",
                          color: e.target.value.toUpperCase(),
                        },
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="text-[11px] text-sky-700 hover:underline"
                    onClick={() => setMediaPicker("BG")}
                  >
                    배경 이미지
                  </button>
                </div>
              </label>
              <TransitionEditor
                transition={scene.transition}
                onChange={(transition) => updateScene((s) => ({ ...s, transition }))}
              />
            </div>
          ) : null}

          {!selected ? (
            <p className="text-sm text-sam-muted">
              Canvas에서 요소를 선택하세요.
            </p>
          ) : (
            <ElementProperties
              element={selected}
              mediaItems={mediaItems}
              onChange={(next) =>
                updateElement(selected.id, () => next)
              }
              onDelete={() => deleteElement(selected.id)}
              onReplaceMedia={() =>
                setMediaPicker(
                  selected.type === "LOGO" ? "LOGO" : "IMAGE",
                )
              }
              onUpload={(file) =>
                void uploadMedia(file, selected.type === "LOGO")
              }
            />
          )}
        </aside>
      </div>

      {/* TIMELINE */}
      <footer className="border-t border-sam-border bg-sam-surface px-4 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-sam-muted">
          <span className="font-medium text-sam-fg">Timeline</span>
          {document.scenes.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`rounded-ui-rect border px-2 py-1 ${
                i === sceneIndex
                  ? "border-sky-500 text-sam-fg"
                  : "border-sam-border"
              }`}
              onClick={() => setSceneIndex(i)}
            >
              S{i + 1} {(s.durationMs / 1000).toFixed(1)}s · {s.transition.type}
            </button>
          ))}
        </div>
      </footer>

      {mediaPicker ? (
        <MediaPickerModal
          items={mediaItems}
          title={
            mediaPicker === "BG"
              ? "배경 이미지 선택"
              : mediaPicker === "LOGO"
                ? "로고 선택 / 교체"
                : "이미지 선택 / 교체"
          }
          onClose={() => {
            setMediaPicker(null);
            setPendingMediaElement(null);
          }}
          onSelect={(mediaId) => {
            if (mediaPicker === "BG") {
              updateScene((s) => ({
                ...s,
                background: { type: "IMAGE", mediaId, fit: "COVER" },
              }));
              setMediaPicker(null);
              return;
            }
            applyMediaToSelection(mediaId);
          }}
          onUpload={(file) =>
            void uploadMedia(file, mediaPicker === "LOGO")
          }
        />
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[95vh] overflow-auto rounded-ui-rect bg-sam-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sam-fg">미리보기 · 전체 타임라인</h3>
              <button
                type="button"
                className={Sam.btn.secondary}
                onClick={() => setPreviewOpen(false)}
              >
                닫기
              </button>
            </div>
            <div className="inline-block rounded-ui-rect border border-sam-border bg-black p-2">
              <IntroCanonicalPreview
                document={document}
                mediaUrls={mediaUrls}
                playTimeline
                viewportW={320}
                viewportH={568}
              />
            </div>
            <p className="mt-2 max-w-sm text-xs text-sam-muted">
              Scene duration · element motion · transition · CTA 동작을 동일
              canonical document로 재생합니다.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rounded px-1.5 py-0.5 text-[10px] ${
        danger ? "text-red-600 hover:bg-red-50" : "text-sam-muted hover:bg-sam-app"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function TransitionEditor({
  transition,
  onChange,
}: {
  transition: TransitionV1;
  onChange: (t: TransitionV1) => void;
}) {
  const type = transition.type;
  return (
    <div className="space-y-2">
      <div className="text-xs text-sam-muted">장면 전환</div>
      <div className="grid grid-cols-2 gap-1">
        {(
          [
            ["CUT", "없음 / CUT"],
            ["FADE", "FADE"],
            ["SLIDE_LEFT", "SLIDE LEFT"],
            ["SLIDE_RIGHT", "SLIDE RIGHT"],
            ["SLIDE_UP", "SLIDE UP"],
            ["SLIDE_DOWN", "SLIDE DOWN"],
          ] as const
        ).map(([key, label]) => {
          const active =
            (key === "CUT" && type === "CUT") ||
            (key === "FADE" && type === "FADE") ||
            (key === "SLIDE_LEFT" &&
              type === "SLIDE" &&
              transition.direction === "LEFT") ||
            (key === "SLIDE_RIGHT" &&
              type === "SLIDE" &&
              transition.direction === "RIGHT") ||
            (key === "SLIDE_UP" &&
              type === "SLIDE" &&
              transition.direction === "UP") ||
            (key === "SLIDE_DOWN" &&
              type === "SLIDE" &&
              transition.direction === "DOWN");
          return (
            <button
              key={key}
              type="button"
              className={`rounded-ui-rect border px-2 py-1 text-[11px] ${
                active
                  ? "border-sky-500 bg-sky-50 text-sam-fg"
                  : "border-sam-border text-sam-muted"
              }`}
              onClick={() => {
                if (key === "CUT") onChange({ type: "CUT", durationMs: 0 });
                else if (key === "FADE")
                  onChange({ type: "FADE", durationMs: 400 });
                else {
                  const direction = key.replace("SLIDE_", "") as
                    | "LEFT"
                    | "RIGHT"
                    | "UP"
                    | "DOWN";
                  onChange({ type: "SLIDE", durationMs: 400, direction });
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {type !== "CUT" ? (
        <label className="block text-[11px] text-sam-muted">
          전환 시간 {(transition.durationMs / 1000).toFixed(1)}초
          <input
            type="range"
            min={100}
            max={1200}
            step={50}
            className="mt-1 w-full"
            value={transition.durationMs}
            onChange={(e) =>
              onChange({
                ...transition,
                durationMs: Number(e.target.value),
              } as TransitionV1)
            }
          />
        </label>
      ) : null}
    </div>
  );
}

function ElementProperties({
  element,
  mediaItems,
  onChange,
  onDelete,
  onReplaceMedia,
  onUpload,
}: {
  element: SceneV1["elements"][number];
  mediaItems: MediaItem[];
  onChange: (el: SceneV1["elements"][number]) => void;
  onDelete: () => void;
  onReplaceMedia: () => void;
  onUpload: (file: File) => void;
}) {
  const f = element.frame;
  function setFrame(patch: Partial<FrameV1>) {
    onChange({
      ...element,
      frame: {
        x: patch.x ?? f.x,
        y: patch.y ?? f.y,
        w: patch.w ?? f.w,
        h: patch.h ?? f.h,
      },
    });
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sam-fg">{element.type}</span>
        <button
          type="button"
          className="text-xs text-red-600 hover:underline"
          onClick={onDelete}
        >
          요소 삭제
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <NumField
          label="X %"
          value={+(f.x * 100).toFixed(1)}
          onChange={(v) => setFrame({ x: v / 100 })}
        />
        <NumField
          label="Y %"
          value={+(f.y * 100).toFixed(1)}
          onChange={(v) => setFrame({ y: v / 100 })}
        />
        <NumField
          label="W %"
          value={+(f.w * 100).toFixed(1)}
          onChange={(v) => setFrame({ w: v / 100 })}
        />
        <NumField
          label="H %"
          value={+(f.h * 100).toFixed(1)}
          onChange={(v) => setFrame({ h: v / 100 })}
        />
      </div>

      <label className="block text-xs text-sam-muted">
        투명도 {Math.round(element.opacity * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          className="mt-1 w-full"
          value={Math.round(element.opacity * 100)}
          onChange={(e) =>
            onChange({ ...element, opacity: Number(e.target.value) / 100 })
          }
        />
      </label>

      <div className="space-y-1">
        <div className="text-xs text-sam-muted">Element Motion</div>
        <select
          className={Sam.input.base}
          value={element.motion.type}
          onChange={(e) => {
            const type = e.target.value as MotionTypeV1;
            onChange({
              ...element,
              motion:
                type === "NONE"
                  ? DEFAULT_MOTION
                  : {
                      type,
                      startMs: element.motion.startMs || 0,
                      durationMs: element.motion.durationMs || 500,
                    },
            });
          }}
        >
          {MOTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {element.motion.type !== "NONE" ? (
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="시작 ms"
              value={element.motion.startMs}
              onChange={(v) =>
                onChange({
                  ...element,
                  motion: { ...element.motion, startMs: Math.max(0, v) },
                })
              }
            />
            <NumField
              label="지속 ms"
              value={element.motion.durationMs}
              onChange={(v) =>
                onChange({
                  ...element,
                  motion: {
                    ...element.motion,
                    durationMs: Math.max(50, v),
                  },
                })
              }
            />
          </div>
        ) : null}
      </div>

      {(element.type === "IMAGE" || element.type === "LOGO") && (
        <ImageProps
          element={element}
          mediaItems={mediaItems}
          onChange={onChange}
          onReplaceMedia={onReplaceMedia}
          onUpload={onUpload}
        />
      )}
      {element.type === "TEXT" && (
        <TextProps element={element} onChange={onChange} />
      )}
      {element.type === "CTA" && (
        <CtaProps element={element} onChange={onChange} />
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-[11px] text-sam-muted">
      {label}
      <input
        type="number"
        className={`${Sam.input.base} mt-0.5`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ImageProps({
  element,
  mediaItems,
  onChange,
  onReplaceMedia,
  onUpload,
}: {
  element: SceneV1["elements"][number];
  mediaItems: MediaItem[];
  onChange: (el: SceneV1["elements"][number]) => void;
  onReplaceMedia: () => void;
  onUpload: (file: File) => void;
}) {
  const p = element.payload as ImagePayloadV1;
  const media = mediaItems.find((m) => m.mediaId === p.mediaId);
  return (
    <div className="space-y-2 border-t border-sam-border pt-3">
      <div className="text-xs font-medium text-sam-fg">이미지</div>
      {media?.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.previewUrl}
          alt=""
          className="h-20 w-full rounded-ui-rect object-contain bg-sam-app"
        />
      ) : (
        <div className="flex h-16 items-center justify-center rounded-ui-rect bg-sam-app text-xs text-sam-muted">
          미디어 없음
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${Sam.btn.secondary} text-xs`} onClick={onReplaceMedia}>
          교체 / 미디어에서 선택
        </button>
        <label className={`${Sam.btn.secondary} cursor-pointer text-xs`}>
          업로드
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex gap-2">
        {(["CONTAIN", "COVER"] as const).map((fit) => (
          <button
            key={fit}
            type="button"
            className={
              p.fit === fit
                ? `${Sam.btn.primary} text-xs`
                : `${Sam.btn.secondary} text-xs`
            }
            onClick={() =>
              onChange({ ...element, payload: { ...p, fit } })
            }
          >
            {fit === "CONTAIN" ? "Contain" : "Cover"}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextProps({
  element,
  onChange,
}: {
  element: SceneV1["elements"][number];
  onChange: (el: SceneV1["elements"][number]) => void;
}) {
  const p = element.payload as TextPayloadV1;
  return (
    <div className="space-y-2 border-t border-sam-border pt-3">
      <label className="block text-xs text-sam-muted">
        내용
        <textarea
          className={`${Sam.input.base} mt-1 min-h-[72px]`}
          value={p.text}
          onChange={(e) =>
            onChange({ ...element, payload: { ...p, text: e.target.value } })
          }
        />
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={p.color.slice(0, 7)}
          onChange={(e) =>
            onChange({
              ...element,
              payload: { ...p, color: e.target.value.toUpperCase() },
            })
          }
        />
        <select
          className={Sam.input.base}
          value={p.align}
          onChange={(e) =>
            onChange({
              ...element,
              payload: {
                ...p,
                align: e.target.value as TextPayloadV1["align"],
              },
            })
          }
        >
          <option value="left">왼쪽</option>
          <option value="center">가운데</option>
          <option value="right">오른쪽</option>
        </select>
        <select
          className={Sam.input.base}
          value={p.weight}
          onChange={(e) =>
            onChange({
              ...element,
              payload: {
                ...p,
                weight: e.target.value as TextPayloadV1["weight"],
              },
            })
          }
        >
          <option value="regular">보통</option>
          <option value="medium">중간</option>
          <option value="bold">굵게</option>
        </select>
      </div>
      <label className="block text-xs text-sam-muted">
        크기 {(p.fontSizeNorm * 100).toFixed(1)}%
        <input
          type="range"
          min={2}
          max={12}
          step={0.1}
          className="mt-1 w-full"
          value={+(p.fontSizeNorm * 100).toFixed(1)}
          onChange={(e) =>
            onChange({
              ...element,
              payload: { ...p, fontSizeNorm: Number(e.target.value) / 100 },
            })
          }
        />
      </label>
    </div>
  );
}

function CtaProps({
  element,
  onChange,
}: {
  element: SceneV1["elements"][number];
  onChange: (el: SceneV1["elements"][number]) => void;
}) {
  const p = element.payload as CtaPayloadV1;
  return (
    <div className="space-y-2 border-t border-sam-border pt-3">
      <label className="block text-xs text-sam-muted">
        버튼 텍스트
        <input
          className={`${Sam.input.base} mt-1`}
          value={p.label}
          onChange={(e) =>
            onChange({ ...element, payload: { ...p, label: e.target.value } })
          }
        />
      </label>
      <div className="flex gap-2">
        <label className="text-xs text-sam-muted">
          배경
          <input
            type="color"
            className="mt-1 block"
            value={p.backgroundColor.slice(0, 7)}
            onChange={(e) =>
              onChange({
                ...element,
                payload: {
                  ...p,
                  backgroundColor: e.target.value.toUpperCase(),
                },
              })
            }
          />
        </label>
        <label className="text-xs text-sam-muted">
          글자
          <input
            type="color"
            className="mt-1 block"
            value={p.textColor.slice(0, 7)}
            onChange={(e) =>
              onChange({
                ...element,
                payload: { ...p, textColor: e.target.value.toUpperCase() },
              })
            }
          />
        </label>
      </div>
      <label className="block text-xs text-sam-muted">
        Action
        <select
          className={`${Sam.input.base} mt-1`}
          value={
            p.action.type === "INTERNAL_DESTINATION"
              ? `DEST:${p.action.destination}`
              : p.action.type
          }
          onChange={(e) => {
            const v = e.target.value;
            let action: CtaPayloadV1["action"];
            if (v === "NEXT_SCENE") action = { type: "NEXT_SCENE" };
            else if (v === "FINISH_INTRO") action = { type: "FINISH_INTRO" };
            else {
              action = {
                type: "INTERNAL_DESTINATION",
                destination: v.replace("DEST:", "") as
                  | "community"
                  | "trade"
                  | "food"
                  | "chat"
                  | "my",
              };
            }
            onChange({ ...element, payload: { ...p, action } });
          }}
        >
          <option value="NEXT_SCENE">다음 장면</option>
          <option value="FINISH_INTRO">Intro 종료</option>
          <option value="DEST:community">내부 · 커뮤니티</option>
          <option value="DEST:trade">내부 · 거래</option>
          <option value="DEST:food">내부 · 배달</option>
          <option value="DEST:chat">내부 · 채팅</option>
          <option value="DEST:my">내부 · 마이</option>
        </select>
      </label>
    </div>
  );
}

function MediaPickerModal({
  items,
  title,
  onClose,
  onSelect,
  onUpload,
}: {
  items: MediaItem[];
  title: string;
  onClose: () => void;
  onSelect: (mediaId: string) => void;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-ui-rect bg-sam-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-sam-fg">{title}</h3>
          <button type="button" className={Sam.btn.secondary} onClick={onClose}>
            취소
          </button>
        </div>
        <label className={`${Sam.btn.secondary} mb-3 inline-block cursor-pointer`}>
          새 파일 업로드
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <ul className="grid grid-cols-3 gap-2">
          {items.map((m) => (
            <li key={m.mediaId}>
              <button
                type="button"
                className="w-full overflow-hidden rounded-ui-rect border border-sam-border"
                onClick={() => onSelect(m.mediaId)}
              >
                {m.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.previewUrl}
                    alt=""
                    className="h-20 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 items-center justify-center text-[10px] text-sam-muted">
                    READY
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
