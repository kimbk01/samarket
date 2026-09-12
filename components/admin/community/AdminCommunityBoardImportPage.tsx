"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveArticleAdminListKind } from "@/lib/community-board-import/article-dedupe";
import { firstValidInlineImage, countInlineImages } from "@/lib/community-board-import/article-document";
import type { ArticleDocument } from "@/lib/community-board-import/article-document";
import type { BoardCheckResult } from "@/lib/community-board-import/board-check";
import type { BoardImportMode } from "@/lib/community-board-import/product-lock";

type Topic = { id: string; name: string; slug: string };
type Pool = { id: string; name: string; description?: string | null };
type AliasRow = {
  id: string;
  pool_id: string;
  alias_name: string;
  avatar_url: string | null;
  is_active: boolean;
};
type PoolDetail = Pool & { aliases: AliasRow[] };
type SourceRow = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  target_topic_id: string | null;
  mode: BoardImportMode;
  check_status: string | null;
  check_reasons: { code?: string; message?: string }[] | unknown;
  last_checked_at: string | null;
  last_fetched_at: string | null;
  author_pool_id: string | null;
  date_recent_min_days: number;
  date_recent_max_days: number;
  view_seed_min: number;
  view_seed_max: number;
};
type ArticleRow = {
  id: string;
  source_title: string;
  canonical_source_url: string;
  source_document: ArticleDocument;
  source_author: string | null;
  source_date_iso: string | null;
  published_post_id: string | null;
  source_changed_at: string | null;
  failure_stage: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

const field =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";

type Surface = "boards" | "articles" | "authors";

export function AdminCommunityBoardImportPage() {
  const [surface, setSurface] = useState<Surface>("boards");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [articleFilter, setArticleFilter] = useState<"all" | "new" | "published" | "source_changed" | "failed">(
    "all"
  );

  const [siteName, setSiteName] = useState("");
  const [boardName, setBoardName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetTopicId, setTargetTopicId] = useState("");
  const [mode, setMode] = useState<BoardImportMode>("MANUAL");
  const [authorPoolId, setAuthorPoolId] = useState("");
  const [dateMin, setDateMin] = useState(3);
  const [dateMax, setDateMax] = useState(10);
  const [viewMin, setViewMin] = useState(100);
  const [viewMax, setViewMax] = useState(500);
  const [checkResult, setCheckResult] = useState<BoardCheckResult | null>(null);
  const [previewByArticle, setPreviewByArticle] = useState<
    Record<
      string,
      {
        dibayTitle: string;
        dibayContent: string;
        imageCount: number;
        previewAuthorName: string | null;
        communityWrite: number;
      }
    >
  >({});
  const [poolDetails, setPoolDetails] = useState<PoolDetail[]>([]);
  const [newPoolName, setNewPoolName] = useState("");
  const [newAliasByPool, setNewAliasByPool] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        sources?: SourceRow[];
        topics?: Topic[];
        authorPools?: Pool[];
        error?: string;
      };
      if (!j.ok) {
        setError(j.error ?? "load_failed");
        return;
      }
      setSources(j.sources ?? []);
      setTopics(j.topics ?? []);
      setPools(j.authorPools ?? []);
      if (!targetTopicId && j.topics?.[0]?.id) setTargetTopicId(j.topics[0].id);
    } finally {
      setLoading(false);
    }
  }, [targetTopicId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadArticles = useCallback(async (sourceBoardId: string) => {
    const res = await fetch(
      `/api/admin/community/board-import/articles?sourceBoardId=${encodeURIComponent(sourceBoardId)}`,
      { credentials: "include", cache: "no-store" }
    );
    const j = (await res.json()) as { ok?: boolean; articles?: ArticleRow[]; error?: string };
    if (!j.ok) throw new Error(j.error ?? "articles_load_failed");
    setArticles(j.articles ?? []);
  }, []);

  async function onBoardCheck() {
    setBusy(true);
    setError(null);
    setCheckResult(null);
    try {
      const res = await fetch("/api/admin/community/board-import/board-check", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const j = (await res.json()) as { ok?: boolean; result?: BoardCheckResult; error?: string };
      if (!j.ok || !j.result) throw new Error(j.error ?? "board_check_failed");
      setCheckResult(j.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "board_check_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRegister() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/sources", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName,
          sourceBoardName: boardName,
          sourceUrl,
          targetTopicId,
          mode,
          authorPoolId: authorPoolId || null,
          dateRecentMinDays: dateMin,
          dateRecentMaxDays: dateMax,
          viewSeedMin: viewMin,
          viewSeedMax: viewMax,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        check?: BoardCheckResult;
        registration?: BoardCheckResult["registration"];
      };
      if (j.check) setCheckResult(j.check);
      if (!j.ok) {
        if (j.error === "duplicate_board") {
          setError("이미 등록된 게시판입니다. 기존 게시판을 여세요.");
        } else {
          setError(j.error ?? "register_failed");
        }
        return;
      }
      await refresh();
      setSurface("boards");
    } catch (e) {
      setError(e instanceof Error ? e.message : "register_failed");
    } finally {
      setBusy(false);
    }
  }

  const loadAuthorPools = useCallback(async () => {
    const res = await fetch("/api/admin/community/board-import/author-pools", {
      credentials: "include",
      cache: "no-store",
    });
    const j = (await res.json()) as { ok?: boolean; pools?: PoolDetail[]; error?: string };
    if (!j.ok) throw new Error(j.error ?? "pools_load_failed");
    setPoolDetails(j.pools ?? []);
    setPools((j.pools ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description })));
  }, []);

  useEffect(() => {
    if (surface === "authors") void loadAuthorPools().catch(() => undefined);
  }, [surface, loadAuthorPools]);

  async function onPreview(articleId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        preview?: {
          dibayTitle: string;
          dibayContent: string;
          imageCount: number;
          previewAuthorName: string | null;
          communityWrite: number;
        };
        failure_message?: string;
        error?: string;
      };
      if (!j.ok || !j.preview) {
        throw new Error(j.failure_message || j.error || "preview_failed");
      }
      setPreviewByArticle((prev) => ({
        ...prev,
        [articleId]: {
          dibayTitle: j.preview!.dibayTitle,
          dibayContent: j.preview!.dibayContent,
          imageCount: j.preview!.imageCount,
          previewAuthorName: j.preview!.previewAuthorName,
          communityWrite: j.preview!.communityWrite ?? 0,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "preview_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(articleId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/publish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        failure_stage?: string;
        failure_message?: string;
        error?: string;
      };
      if (!j.ok) {
        throw new Error(
          j.failure_message
            ? `${j.failure_stage ?? "실패"}: ${j.failure_message}`
            : j.error || "publish_failed"
        );
      }
      if (selectedSourceId) await loadArticles(selectedSourceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "publish_failed");
      if (selectedSourceId) await loadArticles(selectedSourceId);
    } finally {
      setBusy(false);
    }
  }

  async function onCreatePool() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/author-pools", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPoolName }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "pool_create_failed");
      setNewPoolName("");
      await loadAuthorPools();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "pool_create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onAddAlias(poolId: string) {
    const name = (newAliasByPool[poolId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community/board-import/author-pools/${poolId}/aliases`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliasName: name }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "alias_create_failed");
      setNewAliasByPool((prev) => ({ ...prev, [poolId]: "" }));
      await loadAuthorPools();
    } catch (e) {
      setError(e instanceof Error ? e.message : "alias_create_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleAlias(poolId: string, alias: AliasRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community/board-import/author-pools/${poolId}/aliases`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliasId: alias.id, isActive: !alias.is_active }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "alias_update_failed");
      await loadAuthorPools();
    } catch (e) {
      setError(e instanceof Error ? e.message : "alias_update_failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFetchArticles(sourceId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community/board-import/articles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBoardId: sourceId, maxArticles: 15 }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        articles?: ArticleRow[];
        summary?: unknown;
        error?: string;
      };
      if (!j.ok) throw new Error(j.error ?? "fetch_failed");
      setSelectedSourceId(sourceId);
      setArticles(j.articles ?? []);
      setSurface("articles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch_failed");
    } finally {
      setBusy(false);
    }
  }

  const topicName = useMemo(() => {
    const m = new Map(topics.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? id : "—");
  }, [topics]);

  const visibleArticles = articles.filter((a) => {
    const kind = resolveArticleAdminListKind({
      failure: Boolean(a.failure_code),
      publishedPostId: a.published_post_id,
      readableOnCommunity: Boolean(a.published_post_id),
      sourceUpdated: Boolean(a.source_changed_at),
    });
    if (articleFilter === "all") return true;
    return kind === articleFilter;
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="sam-text-section-title font-semibold text-sam-fg">외부 게시판 가져오기</h1>
        <p className="sam-text-helper text-sam-muted mt-1">
          SOURCE 검증 → 수집 → Preview(0 write) → DIBAY 게시 → Community Feed/Detail.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["boards", "외부 게시판"],
            ["articles", "수집 게시글"],
            ["authors", "작성자 풀"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={surface === k ? btnPrimary : btnGhost}
            onClick={() => setSurface(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {loading ? <p className="sam-text-body text-sam-muted">불러오는 중…</p> : null}

      {surface === "boards" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="font-semibold text-sam-fg">SOURCE 등록</h2>
            <label className="block text-sm">
              사이트명
              <input className={field} value={siteName} onChange={(e) => setSiteName(e.target.value)} />
            </label>
            <label className="block text-sm">
              SOURCE 게시판명
              <input className={field} value={boardName} onChange={(e) => setBoardName(e.target.value)} />
            </label>
            <label className="block text-sm">
              SOURCE URL
              <input
                className={field}
                placeholder="https://..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              DIBAY TARGET 게시판
              <select className={field} value={targetTopicId} onChange={(e) => setTargetTopicId(e.target.value)}>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                작성일 최근(일) min
                <input
                  type="number"
                  className={field}
                  value={dateMin}
                  onChange={(e) => setDateMin(Number(e.target.value))}
                />
              </label>
              <label className="block text-sm">
                max
                <input
                  type="number"
                  className={field}
                  value={dateMax}
                  onChange={(e) => setDateMax(Number(e.target.value))}
                />
              </label>
              <label className="block text-sm">
                조회수 seed min
                <input
                  type="number"
                  className={field}
                  value={viewMin}
                  onChange={(e) => setViewMin(Number(e.target.value))}
                />
              </label>
              <label className="block text-sm">
                max
                <input
                  type="number"
                  className={field}
                  value={viewMax}
                  onChange={(e) => setViewMax(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="block text-sm">
              작성자 풀
              <select className={field} value={authorPoolId} onChange={(e) => setAuthorPoolId(e.target.value)}>
                <option value="">미지정</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} />
                MANUAL
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "AUTO"} onChange={() => setMode("AUTO")} />
                AUTO
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGhost} disabled={busy || !sourceUrl} onClick={() => void onBoardCheck()}>
                게시판 확인
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={busy || !siteName || !boardName || !sourceUrl || !targetTopicId}
                onClick={() => void onRegister()}
              >
                등록
              </button>
            </div>

            {checkResult ? (
              <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-2 text-sm">
                <div className="font-medium">게시판 확인: {checkResult.status}</div>
                <div>접속: {checkResult.capability.reachable ? "정상" : "불가"}</div>
                <div>게시글 발견: {checkResult.capability.discoveredCount}건</div>
                <ul className="list-disc pl-5 text-sam-muted">
                  {checkResult.reasons.map((r, i) => (
                    <li key={`${r.code}-${i}`}>{r.message}</li>
                  ))}
                </ul>
                {checkResult.registration.duplicate ? (
                  <div className="rounded-ui-rect border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    이미 등록된 게시판입니다.
                    <div className="mt-1">
                      {checkResult.registration.existing.siteName} /{" "}
                      {checkResult.registration.existing.sourceBoardName} →{" "}
                      {checkResult.registration.existing.targetLabel}
                    </div>
                    <button
                      type="button"
                      className={`${btnGhost} mt-2`}
                      onClick={() => {
                        setSelectedSourceId(checkResult.registration.duplicate
                          ? checkResult.registration.existing.existingBoardId
                          : null);
                        setSurface("boards");
                      }}
                    >
                      기존 게시판 열기
                    </button>
                  </div>
                ) : (
                  <div className="text-sam-muted">등록 상태: 신규 등록 가능</div>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  {checkResult.samples.map((s, i) => (
                    <div key={i} className="rounded-ui-rect border border-sam-border p-2">
                      {s.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.thumbnailUrl} alt="" className="mb-1 h-16 w-full object-cover rounded-ui-rect" />
                      ) : (
                        <div className="mb-1 flex h-16 items-center justify-center bg-sam-surface text-xs text-sam-muted">
                          이미지 없음
                        </div>
                      )}
                      <div className="font-medium text-xs truncate">{s.title}</div>
                      <div className="text-[11px] text-sam-muted line-clamp-2">{s.bodyPreview}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="font-semibold text-sam-fg">등록된 SOURCE 게시판</h2>
            {sources.length === 0 ? (
              <p className="text-sm text-sam-muted">등록된 게시판이 없습니다.</p>
            ) : (
              sources.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-ui-rect border p-3 space-y-1 ${
                    selectedSourceId === s.id ? "border-sam-primary" : "border-sam-border"
                  }`}
                >
                  <div className="font-medium text-sam-fg">
                    {s.site_name} / {s.source_board_name}
                  </div>
                  <div className="text-xs text-sam-muted break-all">{s.source_url}</div>
                  <div className="text-xs text-sam-muted">
                    TARGET: {topicName(s.target_topic_id)} · {s.mode} · 확인: {s.check_status ?? "—"}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" className={btnGhost} disabled={busy} onClick={() => {
                      setSourceUrl(s.source_url);
                      void onBoardCheck();
                    }}>
                      게시판 확인
                    </button>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy}
                      onClick={() => void onFetchArticles(s.id)}
                    >
                      게시글 불러오기
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => {
                        setSelectedSourceId(s.id);
                        void loadArticles(s.id).then(() => setSurface("articles"));
                      }}
                    >
                      게시글 보기
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}

      {surface === "articles" ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-sam-fg">수집 게시글</h2>
            <select
              className={field + " max-w-xs"}
              value={selectedSourceId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedSourceId(id || null);
                if (id) void loadArticles(id);
              }}
            >
              <option value="">게시판 선택</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name} / {s.source_board_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "전체"],
                ["new", "신규"],
                ["published", "게시됨"],
                ["source_changed", "원문 변경"],
                ["failed", "실패"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={articleFilter === k ? btnPrimary : btnGhost}
                onClick={() => setArticleFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-sam-muted">
            Preview는 Community write 0. 게시됨은 published_post_id + Community row가 있을 때만.
          </p>
          <div className="space-y-2">
            {visibleArticles.map((a) => {
              const kind = resolveArticleAdminListKind({
                failure: Boolean(a.failure_code),
                publishedPostId: a.published_post_id,
                readableOnCommunity: Boolean(a.published_post_id),
                sourceUpdated: Boolean(a.source_changed_at),
              });
              const thumb = firstValidInlineImage(a.source_document);
              const imgCount = countInlineImages(a.source_document);
              const preview = previewByArticle[a.id];
              return (
                <div key={a.id} className="flex gap-3 rounded-ui-rect border border-sam-border p-3">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb.src} alt="" className="h-20 w-28 object-cover rounded-ui-rect" />
                  ) : (
                    <div className="flex h-20 w-28 items-center justify-center bg-sam-app text-xs text-sam-muted">
                      없음
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-sam-app px-2 py-0.5 text-[11px]">{kind}</span>
                      <span className="font-medium text-sam-fg truncate">{a.source_title}</span>
                    </div>
                    <div className="text-xs text-sam-muted">
                      이미지 {imgCount} · {a.source_author ?? "원문 작성자 —"} · {a.source_date_iso ?? "—"}
                    </div>
                    {kind === "failed" ? (
                      <div className="text-xs text-red-700">
                        {a.failure_stage}: {a.failure_message || a.failure_code}
                      </div>
                    ) : null}
                    {kind === "source_changed" ? (
                      <div className="text-xs text-amber-800">원문이 변경되었습니다 (NEW 아님 · 실패 아님)</div>
                    ) : null}
                    {kind === "published" && a.published_post_id ? (
                      <a className="text-xs text-sam-primary underline" href={`/philife/${a.published_post_id}`}>
                        DIBAY 글 보기
                      </a>
                    ) : null}
                    <a className="text-xs text-sam-muted underline" href={a.canonical_source_url} target="_blank" rel="noreferrer">
                      원문 보기
                    </a>
                    {preview ? (
                      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-2 text-xs space-y-1">
                        <div className="font-medium">Preview (Community write = {preview.communityWrite})</div>
                        <div className="truncate">{preview.dibayTitle}</div>
                        <div className="line-clamp-3 text-sam-muted whitespace-pre-wrap">{preview.dibayContent}</div>
                        <div className="text-sam-muted">
                          이미지 {preview.imageCount} · 임시 작성자 {preview.previewAuthorName ?? "—"}
                        </div>
                      </div>
                    ) : null}
                    {kind !== "published" ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy}
                          onClick={() => void onPreview(a.id)}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={busy}
                          onClick={() => void onPublish(a.id)}
                        >
                          DIBAY 게시
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {selectedSourceId && visibleArticles.length === 0 ? (
              <p className="text-sm text-sam-muted">표시할 글이 없습니다. 게시글 불러오기를 실행하세요.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {surface === "authors" ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="font-semibold text-sam-fg">작성자 풀 (import-only Alias)</h2>
          <p className="text-sm text-sam-muted">
            일반 member와 분리. Preview의 임시 선택은 DB에 고정되지 않습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className={field + " max-w-xs"}
              placeholder="새 풀 이름"
              value={newPoolName}
              onChange={(e) => setNewPoolName(e.target.value)}
            />
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !newPoolName.trim()}
              onClick={() => void onCreatePool()}
            >
              풀 생성
            </button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => void loadAuthorPools()}>
              새로고침
            </button>
          </div>
          {poolDetails.length === 0 && pools.length === 0 ? (
            <p className="text-sm text-sam-muted">등록된 풀이 없습니다. 새로고침하거나 풀을 생성하세요.</p>
          ) : (
            (poolDetails.length ? poolDetails : pools.map((p) => ({ ...p, aliases: [] as AliasRow[] }))).map(
              (p) => (
                <div key={p.id} className="rounded-ui-rect border border-sam-border p-3 space-y-2">
                  <div className="font-medium">{p.name}</div>
                  {p.description ? <div className="text-xs text-sam-muted">{p.description}</div> : null}
                  <ul className="space-y-1 text-sm">
                    {(p.aliases ?? []).map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-2">
                        <span className={a.is_active ? "text-sam-fg" : "text-sam-muted line-through"}>
                          {a.alias_name}
                        </span>
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy}
                          onClick={() => void onToggleAlias(p.id, a)}
                        >
                          {a.is_active ? "비활성" : "활성"}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className={field + " max-w-xs"}
                      placeholder="Alias 이름"
                      value={newAliasByPool[p.id] ?? ""}
                      onChange={(e) =>
                        setNewAliasByPool((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy || !(newAliasByPool[p.id] ?? "").trim()}
                      onClick={() => void onAddAlias(p.id)}
                    >
                      Alias 추가
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </section>
      ) : null}
    </div>
  );
}
