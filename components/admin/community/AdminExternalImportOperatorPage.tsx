"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  blocksToCommunityMarkdown,
  buildAppliedContentBlocks,
  defaultOperatorDraftEdit,
} from "@/lib/community-operator-import/draft-apply";
import type {
  OperatorDraftEdit,
  OperatorListRow,
  OperatorNormalizedArticle,
} from "@/lib/community-operator-import/types";

type TopicOption = { id: string; slug: string; name: string };
type Tab = "before" | "edit" | "after" | "publish";
type MobilePane = "sources" | "list" | "workspace";

type SourceMeta = {
  site: string;
  siteLabel: string;
  board: string;
  boardLabel: string;
  boardUrl: string;
  engine?: string;
};

type RegistrySource = {
  id: string;
  displayName: string;
  baseUrl: string;
  engine: string;
  status: string;
  priority?: string;
  boards: Array<{
    boardId: string;
    displayName: string;
    shortLabel: string;
    category: string;
  }>;
};

type ListRow = OperatorListRow & {
  inboxStatus?: string;
  publishedPostId?: string | null;
};

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlocksHtml(article: OperatorNormalizedArticle, edit: OperatorDraftEdit | null, mode: "before" | "after") {
  const title = mode === "before" ? article.title : edit?.displayTitle || article.title;
  const author = mode === "before" ? article.author || "" : edit?.displayAuthor || article.author || "";
  const date =
    mode === "before"
      ? article.sourcePublishedDate || ""
      : edit?.displayDate || article.sourcePublishedDate || "";
  const blocks =
    mode === "before" ? article.orderedContentBlocks : buildAppliedContentBlocks(article, edit || defaultOperatorDraftEdit(article));
  const parts: string[] = [
    `<h1 class="text-xl font-bold leading-snug mb-2 break-words">${escapeHtml(title)}</h1>`,
    `<div class="text-xs text-sam-muted mb-4 break-words">${escapeHtml(author)} · ${escapeHtml(date)}</div>`,
  ];
  for (const b of blocks) {
    if (b.type === "paragraph") parts.push(`<p class="mb-3 leading-relaxed break-words">${escapeHtml(b.text)}</p>`);
    else if (b.type === "heading")
      parts.push(`<h${b.level} class="font-semibold mt-3 mb-2 break-words">${escapeHtml(b.text)}</h${b.level}>`);
    else if (b.type === "image") {
      const src = b.displaySrc || b.url;
      parts.push(
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt || "")}" class="block w-full max-h-[360px] object-contain rounded-ui-rect border border-sam-border mb-3 bg-sam-app" loading="lazy" />`,
      );
    } else if (b.type === "quote")
      parts.push(`<blockquote class="border-l-2 pl-3 mb-3 text-sam-muted break-words">${escapeHtml(b.text)}</blockquote>`);
    else if (b.type === "list") {
      const tag = b.ordered ? "ol" : "ul";
      parts.push(
        `<${tag} class="mb-3 pl-5 list-disc">${b.items.map((it) => `<li class="break-words">${escapeHtml(it)}</li>`).join("")}</${tag}>`,
      );
    }
  }
  return parts.join("");
}

