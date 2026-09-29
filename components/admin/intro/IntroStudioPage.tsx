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

  const [sceneIndex, setSceneIndex] = useState(0);

  function updateScene(mutator: (scene: SceneV1) => SceneV1) {
    setDocument((prev) => {
      if (!prev || !prev.scenes[sceneIndex]) return prev;
      const scenes = [...prev.scenes];
      scenes[sceneIndex] = mutator(scenes[sceneIndex]);
      return { ...prev, scenes };
    });
  }

  function addScene() {
    setDocument((prev) => {
      if (!prev) return prev;
      const last = prev.scenes[prev.scenes.length - 1];
      const bg =
        last?.background.type === "COLOR"
          ? last.background.color
          : "#1E293B";
      const next: SceneV1 = {
        id: cryptoRandomId(),
        durationMs: 2500,
        background: { type: "COLOR", color: bg },
        transition: { type: "CUT", durationMs: 0 },
        elements: [
          {
            id: cryptoRandomId(),
            type: "TEXT",
            frame: { x: 0.08, y: 0.42, w: 0.84, h: 0.12 },
            zIndex: 1,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: {
              text: `장면 ${prev.scenes.length + 1}`,
              color: "#FFFFFF",
              fontSizeNorm: 0.045,
              align: "center",
              weight: "bold",
            },
          },
        ],
      };
      return { ...prev, scenes: [...prev.scenes, next] };
    });
    setSceneIndex((i) => i + 1);
  }

  function setTransitionType(type: "CUT" | "FADE" | "SLIDE") {
    updateScene((s) => ({
      ...s,
      transition:
        type === "CUT"
          ? { type: "CUT", durationMs: 0 }
          : type === "FADE"
            ? { type: "FADE", durationMs: 400 }
            : { type: "SLIDE", durationMs: 400, direction: "LEFT" },
    }));
  }

  function addCta() {
    updateScene((s) => {
      if (s.elements.some((e) => e.type === "CTA")) return s;
      return {
        ...s,
        elements: [
          ...s.elements,
          {
            id: cryptoRandomId(),
            type: "CTA" as const,
            frame: { x: 0.2, y: 0.78, w: 0.6, h: 0.08 },
            zIndex: 5,
            visible: true,
            opacity: 1,
            motion: DEFAULT_MOTION,
            payload: {
              label: "시작하기",
              action: { type: "FINISH_INTRO" as const },
              backgroundColor: "#4F46E5",
              textColor: "#FFFFFF",
            },
          },
        ],
      };
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

  const scene = document.scenes[sceneIndex] ?? document.scenes[0];
  const textEl = scene?.elements.find((e) => e.type === "TEXT");
  const textPayload = textEl?.payload as TextPayloadV1 | undefined;
  const imageEl = scene?.elements.find((e) => e.type === "IMAGE");
  const imagePayload = imageEl?.payload as ImagePayloadV1 | undefined;
  const logoEl = scene?.elements.find((e) => e.type === "LOGO");
  const logoPayload = logoEl?.payload as ImagePayloadV1 | undefined;
  const bgColor =
    scene?.background.type === "COLOR" ? scene.background.color : "#000000";
  const mediaUrls = Object.fromEntries(
    mediaItems
      .filter((m) => m.previewUrl)
      .map((m) => [m.mediaId, m.previewUrl as string]),
  );

  async function uploadMedia(file: File, asLogo = false) {
    setBusy(asLogo ? "upload-logo" : "upload");
    setError(null);
    setMessage(null);
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
      setMessage(asLogo ? "로고 준비됨" : "미디어 준비됨");
      await loadMedia();
    } finally {
      setBusy(null);
    }
  }

  function addOrReplaceMediaElement(
    mediaId: string,
    kind: "IMAGE" | "LOGO",
  ) {
    updateScene((s) => {
      const existing = s.elements.find((e) => e.type === kind);
      if (existing) {
        return {
          ...s,
          elements: s.elements.map((el) => {
            if (el.type !== kind) return el;
            const p = el.payload as ImagePayloadV1;
            return { ...el, payload: { ...p, mediaId } };
          }),
        };
      }
      const frame =
        kind === "LOGO"
          ? { x: 0.3, y: 0.08, w: 0.4, h: 0.12 }
          : { x: 0.1, y: 0.15, w: 0.8, h: 0.35 };
      return {
        ...s,
        elements: [
          ...s.elements,
          {
            id: cryptoRandomId(),
            type: kind,
            frame,
            zIndex: kind === "LOGO" ? 2 : 0,
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
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-sam-fg">장면</h2>
            {document.scenes.map((_, i) => (
              <button
                key={document.scenes[i].id}
                type="button"
                className={i === sceneIndex ? Sam.btn.primary : Sam.btn.secondary}
                onClick={() => setSceneIndex(i)}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" className={Sam.btn.secondary} onClick={() => addScene()}>
              + 새 장면
            </button>
            <button type="button" className={Sam.btn.secondary} onClick={() => addCta()}>
              CTA 추가
            </button>
          </div>
          <label className="block text-sm">
            <span className="text-sam-muted">전환</span>
            <select
              className={`${Sam.input.base} mt-1 w-40`}
              value={scene?.transition.type ?? "CUT"}
              onChange={(e) =>
                setTransitionType(e.target.value as "CUT" | "FADE" | "SLIDE")
              }
            >
              <option value="CUT">CUT</option>
              <option value="FADE">FADE</option>
              <option value="SLIDE">SLIDE</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-sam-muted">텍스트 정렬</span>
            <select
              className={`${Sam.input.base} mt-1 w-40`}
              value={textPayload?.align ?? "center"}
              onChange={(e) => {
                const align = e.target.value as "left" | "center" | "right";
                updateScene((s) => ({
                  ...s,
                  elements: s.elements.map((el) => {
                    if (el.type !== "TEXT") return el;
                    const p = el.payload as TextPayloadV1;
                    return { ...el, payload: { ...p, align } };
                  }),
                }));
              }}
            >
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-sam-muted">텍스트 색</span>
            <input
              type="color"
              className="mt-1 block"
              value={(textPayload?.color ?? "#FFFFFF").slice(0, 7)}
              onChange={(e) => {
                const color = e.target.value.toUpperCase();
                updateScene((s) => ({
                  ...s,
                  elements: s.elements.map((el) => {
                    if (el.type !== "TEXT") return el;
                    const p = el.payload as TextPayloadV1;
                    return { ...el, payload: { ...p, color } };
                  }),
                }));
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-sam-muted">텍스트 모션</span>
            <select
              className={`${Sam.input.base} mt-1 w-48`}
              value={
                (textEl?.motion?.type as string) ?? "NONE"
              }
              onChange={(e) => {
                const type = e.target.value as
                  | "NONE"
                  | "FADE_IN"
                  | "ENTER_TOP"
                  | "ENTER_BOTTOM"
                  | "ENTER_LEFT"
                  | "ENTER_RIGHT"
                  | "SCALE_IN";
                updateScene((s) => ({
                  ...s,
                  elements: s.elements.map((el) => {
                    if (el.type !== "TEXT") return el;
                    return {
                      ...el,
                      motion:
                        type === "NONE"
                          ? DEFAULT_MOTION
                          : { type, startMs: 0, durationMs: 500 },
                    };
                  }),
                }));
              }}
            >
              <option value="NONE">없음</option>
              <option value="FADE_IN">페이드 인</option>
              <option value="ENTER_TOP">위에서</option>
              <option value="ENTER_BOTTOM">아래에서</option>
              <option value="ENTER_LEFT">왼쪽에서</option>
              <option value="ENTER_RIGHT">오른쪽에서</option>
              <option value="SCALE_IN">확대</option>
            </select>
          </label>

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
                if (f) void uploadMedia(f, false);
                e.target.value = "";
              }}
            />
            {imagePayload ? (
              <p className="mt-2 text-xs text-sam-muted">장면 이미지 선택됨</p>
            ) : null}
            <ul className="mt-3 grid max-h-48 grid-cols-3 gap-2 overflow-auto">
              {mediaItems
                .filter((m) => m.mediaKind !== "LOGO")
                .map((m) => (
                  <li key={m.mediaId}>
                    <button
                      type="button"
                      className="w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-1 text-left"
                      onClick={() => addOrReplaceMediaElement(m.mediaId, "IMAGE")}
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

          <div className="border-t border-sam-border pt-4">
            <h3 className="font-medium text-sam-fg">로고</h3>
            <p className="mt-1 text-xs text-sam-muted">
              로고도 동일 미디어 파이프라인. 장면 상단 기본 배치.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="mt-2 block w-full text-sm"
              disabled={Boolean(busy)}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadMedia(f, true);
                e.target.value = "";
              }}
            />
            {logoPayload ? (
              <p className="mt-2 text-xs text-sam-muted">장면 로고 선택됨</p>
            ) : null}
            <ul className="mt-3 grid max-h-40 grid-cols-3 gap-2 overflow-auto">
              {mediaItems.map((m) => (
                <li key={`logo-${m.mediaId}`}>
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-1 text-left"
                    onClick={() => addOrReplaceMediaElement(m.mediaId, "LOGO")}
                  >
                    {m.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.previewUrl}
                        alt=""
                        className="h-12 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-12 items-center justify-center text-[10px] text-sam-muted">
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
            Admin / Android / iOS 동일 기하·타임라인 해석
          </p>
          <div className="inline-block rounded-ui-rect border border-sam-border bg-black p-2">
            <IntroCanonicalPreview
              document={document}
              sceneIndex={sceneIndex}
              mediaUrls={mediaUrls}
              playTimeline
            />
          </div>
          <p className="text-[11px] text-sam-muted">
            전체 장면 duration · CUT/FADE/SLIDE · element motion 재생
          </p>
        </section>
      </div>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm space-y-3">
        <h2 className="font-medium text-sam-fg">시스템 시작 화면</h2>
        <p className="text-sam-muted">
          앱이 실행되는 동안 운영체제가 잠시 표시하는 화면입니다. Product Intro(Scene 1)와
          다릅니다. 변경 사항은 새 앱 빌드/업데이트 후 적용됩니다. 서비스 적용으로 바뀌지
          않습니다.
        </p>
        <SystemStartAdminPanel
          liveScene1Background={
            document.scenes[0]?.background.type === "COLOR"
              ? document.scenes[0].background.color
              : null
          }
        />
      </section>
    </div>
  );
}

function SystemStartAdminPanel({
  liveScene1Background,
}: {
  liveScene1Background: string | null;
}) {
  const [buildBg, setBuildBg] = useState("#312E81");
  const [draftBg, setDraftBg] = useState("#312E81");
  const [matchScene1, setMatchScene1] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/intro/system-start", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        systemStart?: {
          backgroundColor: string;
          matchScene1Appearance: boolean;
        };
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "system_start_load_failed");
        return;
      }
      setBuildBg(json.systemStart.backgroundColor);
      setDraftBg(json.systemStart.backgroundColor);
      setMatchScene1(json.systemStart.matchScene1Appearance);
    })();
  }, []);

  const live = (liveScene1Background || "").toUpperCase();
  const installed = buildBg.toUpperCase();
  const status =
    live && installed
      ? live === installed
        ? "MATCH"
        : "DIFFERENT"
      : "UNKNOWN";

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: draftBg,
          matchScene1Appearance: matchScene1,
          scene1BackgroundColor: liveScene1Background,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        systemStart?: { backgroundColor: string; matchScene1Appearance: boolean };
        message?: string;
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "save_failed");
        return;
      }
      setBuildBg(json.systemStart.backgroundColor);
      setDraftBg(json.systemStart.backgroundColor);
      setMatchScene1(json.systemStart.matchScene1Appearance);
      setMsg(
        json.message ??
          "저장됨. 새 앱 빌드/업데이트 후 반영됩니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs text-sam-muted">배경색</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(draftBg) ? draftBg : "#312E81"}
              onChange={(e) => setDraftBg(e.target.value.toUpperCase())}
              className="h-9 w-12 cursor-pointer rounded-ui-rect border border-sam-border bg-transparent"
              disabled={busy || matchScene1}
            />
            <input
              className={Sam.input.base}
              value={draftBg}
              onChange={(e) => setDraftBg(e.target.value.toUpperCase())}
              disabled={busy || matchScene1}
              spellCheck={false}
            />
          </div>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={matchScene1}
            onChange={(e) => setMatchScene1(e.target.checked)}
            disabled={busy}
          />
          <span>Scene 1 시작 화면과 맞춤</span>
        </label>
        <button
          type="button"
          className={Sam.btn.primary}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "저장 중…" : "다음 빌드에 저장"}
        </button>
      </div>
      <div
        className="h-16 w-full max-w-xs rounded-ui-rect border border-sam-border"
        style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(draftBg) ? draftBg : "#312E81" }}
        aria-label="시스템 시작 미리보기"
      />
      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 text-xs space-y-1">
        <p>
          현재 앱 빌드 시작 배경: <code className="text-sam-fg">{installed}</code>
        </p>
        <p>
          현재 Live Scene1: <code className="text-sam-fg">{live || "(없음)"}</code>
        </p>
        <p className="font-medium text-sam-fg">
          {status === "MATCH"
            ? "MATCH — 시작 화면과 Scene 1 배경이 같습니다"
            : status === "DIFFERENT"
              ? "DIFFERENT — 새 앱 빌드 후 일치 가능"
              : "상태 확인 중"}
        </p>
        <p className="text-sam-muted">
          빌드 상태: 다음 네이티브 빌드에 반영 · Live CMS/서비스 적용과 무관
        </p>
      </div>
      {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
    </div>
  );
}
