"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sam } from "@/lib/ui/css-vars";
import { isOperatorVisibleTitle } from "@/lib/intro/admin/operator-classification";
import { IntroAdminTabs, useIntroAdminTab } from "@/components/admin/intro/IntroAdminTabs";
import { IntroSystemStartPanel } from "@/components/admin/intro/IntroSystemStartPanel";
import { IntroMediaLibraryPanel } from "@/components/admin/intro/IntroMediaLibraryPanel";

type DocRow = {
  document_id: string;
  title: string;
  draft_version: number;
  updated_at: string;
  sceneCount: number;
  totalDurationMs: number;
  scene1Background:
    | { type: "COLOR"; color: string }
    | { type: "IMAGE"; mediaId: string }
    | null;
  classification: string;
  status: "DRAFT" | "PUBLISHED" | "LIVE";
  latestReleaseId: string | null;
  isLive: boolean;
};

function formatDuration(ms: number): string {
  const s = Math.round(ms) / 1000;
  return Number.isInteger(s) ? `${s}초` : `${s.toFixed(1)}초`;
}

function statusLabel(row: DocRow): string {
  if (row.isLive) return "현재 서비스 적용";
  if (row.status === "PUBLISHED") return "게시됨";
  return "초안";
}

export function IntroDocumentHub() {
  const router = useRouter();
  const tab = useIntroAdminTab();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [showQa, setShowQa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const dRes = await fetch("/api/admin/intro/documents", { cache: "no-store" });
    const dJson = (await dRes.json()) as {
      ok: boolean;
      documents?: DocRow[];
      error?: string;
    };
    if (!dJson.ok) {
      setError(dJson.error ?? "list_failed");
      return;
    }
    setDocs(dJson.documents ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(
    () =>
      docs.filter((d) =>
        isOperatorVisibleTitle(d.title, { includeQa: showQa, isLive: d.isLive }),
      ),
    [docs, showQa],
  );

  const liveDoc = docs.find((d) => d.isLive) ?? null;
  const qaHiddenCount = docs.filter(
    (d) => !d.isLive && !isOperatorVisibleTitle(d.title, { includeQa: false }),
  ).length;

  async function createDoc() {
    const title = window.prompt("인트로 이름", "DIBAY GRAND OPENING");
    if (title == null || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intro/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        document?: { document_id: string };
        error?: string;
      };
      if (!json.ok || !json.document) {
        setError(json.error ?? "create_failed");
        return;
      }
      router.push(`/admin/intro/${json.document.document_id}`);
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intro/documents/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        document?: { document_id: string };
        error?: string;
      };
      if (!json.ok || !json.document) {
        setError(json.error ?? "duplicate_failed");
        return;
      }
      await reload();
      router.push(`/admin/intro/${json.document.document_id}`);
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function rename(id: string, current: string) {
    const next = window.prompt("인트로 이름", current);
    if (next == null || !next.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intro/documents/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", title: next.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "rename_failed");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function applyLive(id: string, releaseId: string | null) {
    if (!releaseId) {
      setError("먼저 편집 화면에서 게시하세요");
      return;
    }
    if (!window.confirm("이 인트로를 서비스에 적용할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/intro/live/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "apply_failed");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  async function remove(id: string, isLive: boolean) {
    if (isLive) {
      setError("현재 서비스 적용 중인 인트로는 삭제할 수 없습니다. 먼저 다른 인트로를 적용하세요.");
      setMenuId(null);
      return;
    }
    if (!window.confirm("이 인트로를 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/intro/documents/${id}/actions`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "delete_failed");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
      setMenuId(null);
    }
  }

  return (
    <div className="space-y-6" data-intro13-hub="1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-sam-fg">인트로</h1>
          <p className="mt-1 text-sm text-sam-muted">
            Product Intro와 OS 시스템 시작 화면을 운영합니다.
          </p>
        </div>
        {tab === "intros" ? (
          <button
            type="button"
            className={Sam.btn.primary}
            disabled={busy}
            onClick={() => void createDoc()}
          >
            새 인트로
          </button>
        ) : null}
      </div>

      <IntroAdminTabs active={tab} />

      {tab === "system-start" ? <IntroSystemStartPanel /> : null}
      {tab === "media" ? <IntroMediaLibraryPanel /> : null}

      {tab === "intros" ? (
        <>
          {liveDoc ? (
            <div
              className="overflow-hidden rounded-ui-rect border-2 border-emerald-500 bg-sam-surface shadow-sm"
              data-intro13-live-card="1"
            >
              <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
                <SceneThumb bg={liveDoc.scene1Background} tall />
                <div className="flex flex-col justify-between p-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                        <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                        현재 서비스 적용
                      </span>
                      <span className="text-xs text-sam-muted">LIVE</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-sam-fg">
                      {liveDoc.title || "Intro"}
                    </h2>
                    <p className="mt-1 text-sm text-sam-muted">
                      Scene {liveDoc.sceneCount} · {formatDuration(liveDoc.totalDurationMs)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/admin/intro/${liveDoc.document_id}`}
                      className={Sam.btn.primary}
                    >
                      편집
                    </Link>
                    <Link
                      href={`/admin/intro/${liveDoc.document_id}?preview=1`}
                      className={Sam.btn.secondary}
                    >
                      미리보기
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-4 text-sm text-sam-muted">
              현재 서비스 적용 중인 인트로가 없습니다.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-sam-fg">인트로 목록</h2>
            <label className="flex items-center gap-2 text-xs text-sam-muted">
              <input
                type="checkbox"
                checked={showQa}
                onChange={(e) => setShowQa(e.target.checked)}
              />
              개발/QA 데이터 표시
              {qaHiddenCount > 0 && !showQa ? ` (${qaHiddenCount}개 숨김)` : null}
            </label>
          </div>

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.length === 0 ? (
              <li className="col-span-full rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-sm text-sam-muted">
                운영용 인트로가 없습니다. 「새 인트로」로 만드세요.
              </li>
            ) : (
              visible.map((d) => (
                <li
                  key={d.document_id}
                  className={`relative overflow-hidden rounded-ui-rect border bg-sam-surface ${
                    d.isLive
                      ? "border-emerald-500 ring-1 ring-emerald-500/40"
                      : "border-sam-border"
                  }`}
                >
                  <div className="flex gap-3 p-3">
                    <SceneThumb bg={d.scene1Background} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/intro/${d.document_id}`}
                            className="block truncate font-medium text-sam-fg hover:underline"
                          >
                            {d.title || "Intro"}
                          </Link>
                          <p className="mt-0.5 text-xs text-sam-muted">
                            Scene {d.sceneCount} · {formatDuration(d.totalDurationMs)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className={`${Sam.btn.secondary} px-2 py-1 text-xs`}
                          onClick={() =>
                            setMenuId((cur) =>
                              cur === d.document_id ? null : d.document_id,
                            )
                          }
                          aria-label="관리 메뉴"
                        >
                          ⋯
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {d.isLive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            현재 서비스 적용
                          </span>
                        ) : (
                          <span className="rounded-full bg-sam-app px-2 py-0.5 text-[11px] text-sam-muted">
                            {statusLabel(d)}
                          </span>
                        )}
                        {d.classification === "QA" ||
                        d.classification === "SYSTEM_TEST" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                            {d.classification}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-sam-muted">
                        {new Date(d.updated_at).toLocaleString()}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Link
                          href={`/admin/intro/${d.document_id}`}
                          className={`${Sam.btn.secondary} px-2 py-1 text-xs`}
                        >
                          편집
                        </Link>
                        <Link
                          href={`/admin/intro/${d.document_id}?preview=1`}
                          className={`${Sam.btn.secondary} px-2 py-1 text-xs`}
                        >
                          미리보기
                        </Link>
                      </div>
                    </div>
                  </div>
                  {menuId === d.document_id ? (
                    <div className="absolute right-3 top-12 z-10 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface p-1 shadow-lg">
                      <MenuBtn
                        label="복제"
                        disabled={busy}
                        onClick={() => void duplicate(d.document_id)}
                      />
                      <MenuBtn
                        label="이름 변경"
                        disabled={busy}
                        onClick={() => void rename(d.document_id, d.title)}
                      />
                      <MenuBtn
                        label="서비스 적용"
                        disabled={busy || d.isLive || !d.latestReleaseId}
                        onClick={() =>
                          void applyLive(d.document_id, d.latestReleaseId)
                        }
                      />
                      <MenuBtn
                        label={d.isLive ? "삭제 불가 (LIVE)" : "삭제"}
                        disabled={busy || d.isLive}
                        danger
                        onClick={() => void remove(d.document_id, d.isLive)}
                      />
                    </div>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function SceneThumb({
  bg,
  tall,
}: {
  bg: DocRow["scene1Background"];
  tall?: boolean;
}) {
  const color =
    bg?.type === "COLOR" ? bg.color : "#1E293B";
  return (
    <div
      className={`shrink-0 overflow-hidden rounded-ui-rect border border-sam-border ${
        tall ? "min-h-[120px] w-full sm:w-[140px]" : "h-24 w-16"
      }`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {bg?.type === "COLOR" ? (
        <div className="flex h-full items-end p-1.5">
          <span className="rounded bg-black/40 px-1 text-[9px] text-white">
            {bg.color}
          </span>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-white/80">
          IMG
        </div>
      )}
    </div>
  );
}

function MenuBtn({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`block w-full rounded-ui-rect px-3 py-2 text-left text-sm hover:bg-sam-app disabled:opacity-40 ${
        danger ? "text-red-600" : "text-sam-fg"
      }`}
    >
      {label}
    </button>
  );
}
