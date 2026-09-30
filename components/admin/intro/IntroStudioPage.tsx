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
  VideoPayloadV1,
} from "@/lib/intro/contracts/document";
import {
  cryptoRandomId,
  DEFAULT_MOTION,
  DEFAULT_TRANSITION_FADE,
  MOTION_OPERATOR_LABELS,
  MOTION_TYPES_V1,
  normalizeDocumentV1,
  TRANSITION_OPERATOR_LABELS,
  TRANSITION_TYPES_V1,
} from "@/lib/intro/contracts/document";
import {
  centerFrame,
  containMediaFrame,
  defaultImageInsertFrame,
  defaultLogoInsertFrame,
  defaultVideoInsertFrame,
  DEFAULT_LOGO_MAX_H,
  DEFAULT_LOGO_MAX_W,
  DEFAULT_MEDIA_MAX_H,
  DEFAULT_MEDIA_MAX_W,
} from "@/lib/intro/geometry/element-layout";
import { IntroCanonicalPreview } from "@/components/admin/intro/IntroCanonicalPreview";
import { IntroCanvas } from "@/components/admin/intro/IntroCanvas";
import {
  AdminActionButton,
  AdminActionLabel,
} from "@/components/admin/ui/AdminActionButton";

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

/** Same registry as Draft/Apply/Package — no SLIDE_LEFT etc. */
const MOTION_OPTIONS: { value: MotionTypeV1; label: string }[] =
  MOTION_TYPES_V1.map((value) => ({
    value,
    label: MOTION_OPERATOR_LABELS[value],
  }));

function displaySceneName(scene: SceneV1, index: number): string {
  const n = (scene.name || "").trim();
  return n || `장면 ${index + 1}`;
}

