"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
  ImagePayloadV1,
} from "@/lib/intro/contracts/document";
import {
  cryptoRandomId,
  DEFAULT_MOTION,
} from "@/lib/intro/contracts/document";
import { IntroCanonicalPreview } from "@/components/admin/intro/IntroCanonicalPreview";
import { Sam } from "@/lib/ui/css-vars";

type Props = { documentId: string };

type Authority = {
  draftVersion: number;
  latestReleaseId: string | null;
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

export function IntroStudioPage({ documentId }: Props) {
  const [document, setDocument] = useState<IntroDocumentV1 | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [lastPublish, setLastPublish] = useState<{
    releaseId: string;
    packageId: string;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  const loadMedia = useCallback(async () => {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      items?: MediaItem[];
    };
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
      error?: string;
    };
    if (!dJson.ok || !dJson.document) {
      setError(dJson.error ?? "load_failed");
      return;
    }
    setDocument(dJson.document.document);
    setDraftVersion(dJson.document.draft_version);
    if (aJson.ok && aJson.authority) setAuthority(aJson.authority);
  }, [documentId]);

  useEffect(() => {
    void load();
    void loadMedia();
  }, [load, loadMedia]);

  function updateScene(mutator: (scene: SceneV1) => SceneV1) {
    setDocument((prev) => {
      if (!prev || !prev.scenes[0]) return prev;
      const scenes = [...prev.scenes];
      scenes[0] = mutator(scenes[0]);
      return { ...prev, scenes };
    });
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
      setDraftVersion(json.document.draft_version);
      setMessage("저장됨");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/intro/documents/${documentId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `pub_${documentId}_${draftVersion}_${Date.now()}`,
          }),
        },
      );
      const json = (await res.json()) as {
        ok: boolean;
        releaseId?: string;
        packageId?: string;
        error?: string;
      };
      if (!json.ok || !json.releaseId || !json.packageId) {
        setError(json.error ?? "publish_failed");
        return;
      }
      setLastPublish({ releaseId: json.releaseId, packageId: json.packageId });
      setMessage("게시됨 (불변 릴리스)");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function applyLive() {
    const releaseId = lastPublish?.releaseId ?? authority?.latestReleaseId;
    if (!releaseId) {
      setError("먼저 게시하세요");
      return;
    }
    setBusy("apply");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/intro/live/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        note?: string;
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "apply_failed");
        return;
      }
      setMessage(
        "서비스 적용됨 — 기기 반영은 별도 확인 (서버 성공 ≠ 기기 Intro 성공)",
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!document) {
    return (
      <div className="p-6 text-sm text-sam-muted">
        {error ? error : "불러오는 중…"}
      </div>
    );
  }

  const scene = document.scenes[0];
  const textEl = scene?.elements.find((e) => e.type === "TEXT");
  const textPayload = textEl?.payload as TextPayloadV1 | undefined;
  const imageEl = scene?.elements.find((e) => e.type === "IMAGE");
  const imagePayload = imageEl?.payload as ImagePayloadV1 | undefined;
  const bgColor =
    scene?.background.type === "COLOR" ? scene.background.color : "#000000";
  const mediaUrls = Object.fromEntries(
    mediaItems
      .filter((m) => m.previewUrl)
      .map((m) => [m.mediaId, m.previewUrl as string]),
  );

  async function uploadMedia(file: File) {
    setBusy("upload");
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
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
      setMessage("미디어 준비됨");
      await loadMedia();
    } finally {
      setBusy(null);
    }
  }

  function addOrReplaceImage(mediaId: string) {
    updateScene((s) => {
      const existing = s.elements.find((e) => e.type === "IMAGE");
      if (existing) {
        return {
          ...s,
          elements: s.elements.map((el) => {
            if (el.type !== "IMAGE") return el;
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
            id: cryptoRandomId(),
            type: "IMAGE" as const,
            frame: { x: 0.1, y: 0.15, w: 0.8, h: 0.35 },
            zIndex: 0,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: {
              mediaId,
              fit: "CONTAIN" as const,
            },
          },
        ],
      };
    });
  }

  const statusDraft = `초안 v${draftVersion}`;
  const statusPublished = authority?.latestReleaseId
    ? `게시됨 ${authority.latestReleaseId.slice(0, 8)}`
    : "미게시";
  const statusLive = authority?.isLive
    ? "라이브"
    : authority?.liveReleaseId
      ? "다른 릴리스가 라이브"
      : "라이브 아님";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-intro13-studio="1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/intro" className="text-sm text-sam-muted hover:underline">
            ← 인트로 목록
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-sam-fg">
            {document.title || "Intro"}
          </h1>
          <p className="mt-1 text-xs text-sam-muted">
            {statusDraft} · {statusPublished} · {statusLive}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            className={Sam.btn.secondary}
            disabled={Boolean(busy)}
            onClick={() => void publish()}
          >
            {busy === "publish" ? "게시 중…" : "게시"}
          </button>
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={Boolean(busy)}
            onClick={() => void applyLive()}
          >
            {busy === "apply" ? "적용 중…" : "서비스 적용"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-sam-fg">{message}</p> : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="font-medium text-sam-fg">장면 1</h2>

          <label className="block text-sm">
            <span className="text-sam-muted">배경색</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={bgColor.slice(0, 7)}
                onChange={(e) => {
                  const color = e.target.value.toUpperCase();
                  updateScene((s) => ({
                    ...s,
                    background: { type: "COLOR", color },
                  }));
                }}
              />
              <input
                className={Sam.input.base}
                value={bgColor}
                onChange={(e) => {
                  const color = e.target.value;
                  updateScene((s) => ({
                    ...s,
                    background: { type: "COLOR", color },
                  }));
                }}
              />
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-sam-muted">텍스트</span>
            <input
              className={`${Sam.input.base} mt-1 w-full`}
              value={textPayload?.text ?? ""}
              onChange={(e) => {
                const text = e.target.value;
                updateScene((s) => ({
                  ...s,
                  elements: s.elements.map((el) => {
                    if (el.type !== "TEXT") return el;
                    const p = el.payload as TextPayloadV1;
                    return { ...el, payload: { ...p, text } };
                  }),
                }));
              }}
            />
          </label>

          <label className="block text-sm">
            <span className="text-sam-muted">장면 길이 (ms)</span>
            <input
              type="number"
              min={100}
              className={`${Sam.input.base} mt-1 w-40`}
              value={scene?.durationMs ?? 2500}
              onChange={(e) => {
                const durationMs = Math.max(100, Number(e.target.value) || 100);
                updateScene((s) => ({ ...s, durationMs }));
              }}
            />
          </label>

          <label className="block text-sm">
            <span className="text-sam-muted">제목</span>
            <input
              className={`${Sam.input.base} mt-1 w-full`}
              value={document.title}
              onChange={(e) =>
                setDocument((prev) =>
                  prev ? { ...prev, title: e.target.value } : prev,
                )
              }
            />
          </label>

          <div className="border-t border-sam-border pt-4">
            <h3 className="font-medium text-sam-fg">이미지</h3>
            <p className="mt-1 text-xs text-sam-muted">
              업로드 → 처리 → 검증 후 READY. 저장 시에만 문서에 반영됩니다.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-2 block w-full text-sm"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMedia(f);
                e.target.value = "";
              }}
            />
            {imagePayload ? (
              <p className="mt-2 text-xs text-sam-muted">
                장면 이미지 선택됨
              </p>
            ) : null}
            <ul className="mt-3 grid max-h-48 grid-cols-3 gap-2 overflow-auto">
              {mediaItems.map((m) => (
                <li key={m.mediaId}>
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-1 text-left"
                    onClick={() => addOrReplaceImage(m.mediaId)}
                  >
                    {m.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.previewUrl}
                        alt=""
                        className="h-16 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-16 items-center justify-center text-[10px] text-sam-muted">
                        READY
                      </div>
                    )}
                    <span className="mt-1 block truncate text-[10px] text-sam-muted">
                      {m.originalName}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-medium text-sam-fg">미리보기</h2>
          <p className="text-xs text-sam-muted">
            Admin / Android / iOS 동일 기하 해석
          </p>
          <div className="inline-block rounded-ui-rect border border-sam-border bg-black p-2">
            <IntroCanonicalPreview document={document} mediaUrls={mediaUrls} />
          </div>
        </section>
      </div>
    </div>
  );
}
