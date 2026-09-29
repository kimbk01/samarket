"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  IntroDocumentV1,
  SceneV1,
  TextPayloadV1,
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
  }, [load]);

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
  const bgColor =
    scene?.background.type === "COLOR" ? scene.background.color : "#000000";

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
        </section>

        <section className="space-y-2">
          <h2 className="font-medium text-sam-fg">미리보기</h2>
          <p className="text-xs text-sam-muted">
            Admin / Android / iOS 동일 기하 해석
          </p>
          <div className="inline-block rounded-ui-rect border border-sam-border bg-black p-2">
            <IntroCanonicalPreview document={document} />
          </div>
        </section>
      </div>
    </div>
  );
}