function mediaSizeFromItem(item: MediaItem | undefined) {
  if (!item?.width || !item?.height) return null;
  return { width: item.width, height: item.height };
}

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
  const [mediaPicker, setMediaPicker] = useState<
    "IMAGE" | "LOGO" | "VIDEO" | "BG" | null
  >(null);
  const [sceneMenuIndex, setSceneMenuIndex] = useState<number | null>(null);
  const [pendingMediaElement, setPendingMediaElement] = useState<{
    id: string;
    type: "IMAGE" | "LOGO" | "VIDEO";
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
    const doc = normalizeDocumentV1(dJson.document.document);
    setDocument(doc);
    setSavedSnapshot(JSON.stringify(doc));
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
      const n = prev.scenes.length + 1;
      const next: SceneV1 = {
        id: cryptoRandomId(),
        name: `장면 ${n}`,
        durationMs: 3000,
        background: { type: "COLOR", color: "#1E293B" },
        transition: { ...DEFAULT_TRANSITION_FADE },
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
        name: `${displaySceneName(src, index)} 복사`,
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
    setSceneMenuIndex(null);
  }

  function addElement(type: "IMAGE" | "LOGO" | "VIDEO" | "TEXT" | "CTA") {
    if (type === "IMAGE" || type === "LOGO" || type === "VIDEO") {
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
      const saved = normalizeDocumentV1(json.document.document);
      setDocument(saved);
      setSavedSnapshot(JSON.stringify(saved));
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
      if (
        selectedElementId &&
        (mediaPicker === "IMAGE" ||
          mediaPicker === "LOGO" ||
          mediaPicker === "VIDEO")
      ) {
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
    const item = mediaItems.find((m) => m.mediaId === mediaId);
    const meta = mediaSizeFromItem(item);

    if (pendingMediaElement) {
      const { id, type } = pendingMediaElement;
      updateScene((s) => {
        const existing = s.elements.find((el) => el.id === id);
        if (existing) {
          return {
            ...s,
            elements: s.elements.map((el) => {
              if (el.id !== id) return el;
              if (el.type === "VIDEO") {
                const p = el.payload as VideoPayloadV1;
                return { ...el, payload: { ...p, mediaId } };
              }
              const p = el.payload as ImagePayloadV1;
              return { ...el, payload: { ...p, mediaId } };
            }),
          };
        }
        const frame =
          type === "LOGO"
            ? defaultLogoInsertFrame(meta)
            : type === "VIDEO"
              ? defaultVideoInsertFrame(meta)
              : defaultImageInsertFrame(meta);
        const payload =
          type === "VIDEO"
            ? ({
                mediaId,
                fit: "CONTAIN" as const,
                loop: true,
                muted: true,
              } satisfies VideoPayloadV1)
            : ({ mediaId, fit: "CONTAIN" as const } satisfies ImagePayloadV1);
        return {
          ...s,
          elements: [
            ...s.elements,
            {
              id,
              type,
              frame,
              zIndex: s.elements.length + 1,
              visible: true,
              opacity: 1,
              motion: DEFAULT_MOTION,
              payload,
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
      if (el.type === "VIDEO") {
        const p = el.payload as VideoPayloadV1;
        return { ...el, payload: { ...p, mediaId } };
      }
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
              className={`sam-input max-w-xs font-semibold`}
              value={document.title}
              onChange={(e) =>
                setDocument((prev) =>
                  prev ? { ...prev, title: e.target.value } : prev,
                )
              }
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            <span className={dirty ? "font-medium text-amber-700" : "text-sam-muted"}>
              편집 상태: {dirty ? "저장하지 않은 변경사항" : "저장됨"}
            </span>
            <span className="text-sam-border">·</span>
            <span
              className={
                authority?.isLive
                  ? authority.liveMatchesLatestRelease &&
                    authority.draftMatchesLatestRelease
                    ? "font-medium text-emerald-700"
                    : "font-medium text-amber-700"
                  : "text-sam-muted"
              }
            >
              서비스 상태:{" "}
              {authority?.isLive
                ? authority.liveMatchesLatestRelease &&
                  authority.draftMatchesLatestRelease
                  ? "현재 서비스 중"
                  : "서비스 중 · 초안과 다름"
                : "서비스 미적용"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminActionButton
            variant="secondary"
            disabled={Boolean(busy) || !dirty}
            title="현재 편집 내용을 초안으로 저장"
            onClick={() => void save()}
          >
            {busy === "save" ? "저장 중…" : "저장"}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            disabled={Boolean(busy)}
            title="현재 편집 중인 정확한 화면 (앱과 동일 semantics)"
            onClick={() => setPreviewOpen(true)}
          >
            미리보기
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={Boolean(busy) || dirty}
            title="저장된 초안을 서비스에 적용 (내부적으로 버전 생성 + Live 전환)"
            onClick={() => void applyService()}
          >
            {busy === "apply" ? "적용 중…" : "서비스 적용"}
          </AdminActionButton>
          <div className="relative">
            <AdminActionButton
              variant="neutral"
              aria-label="더보기"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              ⋯
            </AdminActionButton>
          </div>
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
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sam-fg">버전 기록</p>
            <AdminActionButton variant="quiet" onClick={() => setHistoryOpen(false)}>
              닫기
            </AdminActionButton>
          </div>
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
              장면
            </h2>
            <AdminActionButton variant="secondary" className="min-h-8 px-2 text-xs" onClick={() => addScene()}>
              + 장면 추가
            </AdminActionButton>
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
                      setSceneMenuIndex(null);
                    }}
                  >
                    <div
                      className="mb-1 h-12 w-full rounded-ui-rect border border-black/10"
                      style={{ backgroundColor: bg }}
                    />
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-sam-fg">
                        {displaySceneName(s, i)}
                      </span>
                      <span className="text-[10px] text-sam-muted">
                        {(s.durationMs / 1000).toFixed(1)}초
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
                    <div className="mt-1 flex gap-1">
                      <AdminActionButton
                        variant="secondary"
                        className="min-h-7 flex-1 px-2 text-xs"
                        onClick={() => duplicateScene(i)}
                      >
                        복제
                      </AdminActionButton>
                      <AdminActionButton
                        variant="danger"
                        className="min-h-7 flex-1 px-2 text-xs"
                        disabled={document.scenes.length <= 1}
                        onClick={() => deleteScene(i)}
                      >
                        삭제
                      </AdminActionButton>
                    </div>
                  ) : null}
                  <div className="mt-1 w-full space-y-1">
                    <div className="flex justify-end">
                      <AdminActionButton
                        variant="neutral"
                        className="min-h-7 px-2 text-xs"
                        aria-label={`${displaySceneName(s, i)} 메뉴`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSceneMenuIndex((cur) => (cur === i ? null : i));
                          setSceneIndex(i);
                        }}
                      >
                        ⋯
                      </AdminActionButton>
                    </div>
                    {sceneMenuIndex === i ? (
                      <div className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sm">
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-xs text-sam-fg hover:bg-sam-app"
                          onClick={() => {
                            duplicateScene(i);
                            setSceneMenuIndex(null);
                          }}
                        >
                          복제
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-xs text-sam-fg hover:bg-sam-app disabled:opacity-40"
                          disabled={i === 0}
                          onClick={() => {
                            moveScene(i, -1);
                            setSceneMenuIndex(null);
                          }}
                        >
                          위로 이동
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-xs text-sam-fg hover:bg-sam-app disabled:opacity-40"
                          disabled={i >= document.scenes.length - 1}
                          onClick={() => {
                            moveScene(i, 1);
                            setSceneMenuIndex(null);
                          }}
                        >
                          아래로 이동
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                          disabled={document.scenes.length <= 1}
                          onClick={() => deleteScene(i)}
                        >
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {authority?.isLive ? (
            <div className="mt-4 rounded-ui-rect border border-emerald-400 bg-emerald-50 p-2 text-[11px] text-emerald-900">
              <div className="font-semibold">● 현재 서비스 중</div>
              <div className="mt-1">
                장면 {document.scenes.length} ·{" "}
                {(
                  document.scenes.reduce((sum, s) => sum + (s.durationMs || 0), 0) /
                  1000
                ).toFixed(1)}
                초
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
                  장면 {i + 1}
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
            <AdminActionButton variant="secondary" onClick={() => addElement("IMAGE")}>
              + 이미지
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => addElement("LOGO")}>
              + 로고
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => addElement("VIDEO")}>
              + 비디오
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => addElement("TEXT")}>
              + 텍스트
            </AdminActionButton>
            <AdminActionButton variant="secondary" onClick={() => addElement("CTA")}>
              + 버튼
            </AdminActionButton>
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
            속성
          </h2>

          {selected ? (
            <div className="mb-3 rounded-ui-rect border border-sky-300 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-900">
              선택됨:{" "}
              {selected.type === "IMAGE"
                ? "이미지"
                : selected.type === "LOGO"
                  ? "로고"
                  : selected.type === "VIDEO"
                    ? "비디오"
                    : selected.type === "TEXT"
                      ? "텍스트"
                      : selected.type === "CTA"
                        ? "버튼"
                        : selected.type}
            </div>
          ) : scene ? (
            <div className="mb-3 rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-xs font-semibold text-sam-fg">
              선택됨: {displaySceneName(scene, sceneIndex)}
            </div>
          ) : null}

          {scene && !selected ? (
            <div className="mb-4 space-y-3 border-b border-sam-border pb-4">
              <div className="text-sm font-medium text-sam-fg">장면</div>
              <label className="block text-xs text-sam-muted">
                장면 이름
                <input
                  className="sam-input mt-1 w-full"
                  value={scene.name}
                  onChange={(e) =>
                    updateScene((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder={displaySceneName(scene, sceneIndex)}
                />
              </label>
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
                  selected.type === "LOGO"
                    ? "LOGO"
                    : selected.type === "VIDEO"
                      ? "VIDEO"
                      : "IMAGE",
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
                : mediaPicker === "VIDEO"
                  ? "비디오 선택 / 교체"
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
              <AdminActionButton
                variant="secondary"
                onClick={() => setPreviewOpen(false)}
              >
                닫기
              </AdminActionButton>
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
      <div className="text-xs font-medium text-sam-fg">장면 전환</div>
      <div className="space-y-1" role="radiogroup" aria-label="장면 전환">
        {TRANSITION_TYPES_V1.map((key) => {
          const active = type === key;
          const label = TRANSITION_OPERATOR_LABELS[key];
          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 rounded-ui-rect border px-2 py-1.5 text-xs ${
                active
                  ? "border-sky-500 bg-sky-50 text-sam-fg"
                  : "border-sam-border text-sam-muted hover:bg-sam-app"
              }`}
            >
              <input
                type="radio"
                name="scene-transition"
                className="accent-sky-600"
                checked={active}
                onChange={() => {
                  if (key === "CUT") onChange({ type: "CUT", durationMs: 0 });
                  else if (key === "FADE")
                    onChange({ type: "FADE", durationMs: 400 });
                  else
                    onChange({
                      type: key,
                      durationMs: transition.durationMs || 400,
                    });
                }}
              />
              {label}
            </label>
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
        <span className="font-medium text-sam-fg">
          {element.type === "IMAGE"
            ? "이미지"
            : element.type === "LOGO"
              ? "로고"
              : element.type === "VIDEO"
                ? "비디오"
                : element.type === "TEXT"
                  ? "텍스트"
                  : element.type === "CTA"
                    ? "버튼"
                    : element.type}
        </span>
        <AdminActionButton variant="danger" className="min-h-8 text-xs" onClick={onDelete}>
          요소 삭제
        </AdminActionButton>
      </div>

      <AdminActionButton
        variant="secondary"
        className="w-full min-h-8 text-xs"
        onClick={() =>
          onChange({ ...element, frame: centerFrame(element.frame) })
        }
      >
        가운데 맞춤
      </AdminActionButton>

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
        <div className="text-xs font-medium text-sam-fg">요소 등장 효과</div>
        <p className="text-[10px] text-sam-muted">장면 전환과 별개입니다.</p>
        <select
          className="sam-input"
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

      {(element.type === "IMAGE" ||
        element.type === "LOGO" ||
        element.type === "VIDEO") && (
        <ImageProps
          element={element}
          mediaItems={mediaItems}
          onChange={onChange}
          onReplaceMedia={onReplaceMedia}
          onUpload={onUpload}
          onDelete={onDelete}
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
        className={`sam-input mt-0.5`}
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
  onDelete,
}: {
  element: SceneV1["elements"][number];
  mediaItems: MediaItem[];
  onChange: (el: SceneV1["elements"][number]) => void;
  onReplaceMedia: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const p = element.payload as ImagePayloadV1 | VideoPayloadV1;
  const media = mediaItems.find((m) => m.mediaId === p.mediaId);
  const meta = mediaSizeFromItem(media);

  function applyOriginalAspectFrame() {
    const maxW =
      element.type === "LOGO" ? DEFAULT_LOGO_MAX_W : DEFAULT_MEDIA_MAX_W;
    const maxH =
      element.type === "LOGO" ? DEFAULT_LOGO_MAX_H : DEFAULT_MEDIA_MAX_H;
    onChange({
      ...element,
      frame: containMediaFrame(meta, maxW, maxH),
    });
  }

  return (
    <div className="space-y-2 border-t border-sam-border pt-3">
      <div className="text-xs font-medium text-sam-fg">
        {element.type === "LOGO"
          ? "로고"
          : element.type === "VIDEO"
            ? "비디오"
            : "이미지"}
      </div>
      {media?.previewUrl ? (
        element.type === "VIDEO" ? (
          <video
            src={media.previewUrl}
            muted
            playsInline
            loop
            className="h-20 w-full rounded-ui-rect object-contain bg-sam-app"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.previewUrl}
            alt=""
            className="h-20 w-full rounded-ui-rect object-contain bg-sam-app"
          />
        )
      ) : (
        <div className="flex h-16 items-center justify-center rounded-ui-rect bg-sam-app text-xs text-sam-muted">
          미디어 없음
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <AdminActionButton variant="secondary" className="text-xs" onClick={onReplaceMedia}>
          {element.type === "IMAGE"
            ? "이미지 변경"
            : element.type === "VIDEO"
              ? "영상 변경"
              : "교체"}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="text-xs"
          disabled={!meta}
          onClick={applyOriginalAspectFrame}
        >
          원본 비율
        </AdminActionButton>
        <label className="inline-flex min-h-9 cursor-pointer items-center justify-center whitespace-nowrap rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] px-3 py-1.5 text-[13px] font-semibold text-[var(--admin-console-fg,#1f2937)] hover:bg-[var(--admin-console-hover,#eef1f6)]">
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
        <AdminActionButton variant="danger" className="text-xs" onClick={onDelete}>
          삭제
        </AdminActionButton>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-medium text-sam-fg">맞춤 방식</div>
        {(
          [
            { fit: "CONTAIN" as const, label: "화면 안에 맞춤 (Contain)" },
            { fit: "COVER" as const, label: "화면 채우기 (Cover)" },
          ] as const
        ).map(({ fit, label }) => (
          <label
            key={fit}
            className={`flex cursor-pointer items-center gap-2 rounded-ui-rect border px-2 py-1.5 text-xs ${
              p.fit === fit
                ? "border-sky-500 bg-sky-50 text-sam-fg"
                : "border-sam-border text-sam-muted"
            }`}
          >
            <input
              type="radio"
              name={`fit-${element.id}`}
              className="accent-sky-600"
              checked={p.fit === fit}
              onChange={() =>
                onChange({ ...element, payload: { ...p, fit } })
              }
            />
            {label}
          </label>
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
          className={`sam-input mt-1 min-h-[72px]`}
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
          className="sam-input"
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
          className="sam-input"
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
        크기 {(p.fontSizeNorm * 100).toFixed(1)}% (캔버스 높이 기준)
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
      <p className="text-[11px] text-amber-700">
        프레임 밖으로 넘치는 글자는 Canvas에서 잘립니다. 크기·프레임을 조정하세요.
      </p>
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
          className={`sam-input mt-1`}
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
        동작
        <select
          className={`sam-input mt-1`}
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
          <option value="FINISH_INTRO">인트로 종료</option>
          <option value="DEST:community">DIBAY 내부 · 커뮤니티</option>
          <option value="DEST:trade">DIBAY 내부 · 거래</option>
          <option value="DEST:food">DIBAY 내부 · 배달</option>
          <option value="DEST:chat">DIBAY 내부 · 채팅</option>
          <option value="DEST:my">DIBAY 내부 · 마이</option>
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
          <AdminActionButton variant="secondary" onClick={onClose}>
            취소
          </AdminActionButton>
        </div>
        <AdminActionLabel variant="secondary" className="mb-3 inline-block">
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
        </AdminActionLabel>
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
