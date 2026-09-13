"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EXTERNAL_BOARD_OWNER_E2E_GATE,
} from "@/lib/external-board-import/owner-e2e-gate";
import { EXTERNAL_BOARD_PRODUCT_NAME } from "@/lib/external-board-import/product-lock";
import { RIGHTS_PUBLIC_IS_NOT_REPUBLISH } from "@/lib/external-board-import/rights/rights-gate";

type Source = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  check_status: string | null;
  rights_status: string;
  rights_basis: string | null;
  mode: string;
  target_topic_slug: string | null;
  author_pool_id: string | null;
};

type Article = {
  id: string;
  source_id: string;
  source_title: string;
  canonical_source_url: string;
  ops_status: string;
  article_signal: string | null;
  published_post_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  source_document?: { nodes?: unknown[] };
};

type Pool = { id: string; name: string };

const field =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";

type Surface = "boards" | "articles" | "authors";

export function AdminExternalBoardImportPage() {
  const [surface, setSurface] = useState<Surface>("boards");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [previewJson, setPreviewJson] = useState<string | null>(null);

  const [sourceUrl, setSourceUrl] = useState("");
  const [boardName, setBoardName] = useState("");
  const [rightsBasis, setRightsBasis] = useState("");
  const [targetTopicSlug, setTargetTopicSlug] = useState("");
  const [attributionRequired, setAttributionRequired] = useState(false);
  const [attributionName, setAttributionName] = useState("");
  const [boardSequenceVerified, setBoardSequenceVerified] = useState(false);
  const [mode, setMode] = useState<"MANUAL" | "AUTO">("MANUAL");
  const [operatorPublishedAt, setOperatorPublishedAt] = useState("");
  const [poolName, setPoolName] = useState("");
  const [aliasName, setAliasName] = useState("");
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/external-board/overview");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "overview_failed");
      setSources(j.sources ?? []);
      setArticles(j.articles ?? []);
      setPools(j.pools ?? []);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(`${label}: ${String((e as Error).message)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 text-sam-fg">
      <header className="space-y-1">
        <h1 className="sam-text-title font-semibold">{EXTERNAL_BOARD_PRODUCT_NAME}</h1>
        <p className="sam-text-caption text-sam-muted">
          NEW clean-room · API `/api/admin/community/external-board/*` · Real-source E2E:{" "}
          {EXTERNAL_BOARD_OWNER_E2E_GATE.status} ({EXTERNAL_BOARD_OWNER_E2E_GATE.reason})
        </p>
        <p className="sam-text-caption text-sam-muted">{RIGHTS_PUBLIC_IS_NOT_REPUBLISH}</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {(["boards", "articles", "authors"] as Surface[]).map((s) => (
          <button
            key={s}
            type="button"
            className={surface === s ? btnPrimary : btnGhost}
            onClick={() => setSurface(s)}
          >
            {s === "boards" ? "외부 게시판" : s === "articles" ? "가져온 글" : "작성자 풀"}
          </button>
        ))}
        <button type="button" className={btnGhost} disabled={busy || loading} onClick={() => void load()}>
          새로고침
        </button>
      </nav>

      {error ? <div className="rounded-ui-rect border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <p className="sam-text-body text-sam-muted">로딩…</p> : null}

      {surface === "boards" ? (
        <section className="space-y-4">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
            <h2 className="font-medium">게시판 등록</h2>
            <label className="block text-sm">
              Source URL
              <input className={field} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="block text-sm">
              Board name
              <input className={field} value={boardName} onChange={(e) => setBoardName(e.target.value)} />
            </label>
            <label className="block text-sm">
              Rights basis (required for verify/discover/publish)
              <textarea className={field} rows={2} value={rightsBasis} onChange={(e) => setRightsBasis(e.target.value)} />
            </label>
            <label className="block text-sm">
              DIBAY target topic slug
              <input className={field} value={targetTopicSlug} onChange={(e) => setTargetTopicSlug(e.target.value)} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attributionRequired}
                onChange={(e) => setAttributionRequired(e.target.checked)}
              />
              Rights policy requires Public attribution (출처 / 원문 보기)
            </label>
            {attributionRequired ? (
              <label className="block text-sm">
                Attribution display name
                <input className={field} value={attributionName} onChange={(e) => setAttributionName(e.target.value)} />
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={boardSequenceVerified}
                onChange={(e) => setBoardSequenceVerified(e.target.checked)}
              />
              Board sequence verified (CASE B chronology)
            </label>
            <label className="block text-sm">
              Mode
              <select className={field} value={mode} onChange={(e) => setMode(e.target.value as "MANUAL" | "AUTO")}>
                <option value="MANUAL">MANUAL</option>
                <option value="AUTO">AUTO</option>
              </select>
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() =>
                void run("register", async () => {
                  const res = await fetch("/api/admin/community/external-board/boards", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sourceUrl,
                      sourceBoardName: boardName || undefined,
                      rightsBasis: rightsBasis || null,
                      rightsStatus: rightsBasis.trim() ? "declared" : "missing",
                      targetTopicSlug: targetTopicSlug || null,
                      mode,
                      authorPoolId: selectedPoolId,
                      attributionRequired,
                      attributionDisplayName: attributionName || null,
                      boardSequenceVerified,
                    }),
                  });
                  const j = await res.json();
                  if (!j.ok) throw new Error(j.error || "register_failed");
                  setSelectedSourceId(j.source.id);
                  await load();
                })
              }
            >
              등록
            </button>
          </div>

          <ul className="space-y-3">
            {sources.map((s) => (
              <li key={s.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{s.source_board_name || s.site_name}</div>
                    <div className="sam-text-caption text-sam-muted break-all">{s.source_url}</div>
                    <div className="sam-text-caption mt-1">
                      check={s.check_status ?? "—"} · rights={s.rights_status} · mode={s.mode} · topic=
                      {s.target_topic_slug ?? "—"}
                    </div>
                  </div>
                  <button type="button" className={btnGhost} onClick={() => setSelectedSourceId(s.id)}>
                    선택
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() =>
                      void run("verify", async () => {
                        const res = await fetch(`/api/admin/community/external-board/boards/${s.id}/verify`, {
                          method: "POST",
                        });
                        const j = await res.json();
                        if (!j.ok) throw new Error(j.error || JSON.stringify(j));
                        await load();
                      })
                    }
                  >
                    게시판 확인
                  </button>
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() =>
                      void run("discover", async () => {
                        const res = await fetch(`/api/admin/community/external-board/boards/${s.id}/discover`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ limit: 5 }),
                        });
                        const j = await res.json();
                        if (!j.ok) throw new Error(j.error || j.failureCode || "discover_failed");
                        setSurface("articles");
                        setSelectedSourceId(s.id);
                        await load();
                      })
                    }
                  >
                    글 수집
                  </button>
                </div>
                {selectedSourceId === s.id ? (
                  <div className="mt-2 space-y-2 border-t border-sam-border pt-3">
                    <div className="sam-text-caption text-sam-muted">Replacement rules (exact string)</div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={field}
                        style={{ maxWidth: 160 }}
                        value={replaceFrom}
                        onChange={(e) => setReplaceFrom(e.target.value)}
                        placeholder="from"
                      />
                      <input
                        className={field}
                        style={{ maxWidth: 160 }}
                        value={replaceTo}
                        onChange={(e) => setReplaceTo(e.target.value)}
                        placeholder="to"
                      />
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy || !replaceFrom.trim()}
                        onClick={() =>
                          void run("add_rule", async () => {
                            const res = await fetch("/api/admin/community/external-board/replacement-rules", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                sourceId: s.id,
                                fromText: replaceFrom,
                                toText: replaceTo,
                                applyTitle: true,
                                applyBody: true,
                              }),
                            });
                            const j = await res.json();
                            if (!j.ok) throw new Error(j.error || "rule_failed");
                            setReplaceFrom("");
                            setReplaceTo("");
                          })
                        }
                      >
                        Add rule
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {surface === "articles" ? (
        <section className="space-y-3">
          <p className="sam-text-caption text-sam-muted">
            selected source: {selectedSourceId ?? "all"} · Preview writeDelta must be 0 · Publish uses NEW canonical publisher
          </p>
          {previewJson ? (
            <pre className="max-h-64 overflow-auto rounded-ui-rect border border-sam-border bg-sam-app p-3 text-xs">
              {previewJson}
            </pre>
          ) : null}
          <ul className="space-y-3">
            {articles
              .filter((a) => !selectedSourceId || a.source_id === selectedSourceId)
              .map((a) => (
                <li key={a.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2">
                  <div className="font-medium">{a.source_title || "(no title)"}</div>
                  <div className="sam-text-caption text-sam-muted break-all">{a.canonical_source_url}</div>
                  <div className="sam-text-caption">
                    ops={a.ops_status} · signal={a.article_signal ?? "—"} · nodes=
                    {Array.isArray(a.source_document?.nodes) ? a.source_document!.nodes!.length : 0} · post=
                    {a.published_post_id ?? "—"}
                  </div>
                  {a.failure_code ? (
                    <div className="sam-text-caption text-red-700">
                      {a.failure_code}: {a.failure_message}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={field}
                      style={{ maxWidth: 280 }}
                      type="datetime-local"
                      value={operatorPublishedAt}
                      onChange={(e) => setOperatorPublishedAt(e.target.value)}
                      title="CASE C MANUAL: explicit operator published_at"
                    />
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy || !operatorPublishedAt}
                      onClick={() =>
                        void run("set_operator_time", async () => {
                          const iso = new Date(operatorPublishedAt).toISOString();
                          const res = await fetch(
                            `/api/admin/community/external-board/articles/${a.id}/chronology`,
                            {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ operatorPublishedAt: iso }),
                            }
                          );
                          const j = await res.json();
                          if (!j.ok) throw new Error(j.error || "chronology_failed");
                          await load();
                        })
                      }
                    >
                      Set operator published_at
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy}
                      onClick={() =>
                        void run("fetch", async () => {
                          const res = await fetch(`/api/admin/community/external-board/articles/${a.id}`, {
                            method: "POST",
                          });
                          const j = await res.json();
                          if (!j.ok) throw new Error(j.error || j.failureCode || "fetch_failed");
                          await load();
                        })
                      }
                    >
                      Fetch snapshot
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy}
                      onClick={() =>
                        void run("preview", async () => {
                          const res = await fetch(`/api/admin/community/external-board/articles/${a.id}/preview`, {
                            method: "POST",
                          });
                          const j = await res.json();
                          setPreviewJson(JSON.stringify(j, null, 2));
                          if (!j.ok) throw new Error(j.failureMessage || j.error || "preview_failed");
                          if (j.writeDelta !== 0) throw new Error("preview_write_delta_nonzero");
                        })
                      }
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy || Boolean(a.published_post_id)}
                      onClick={() =>
                        void run("publish", async () => {
                          const res = await fetch(`/api/admin/community/external-board/articles/${a.id}/publish`, {
                            method: "POST",
                          });
                          const j = await res.json();
                          if (!j.ok && j.failureCode !== "already_published") {
                            throw new Error(j.failureMessage || j.error || "publish_failed");
                          }
                          await load();
                        })
                      }
                    >
                      MANUAL Publish
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {surface === "authors" ? (
        <section className="space-y-4">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
            <h2 className="font-medium">Import-only author pool</h2>
            <p className="sam-text-caption text-sam-muted">Member impersonation forbidden.</p>
            <label className="block text-sm">
              Pool name
              <input className={field} value={poolName} onChange={(e) => setPoolName(e.target.value)} />
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() =>
                void run("create_pool", async () => {
                  const res = await fetch("/api/admin/community/external-board/author-pools", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: poolName }),
                  });
                  const j = await res.json();
                  if (!j.ok) throw new Error(j.error || "pool_failed");
                  setSelectedPoolId(j.pool.id);
                  setPoolName("");
                  await load();
                })
              }
            >
              Create pool
            </button>
          </div>
          <ul className="space-y-2">
            {pools.map((p) => (
              <li key={p.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <button type="button" className={btnGhost} onClick={() => setSelectedPoolId(p.id)}>
                    Select
                  </button>
                </div>
                {selectedPoolId === p.id ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={field}
                      style={{ maxWidth: 240 }}
                      value={aliasName}
                      onChange={(e) => setAliasName(e.target.value)}
                      placeholder="Alias display name"
                    />
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy}
                      onClick={() =>
                        void run("add_alias", async () => {
                          const res = await fetch(
                            `/api/admin/community/external-board/author-pools/${p.id}/aliases`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ displayName: aliasName }),
                            }
                          );
                          const j = await res.json();
                          if (!j.ok) throw new Error(j.error || "alias_failed");
                          setAliasName("");
                        })
                      }
                    >
                      Add alias
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