export function AdminExternalImportOperatorPage() {
  const [registry, setRegistry] = useState<RegistrySource[]>([]);
  const [sourceId, setSourceId] = useState("philsamo");
  const [boardKey, setBoardKey] = useState("travel");
  const [sourceQuery, setSourceQuery] = useState("");
  const [page, setPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [maxItems, setMaxItems] = useState(40);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [source, setSource] = useState<SourceMeta | null>(null);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifyName, setVerifyName] = useState("");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [managed, setManaged] = useState<
    Array<{
      id: string;
      displayName: string;
      baseUrl: string;
      verification: string;
      enabled: boolean;
      engine: string;
    }>
  >([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [article, setArticle] = useState<OperatorNormalizedArticle | null>(null);
  const [draft, setDraft] = useState<OperatorDraftEdit | null>(null);
  const [pending, setPending] = useState<OperatorDraftEdit | null>(null);
  const [draftMeta, setDraftMeta] = useState<{ status: string; publishedPostId: string | null } | null>(null);
  const [tab, setTab] = useState<Tab>("before");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [publishResult, setPublishResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [forceRepublish, setForceRepublish] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadList = useCallback(async (sid: string, board: string, range?: { page: number; maxPages: number; maxItems: number }) => {
    const ac = new AbortController();
    (loadList as unknown as { _ac?: AbortController })._ac?.abort();
    (loadList as unknown as { _ac?: AbortController })._ac = ac;
    const gen = `${sid}:${board}:${Date.now()}`;
    (loadList as unknown as { _gen?: string })._gen = gen;
    setLoadingList(true);
    setListError(null);
    const r = range || { page, maxPages, maxItems };
    try {
      const qs = new URLSearchParams({
        source: sid,
        board,
        page: String(r.page),
        maxPages: String(r.maxPages),
        maxItems: String(r.maxItems),
      });
      const res = await fetch(`/api/admin/community/external-import/list?${qs}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      if ((loadList as unknown as { _gen?: string })._gen !== gen) return;
      const json = await res.json();
      if (Array.isArray(json?.sources)) setRegistry(json.sources);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "목록 실패");
      setSource(json.source);
      setRows(json.rows || []);
      setSelected(new Set());
      setActiveKey(null);
      setArticle(null);
      setDraft(null);
      setPending(null);
      setDraftMeta(null);
      setPublishResult(null);
      setForceRepublish(false);
      if ((json.rows || []).length) {
        const first = json.rows[0].articleKey as string;
        setActiveKey(first);
        setSelected(new Set([first]));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if ((loadList as unknown as { _gen?: string })._gen !== gen) return;
      const msg = e instanceof Error ? e.message : "목록을 불러오지 못했습니다.";
      setListError(msg);
      setRows([]);
      setSource(null);
      showToast(msg);
    } finally {
      if ((loadList as unknown as { _gen?: string })._gen === gen) setLoadingList(false);
    }
  }, [maxItems, maxPages, page]);

  const loadTopics = useCallback(async () => {
    const res = await fetch("/api/admin/community/external-import/topics", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json?.ok) setTopics(json.topics || []);
  }, []);

  const loadDetail = useCallback(async (key: string, sid: string, board: string) => {
    const ac = new AbortController();
    (loadDetail as unknown as { _ac?: AbortController })._ac?.abort();
    (loadDetail as unknown as { _ac?: AbortController })._ac = ac;
    const gen = `${sid}:${board}:${key}:${Date.now()}`;
    (loadDetail as unknown as { _gen?: string })._gen = gen;
    setLoadingDetail(true);
    setPublishResult(null);
    try {
      const res = await fetch(
        `/api/admin/community/external-import/detail?source=${encodeURIComponent(sid)}&board=${encodeURIComponent(board)}&articleKey=${encodeURIComponent(key)}`,
        { cache: "no-store", signal: ac.signal },
      );
      if ((loadDetail as unknown as { _gen?: string })._gen !== gen) return;
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "본문 실패");
      setArticle(json.article);
      const edit = json.edit as OperatorDraftEdit;
      setDraft(edit);
      setPending(structuredClone(edit));
      setDraftMeta(json.draft ? { status: json.draft.status, publishedPostId: json.draft.publishedPostId } : null);
      setSaved(Boolean(json.draft?.id) && json.draft?.status === "draft");
      setForceRepublish(false);
      setTab("before");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if ((loadDetail as unknown as { _gen?: string })._gen !== gen) return;
      showToast(e instanceof Error ? e.message : "본문을 불러오지 못했습니다.");
      setArticle(null);
    } finally {
      if ((loadDetail as unknown as { _gen?: string })._gen === gen) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadList(sourceId, boardKey, { page, maxPages, maxItems });
    void loadTopics();
    void (async () => {
      try {
        const res = await fetch("/api/admin/community/external-import/sources", { cache: "no-store" });
        const json = await res.json();
        if (res.ok && json?.ok && Array.isArray(json.managed)) setManaged(json.managed);
      } catch {
        /* table may be missing until migration */
      }
    })();
  }, [sourceId, boardKey, page, maxPages, maxItems, loadList, loadTopics]);

  useEffect(() => {
    if (activeKey) void loadDetail(activeKey, sourceId, boardKey);
  }, [activeKey, sourceId, boardKey, loadDetail]);

  const pendingDirty = useMemo(() => {
    if (!draft || !pending) return false;
    return JSON.stringify(draft) !== JSON.stringify(pending);
  }, [draft, pending]);

  const imageBlocks = useMemo(() => {
    if (!article) return [] as { index: number; url: string; displaySrc: string | null }[];
    return article.orderedContentBlocks
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b.type === "image")
      .map((x) => ({
        index: x.i,
        url: x.b.type === "image" ? x.b.url : "",
        displaySrc: x.b.type === "image" ? x.b.displaySrc : null,
      }));
  }, [article]);

  const includedCount = useMemo(() => {
    if (!pending) return 0;
    return imageBlocks.filter((im) => pending.imageIncludes[String(im.index)] !== false).length;
  }, [imageBlocks, pending]);

  const onSelectAll = () => setSelected(new Set(rows.map((r) => r.articleKey)));
  const onClear = () => setSelected(new Set());

  const onApply = () => {
    if (!pending) return;
    setDraft(structuredClone(pending));
    setSaved(false);
    setPublishResult(null);
    setTab("after");
    showToast("적용 완료 · DIBAY 미리보기에 반영됨 · 아직 게시되지 않음");
  };

  const onCancel = () => {
    if (!draft) return;
    setPending(structuredClone(draft));
    setTab("edit");
    showToast("미적용 변경을 취소했습니다. (적용된 draft는 유지)");
  };

  const onSave = async () => {
    if (!article || !draft) return;
    if (pendingDirty) {
      showToast("아직 적용되지 않은 수정이 있습니다. 먼저 「적용」하세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/external-import/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ article, edit: draft }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "임시저장 실패");
      setSaved(true);
      showToast("임시저장 완료 · 게시 아님");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "임시저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    if (!article || !draft) return;
    if (pendingDirty) {
      showToast("미적용 수정이 있습니다. 먼저 「적용」하세요.");
      return;
    }
    const selectedKeys = [...selected];
    if (!selected.has(article.sourceArticleKey) || selectedKeys.length !== 1) {
      setTab("publish");
      showToast("선택한 글 1개만 게시 대상입니다. 선택 상태를 확인하세요.");
      return;
    }
    if (!draft.topicId || !draft.topicSlug) {
      setTab("publish");
      showToast("DIBAY 주제를 먼저 선택하세요. 기본 주제 자동 선택 없음.");
      return;
    }
    if (draftMeta?.status === "published" && draftMeta.publishedPostId && !forceRepublish) {
      setTab("publish");
      showToast("이미 게시된 글입니다. 재게시하려면 명시 확인란을 체크하세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/external-import/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          article,
          edit: draft,
          selectedArticleKeys: selectedKeys,
          forceRepublish,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "게시 실패");
      setPublishResult(json);
      setDraftMeta({ status: "published", publishedPostId: String(json.postId || "") });
      setTab("publish");
      showToast("게시 완료 · 일반 community_posts 경로");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "게시 실패");
    } finally {
      setBusy(false);
    }
  };

  const selectBoard = (sid: string, bid: string) => {
    setSourceId(sid);
    setBoardKey(bid);
    setPage(1);
    setMobilePane("list");
  };

  const filteredRegistry = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return registry;
    return registry
      .map((s) => ({
        ...s,
        boards: s.boards.filter(
          (b) =>
            s.displayName.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            b.displayName.toLowerCase().includes(q) ||
            b.category.toLowerCase().includes(q) ||
            b.shortLabel.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.displayName.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.boards.length > 0);
  }, [registry, sourceQuery]);

  const openArticle = (key: string) => {
    setActiveKey(key);
    setSelected((prev) => new Set(prev).add(key));
    setMobilePane("workspace");
  };

  // < xl: adaptive single-pane (source → list → workspace). xl+: approved 3-pane.
  // h-full under a flex page shell keeps CTA footer in the remaining viewport.
  const paneClass = (pane: MobilePane) =>
    `${mobilePane === pane ? "flex" : "hidden"} xl:flex flex-col min-h-0 min-w-0 h-full overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface`;

  return (
    <div className="flex flex-col gap-3 max-w-[100vw] overflow-x-hidden min-h-0 h-[calc(100dvh-6.5rem)] pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <div className="shrink-0">
        <AdminPageHeader
          title="외부 글 가져오기"
          description="검증된 실제 출처·게시판에서 글을 선택·수정한 뒤 DIBAY Community에 게시합니다. (OLD 워커/8단계 없음)"
        />
      </div>

      <div className="xl:hidden flex items-center gap-2 sticky top-0 z-20 shrink-0 bg-sam-app/95 backdrop-blur px-1 py-2 border-b border-sam-border">
        {mobilePane !== "sources" ? (
          <button
            type="button"
            className="sam-btn sam-btn-ghost text-xs shrink-0"
            onClick={() => setMobilePane(mobilePane === "workspace" ? "list" : "sources")}
          >
            ← 뒤로
          </button>
        ) : null}
        <div className="text-xs font-semibold truncate">
          {mobilePane === "sources"
            ? "출처 / 게시판"
            : mobilePane === "list"
              ? `${source?.siteLabel || sourceId} · ${source?.boardLabel || boardKey}`
              : `작업 · ${activeKey || "—"}`}
        </div>
        {mobilePane === "list" ? (
          <button type="button" className="ml-auto sam-btn sam-btn-ghost text-xs" onClick={() => setMobilePane("sources")}>
            출처
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[240px_minmax(280px,340px)_minmax(0,1fr)] gap-3 items-stretch flex-1 min-h-0">
        <section className={`${paneClass("sources")}`}>
          <div className="px-4 py-3 border-b border-sam-border text-sm font-semibold shrink-0">출처</div>
          <div className="p-3 space-y-3 overflow-auto">
            <input
              className="sam-input w-full text-xs"
              placeholder="출처/보드 검색"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-1.5">
              <label className="text-[10px] text-sam-muted col-span-1">
                page
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="sam-input w-full text-xs mt-0.5"
                  value={page}
                  onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="text-[10px] text-sam-muted col-span-1">
                pages
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="sam-input w-full text-xs mt-0.5"
                  value={maxPages}
                  onChange={(e) => setMaxPages(Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
                />
              </label>
              <label className="text-[10px] text-sam-muted col-span-1">
                max
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="sam-input w-full text-xs mt-0.5"
                  value={maxItems}
                  onChange={(e) => setMaxItems(Math.max(1, Math.min(100, Number(e.target.value) || 40)))}
                />
              </label>
            </div>
            {filteredRegistry.length === 0 && loadingList ? (
              <p className="text-xs text-sam-muted">레지스트리 로딩…</p>
            ) : null}
            {filteredRegistry.map((s) => {
              const isCollapsed = collapsed[s.id] === true;
              return (
              <div key={s.id} className="space-y-1.5">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 text-left"
                  onClick={() => setCollapsed((prev) => ({ ...prev, [s.id]: !isCollapsed }))}
                >
                  <div className="text-sm font-bold break-words">{s.displayName}</div>
                  <span className="text-[10px] text-sam-muted shrink-0">{isCollapsed ? "펼치기" : "접기"}</span>
                </button>
                <div className="text-[11px] text-sam-muted break-all">{s.baseUrl} · {s.engine}</div>
                {!isCollapsed ? (
                <ul className="space-y-1">
                  {s.boards.map((b) => {
                    const active = sourceId === s.id && boardKey === b.boardId;
                    return (
                      <li key={`${s.id}:${b.boardId}`}>
                        <button
                          type="button"
                          className={`w-full text-left text-xs px-2.5 py-2 rounded border break-words ${
                            active
                              ? "bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold"
                              : "border-sam-border bg-white hover:bg-sam-app"
                          }`}
                          onClick={() => selectBoard(s.id, b.boardId)}
                        >
                          {b.displayName}
                          <span className="block text-[10px] text-sam-muted font-normal">
                            {b.shortLabel} · {b.category}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                ) : null}
              </div>
            );
            })}
            <p className="text-[11px] text-sam-muted leading-relaxed">
              BLOCKED/NOT_PROVEN 출처는 운영 목록에 표시하지 않습니다. page/pages/max로 수집 범위를 지정합니다.
            </p>
            <div className="pt-2 border-t border-sam-border space-y-1.5">
              <div className="text-xs font-semibold">출처 관리 (이름·URL·검증·저장)</div>
              <input
                className="sam-input w-full text-xs"
                placeholder="출처 표시 이름"
                value={verifyName}
                onChange={(e) => setVerifyName(e.target.value)}
              />
              <input
                className="sam-input w-full text-xs"
                placeholder="https://example.com"
                value={verifyUrl}
                onChange={(e) => setVerifyUrl(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className="sam-btn sam-btn-ghost text-xs"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setVerifyResult(null);
                      try {
                        const res = await fetch("/api/admin/community/external-import/sources", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ action: "verify", url: verifyUrl }),
                        });
                        const json = await res.json();
                        if (!res.ok || !json?.ok) throw new Error(json?.error || "검증 실패");
                        setVerifyResult(
                          `${json.verdict} · ${json.engine} · list=${json.fields?.list} detail=${json.fields?.detail} body=${json.fields?.body} · ${json.reason}`,
                        );
                      } catch (e) {
                        setVerifyResult(e instanceof Error ? e.message : "검증 실패");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  게시판/출처 확인
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn-primary text-xs"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      setVerifyResult(null);
                      try {
                        const res = await fetch("/api/admin/community/external-import/sources", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            action: "register",
                            url: verifyUrl,
                            displayName: verifyName || verifyUrl,
                            enabled: true,
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok || !json?.ok) throw new Error(json?.error || "저장 실패");
                        setVerifyResult(`저장됨 · ${json.source?.id} · enabled=${json.source?.enabled}`);
                        setManaged((prev) => {
                          const rest = prev.filter((m) => m.id !== json.source.id);
                          return [json.source, ...rest];
                        });
                        await loadList(sourceId, boardKey, { page, maxPages, maxItems });
                      } catch (e) {
                        setVerifyResult(e instanceof Error ? e.message : "저장 실패");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  검증 후 저장
                </button>
              </div>
              {verifyResult ? <p className="text-[11px] break-words text-sam-muted">{verifyResult}</p> : null}
              {managed.length > 0 ? (
                <ul className="space-y-1 pt-1">
                  {managed.map((m) => (
                    <li key={m.id} className="rounded border border-sam-border p-1.5 text-[11px]">
                      <div className="font-semibold break-words">{m.displayName}</div>
                      <div className="text-sam-muted break-all">
                        {m.id} · {m.engine} · {m.verification} · {m.enabled ? "ON" : "OFF"}
                      </div>
                      <button
                        type="button"
                        className="sam-btn sam-btn-ghost text-[10px] mt-1"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              const res = await fetch("/api/admin/community/external-import/sources", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({
                                  action: m.enabled ? "disable" : "enable",
                                  sourceId: m.id,
                                }),
                              });
                              const json = await res.json();
                              if (!res.ok || !json?.ok) throw new Error(json?.error || "토글 실패");
                              setManaged((prev) => prev.map((x) => (x.id === m.id ? json.source : x)));
                              await loadList(sourceId, boardKey, { page, maxPages, maxItems });
                            } catch (e) {
                              setVerifyResult(e instanceof Error ? e.message : "토글 실패");
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                      >
                        {m.enabled ? "비활성" : "활성"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>

        <section className={`${paneClass("list")}`}>
          <div className="px-4 py-3 border-b border-sam-border text-sm font-semibold shrink-0">게시물 목록</div>
          <div className="px-3 py-2 border-b border-sam-border flex flex-wrap gap-2 shrink-0">
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onSelectAll}>
              전체 선택
            </button>
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onClear}>
              선택 해제
            </button>
          </div>
          <div className="px-4 py-2 text-xs text-sam-muted border-b border-sam-border shrink-0 break-words">
            {source?.siteLabel || sourceId} / {source?.boardLabel || boardKey} · 선택 {selected.size}개
          </div>
          {listError ? (
            <div className="m-3 text-xs rounded border border-red-200 bg-red-50 text-red-800 px-3 py-2 break-words">
              이 출처/게시판 수집 실패: {listError}
              <div className="mt-1 text-sam-muted">다른 검증 출처는 계속 사용할 수 있습니다.</div>
            </div>
          ) : null}
          <ul className="overflow-auto flex-1 min-h-0">
            {loadingList && <li className="p-4 text-sm text-sam-muted">불러오는 중…</li>}
            {!loadingList &&
              rows.map((row) => {
                const checked = selected.has(row.articleKey);
                const active = activeKey === row.articleKey;
                return (
                  <li
                    key={row.articleKey}
                    className={`grid grid-cols-[22px_56px_minmax(0,1fr)] gap-2 px-3 py-2.5 border-b border-sam-border cursor-pointer ${active ? "bg-emerald-50" : ""}`}
                    onClick={() => openArticle(row.articleKey)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(row.articleKey);
                          else next.delete(row.articleKey);
                          return next;
                        });
                      }}
                    />
                    {row.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.thumbnailUrl} alt="" className="w-14 h-10 object-cover rounded bg-sam-app" />
                    ) : (
                      <div className="w-14 h-10" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug break-words">{row.title}</div>
                      <div className="text-[11px] text-sam-muted mt-0.5 break-words">
                        {row.author || "—"} · {row.sourcePublishedDate || "—"}
                        {row.inboxStatus ? ` · ${row.inboxStatus}` : ""}
                        {row.publishedPostId ? ` · post:${row.publishedPostId.slice(0, 8)}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>

        <section className={`${paneClass("workspace")}`}>
          <div className="px-4 py-3 border-b border-sam-border flex justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                선택됨 · {activeKey || "—"}
              </div>
              <div className="text-xs text-sam-muted mt-1 break-words">
                {article ? `${article.sourceSite} / ${article.sourceBoard}` : "—"} · 임시저장:{" "}
                {saved ? "됨" : "안 함"} · 게시:{" "}
                {draftMeta?.status === "published" ? `됨(${draftMeta.publishedPostId || "—"})` : publishResult ? "완료" : "안 함"}{" "}
                · 미적용: {pendingDirty ? "있음" : "없음"}
              </div>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-sam-border flex flex-wrap gap-1.5 shrink-0">
            {(
              [
                ["before", "원문 미리보기"],
                ["edit", "수정/치환"],
                ["after", "DIBAY 미리보기"],
                ["publish", "주제 · 게시"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`text-xs px-2.5 py-1.5 rounded border ${tab === k ? "bg-sam-fg text-white border-sam-fg" : "border-sam-border bg-white"}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 overflow-auto flex-1 min-h-0 min-w-0">
            {loadingDetail && <div className="text-sm text-sam-muted">본문 불러오는 중…</div>}
            {!loadingDetail && !article && <div className="text-sm text-sam-muted">글을 선택하세요.</div>}
            {!loadingDetail && article && tab === "before" && (
              <div>
                <div className="text-xs text-sam-muted mb-2">BEFORE · SOURCE NORMALIZED</div>
                <div dangerouslySetInnerHTML={{ __html: renderBlocksHtml(article, null, "before") }} />
              </div>
            )}
            {!loadingDetail && article && pending && tab === "edit" && (
              <div className="space-y-3">
                <div className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                  수정은 자동 적용되지 않습니다. <b>적용</b>을 눌러야 DIBAY 미리보기에 반영됩니다.{" "}
                  <b>임시저장</b>과 <b>게시</b>는 서로 다릅니다.
                </div>
                <label className="block text-xs text-sam-muted">제목</label>
                <input
                  className="sam-input w-full"
                  value={pending.displayTitle}
                  onChange={(e) => setPending({ ...pending, displayTitle: e.target.value })}
                />
                <label className="block text-xs text-sam-muted">표시 작성자</label>
                <input
                  className="sam-input w-full"
                  value={pending.displayAuthor}
                  onChange={(e) => setPending({ ...pending, displayAuthor: e.target.value })}
                />
                <label className="block text-xs text-sam-muted">표시 날짜</label>
                <input
                  className="sam-input w-full"
                  value={pending.displayDate}
                  onChange={(e) => setPending({ ...pending, displayDate: e.target.value })}
                />
                <label className="block text-xs text-sam-muted">본문 치환 — 찾을 내용</label>
                <input
                  className="sam-input w-full"
                  value={pending.replaceFrom}
                  onChange={(e) => setPending({ ...pending, replaceFrom: e.target.value })}
                  placeholder="예: 오카다 마닐라"
                />
                <label className="block text-xs text-sam-muted">바꿀 내용</label>
                <input
                  className="sam-input w-full"
                  value={pending.replaceTo}
                  onChange={(e) => setPending({ ...pending, replaceTo: e.target.value })}
                  placeholder="예: 오카다 마닐라 리조트"
                />

                <div className="text-sm font-semibold pt-2">본문 블록 편집/제외</div>
                <div className="space-y-2 max-h-64 overflow-auto border border-sam-border rounded p-2">
                  {article.orderedContentBlocks.map((b, i) => {
                    if (b.type === "image") return null;
                    const excluded = pending.blockExcludes?.[String(i)] === true;
                    const textVal =
                      pending.textOverrides?.[String(i)] ??
                      (b.type === "list" ? b.items.join("\n") : "text" in b ? String(b.text || "") : "");
                    return (
                      <div key={i} className={`rounded border border-sam-border p-2 ${excluded ? "opacity-40" : ""}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[11px] text-sam-muted">
                            #{i} {b.type}
                          </span>
                          <label className="text-[11px]">
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={(e) =>
                                setPending({
                                  ...pending,
                                  blockExcludes: {
                                    ...(pending.blockExcludes || {}),
                                    [String(i)]: !e.target.checked,
                                  },
                                })
                              }
                            />{" "}
                            포함
                          </label>
                        </div>
                        {(b.type === "paragraph" ||
                          b.type === "heading" ||
                          b.type === "quote" ||
                          b.type === "list") && (
                          <textarea
                            className="sam-input w-full text-xs min-h-[56px]"
                            value={textVal}
                            disabled={excluded}
                            onChange={(e) =>
                              setPending({
                                ...pending,
                                textOverrides: {
                                  ...(pending.textOverrides || {}),
                                  [String(i)]: e.target.value,
                                },
                              })
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-sm font-semibold pt-2">
                  이미지 포함 ({includedCount}/{imageBlocks.length}) · 피드 썸네일 선택 · 순서
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {imageBlocks.map((im, ord) => {
                    const on = pending.imageIncludes[String(im.index)] !== false;
                    const isThumb = pending.thumbnailImageIndex === im.index;
                    return (
                      <div
                        key={im.index}
                        className={`border border-sam-border rounded p-1.5 text-[11px] ${on ? "" : "opacity-40"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={im.displaySrc || im.url}
                          alt=""
                          className="w-full h-20 object-cover rounded mb-1"
                        />
                        <label className="block">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const nextIncludes = {
                                ...pending.imageIncludes,
                                [String(im.index)]: e.target.checked,
                              };
                              let nextOrder = [...(pending.imageOrder || imageBlocks.map((x) => x.index))];
                              if (e.target.checked && !nextOrder.includes(im.index)) nextOrder.push(im.index);
                              if (!e.target.checked) nextOrder = nextOrder.filter((x) => x !== im.index);
                              setPending({
                                ...pending,
                                imageIncludes: nextIncludes,
                                imageOrder: nextOrder,
                                thumbnailImageIndex:
                                  !e.target.checked && pending.thumbnailImageIndex === im.index
                                    ? nextOrder[0] ?? null
                                    : pending.thumbnailImageIndex,
                              });
                            }}
                          />{" "}
                          #{ord + 1} 포함
                        </label>
                        <label className="block mt-1">
                          <input
                            type="radio"
                            name="thumb"
                            checked={isThumb}
                            disabled={!on}
                            onChange={() => setPending({ ...pending, thumbnailImageIndex: im.index })}
                          />{" "}
                          피드 썸네일
                        </label>
                        <div className="flex gap-1 mt-1">
                          <button
                            type="button"
                            className="sam-btn sam-btn-ghost text-[10px] px-1"
                            disabled={!on}
                            onClick={() => {
                              const order = [...(pending.imageOrder || imageBlocks.map((x) => x.index))];
                              const at = order.indexOf(im.index);
                              if (at <= 0) return;
                              [order[at - 1], order[at]] = [order[at], order[at - 1]];
                              setPending({ ...pending, imageOrder: order });
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="sam-btn sam-btn-ghost text-[10px] px-1"
                            disabled={!on}
                            onClick={() => {
                              const order = [...(pending.imageOrder || imageBlocks.map((x) => x.index))];
                              const at = order.indexOf(im.index);
                              if (at < 0 || at >= order.length - 1) return;
                              [order[at], order[at + 1]] = [order[at + 1], order[at]];
                              setPending({ ...pending, imageOrder: order });
                            }}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!loadingDetail && article && draft && tab === "after" && (
              <div>
                <div className="text-xs text-sam-muted mb-2">AFTER · DIBAY Community Detail 근사 미리보기</div>
                <div
                  className="rounded-ui-rect border border-sam-border p-4 bg-white overflow-x-hidden"
                  dangerouslySetInnerHTML={{ __html: renderBlocksHtml(article, draft, "after") }}
                />
                <pre className="mt-3 text-[10px] text-sam-muted whitespace-pre-wrap break-all hidden">
                  {blocksToCommunityMarkdown(buildAppliedContentBlocks(article, draft)).slice(0, 200)}
                </pre>
              </div>
            )}
            {!loadingDetail && article && draft && tab === "publish" && (
              <div className="space-y-3">
                <div className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                  게시 대상은 <b>선택한 글만</b>입니다. 수집된 전체 글을 게시하지 않습니다. 공개 출처 블록 없음.
                </div>
                <label className="block text-xs text-sam-muted">DIBAY 주제 (실제 Community topic SSOT)</label>
                <select
                  className="sam-input w-full"
                  value={draft.topicId || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const t = topics.find((x) => x.id === id);
                    const next = {
                      ...draft,
                      topicId: t?.id || null,
                      topicSlug: t?.slug || null,
                    };
                    setDraft(next);
                    setPending({ ...pending!, topicId: next.topicId, topicSlug: next.topicSlug });
                    setPublishResult(null);
                  }}
                >
                  <option value="">주제 선택 (필수 · 기본값 없음)</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
                {draftMeta?.status === "published" && draftMeta.publishedPostId ? (
                  <label className="flex items-start gap-2 text-xs rounded border border-amber-300 bg-amber-50 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={forceRepublish}
                      onChange={(e) => setForceRepublish(e.target.checked)}
                    />
                    <span>
                      이미 게시됨 ({draftMeta.publishedPostId}). 새 community_posts로 <b>재게시</b>하려면 명시 확인.
                    </span>
                  </label>
                ) : null}
                <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm space-y-1">
                  <div className="font-semibold">게시 대상 확인</div>
                  <div className="break-words">
                    선택: <b>{[...selected].join(", ") || "(없음)"}</b> · 작업 본문: <b>{article.sourceArticleKey}</b>
                  </div>
                  <div className="break-words">
                    주제: <b>{topics.find((t) => t.id === draft.topicId)?.name || "미선택"}</b>
                  </div>
                  <div>임시저장: {saved ? "됨" : "안 함"}</div>
                  {publishResult ? (
                    <pre className="mt-2 text-[11px] bg-white border border-sam-border rounded p-2 overflow-auto">
                      {JSON.stringify(publishResult, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="px-3 py-2.5 border-t border-sam-border bg-sam-app flex flex-wrap gap-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={() => setTab("after")}>
              DIBAY 미리보기
            </button>
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={() => setTab("edit")}>
              수정/치환
            </button>
            <button type="button" className="sam-btn sam-btn-primary text-xs" onClick={onApply} disabled={!pending}>
              적용
            </button>
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onCancel}>
              취소
            </button>
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={() => void onSave()} disabled={busy}>
              임시저장
            </button>
            <button
              type="button"
              className="sam-btn sam-btn-primary text-xs"
              onClick={() => void onPublish()}
              disabled={busy}
            >
              게시
            </button>
          </div>
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 max-w-sm rounded-lg bg-sam-fg text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
