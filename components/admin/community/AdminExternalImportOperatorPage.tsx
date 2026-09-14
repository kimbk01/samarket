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
import {
  PHILSAMO_SOURCE_SITE,
  PHILSAMO_TRAVEL_BOARD,
  PHILSAMO_TRAVEL_LABEL,
} from "@/lib/community-operator-import/types";
import { listPhilsamoBoards } from "@/lib/community-operator-import/boards";

type TopicOption = { id: string; slug: string; name: string };
type Tab = "before" | "edit" | "after" | "publish";

type SourceMeta = {
  site: string;
  siteLabel: string;
  board: string;
  boardLabel: string;
  boardUrl: string;
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
    `<h1 class="text-xl font-bold leading-snug mb-2">${escapeHtml(title)}</h1>`,
    `<div class="text-xs text-sam-muted mb-4">${escapeHtml(author)} · ${escapeHtml(date)}</div>`,
  ];
  for (const b of blocks) {
    if (b.type === "paragraph") parts.push(`<p class="mb-3 leading-relaxed">${escapeHtml(b.text)}</p>`);
    else if (b.type === "heading") parts.push(`<h${b.level} class="font-semibold mt-3 mb-2">${escapeHtml(b.text)}</h${b.level}>`);
    else if (b.type === "image") {
      const src = b.displaySrc || b.url;
      parts.push(
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt || "")}" class="block w-full max-h-[360px] object-contain rounded-ui-rect border border-sam-border mb-3 bg-sam-app" loading="lazy" />`,
      );
    } else if (b.type === "quote") parts.push(`<blockquote class="border-l-2 pl-3 mb-3 text-sam-muted">${escapeHtml(b.text)}</blockquote>`);
    else if (b.type === "list") {
      const tag = b.ordered ? "ol" : "ul";
      parts.push(
        `<${tag} class="mb-3 pl-5 list-disc">${b.items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</${tag}>`,
      );
    }
  }
  return parts.join("");
}

export function AdminExternalImportOperatorPage() {
  const [boardKey, setBoardKey] = useState(PHILSAMO_TRAVEL_BOARD);
  const [boards] = useState(() => listPhilsamoBoards());
  const [source, setSource] = useState<SourceMeta | null>(null);
  const [rows, setRows] = useState<OperatorListRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [article, setArticle] = useState<OperatorNormalizedArticle | null>(null);
  const [draft, setDraft] = useState<OperatorDraftEdit | null>(null);
  const [pending, setPending] = useState<OperatorDraftEdit | null>(null);
  const [tab, setTab] = useState<Tab>("before");
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [publishResult, setPublishResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const loadList = useCallback(async (board: string) => {
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/admin/community/external-import/list?source=${PHILSAMO_SOURCE_SITE}&board=${encodeURIComponent(board)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "목록 실패");
      setSource(json.source);
      setRows(json.rows || []);
      setSelected(new Set());
      setActiveKey(null);
      setArticle(null);
      setDraft(null);
      setPending(null);
      if ((json.rows || []).length) {
        const first = json.rows[0].articleKey as string;
        setActiveKey(first);
        setSelected(new Set([first]));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadTopics = useCallback(async () => {
    const res = await fetch("/api/admin/community/external-import/topics", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json?.ok) setTopics(json.topics || []);
  }, []);

  const loadDetail = useCallback(
    async (key: string, board: string) => {
      setLoadingDetail(true);
      setPublishResult(null);
      try {
        const res = await fetch(
          `/api/admin/community/external-import/detail?source=${PHILSAMO_SOURCE_SITE}&board=${encodeURIComponent(board)}&articleKey=${encodeURIComponent(key)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "본문 실패");
        setArticle(json.article);
        const edit = json.edit as OperatorDraftEdit;
        setDraft(edit);
        setPending(structuredClone(edit));
        setSaved(Boolean(json.draft?.id) && json.draft?.status === "draft");
        setTab("before");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "본문을 불러오지 못했습니다.");
        setArticle(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadList(boardKey);
    void loadTopics();
  }, [boardKey, loadList, loadTopics]);

  useEffect(() => {
    if (activeKey) void loadDetail(activeKey, boardKey);
  }, [activeKey, boardKey, loadDetail]);

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
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/external-import/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          article,
          edit: draft,
          selectedArticleKeys: selectedKeys,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "게시 실패");
      setPublishResult(json);
      setTab("publish");
      showToast("게시 완료 · 일반 community_posts 경로");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "게시 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="외부 글 가져오기"
        description="실제 출처 글을 확인하고 수정한 뒤, 선택한 글만 DIBAY Community에 게시합니다. (OLD 8단계 카드 UI 없음)"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[220px_340px_minmax(0,1fr)] gap-3 items-start">
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-sam-border text-sm font-semibold">출처</div>
          <div className="p-4 space-y-2">
            <div className="text-base font-bold">{source?.siteLabel || "필사모"}</div>
            <label className="block text-xs text-sam-muted">게시판 (실제 지원 보드만)</label>
            <select
              className="sam-input w-full"
              value={boardKey}
              onChange={(e) => setBoardKey(e.target.value)}
            >
              {boards.map((b) => (
                <option key={b.board} value={b.board}>
                  {b.labelKo} ({b.board})
                </option>
              ))}
            </select>
            <div className="text-sm">{source?.boardLabel || PHILSAMO_TRAVEL_LABEL}</div>
            <div className="text-xs text-sam-muted break-all">
              {source?.boardUrl || `philsamo.com · ${boardKey}`}
            </div>
            <p className="text-xs text-sam-muted leading-relaxed pt-2">
              보드를 바꾸면 가운데 목록이 다시 수집됩니다. OLD 8단계/자유 URL 크롤러 없음.
            </p>
          </div>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface overflow-hidden max-h-[calc(100vh-180px)] flex flex-col">
          <div className="px-4 py-3 border-b border-sam-border text-sm font-semibold">게시물 목록</div>
          <div className="px-3 py-2 border-b border-sam-border flex gap-2">
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onSelectAll}>
              전체 선택
            </button>
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onClear}>
              선택 해제
            </button>
          </div>
          <div className="px-4 py-2 text-xs text-sam-muted border-b border-sam-border">선택: {selected.size}개</div>
          <ul className="overflow-auto flex-1">
            {loadingList && <li className="p-4 text-sm text-sam-muted">불러오는 중…</li>}
            {!loadingList &&
              rows.map((row) => {
                const checked = selected.has(row.articleKey);
                const active = activeKey === row.articleKey;
                return (
                  <li
                    key={row.articleKey}
                    className={`grid grid-cols-[22px_56px_1fr] gap-2 px-3 py-2.5 border-b border-sam-border cursor-pointer ${active ? "bg-emerald-50" : ""}`}
                    onClick={() => {
                      setActiveKey(row.articleKey);
                      setSelected((prev) => new Set(prev).add(row.articleKey));
                    }}
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
                      <div className="w-14 h-10 rounded bg-sam-app border border-sam-border" />
                    )}
                    <div>
                      <div className="text-sm font-semibold leading-snug">{row.title}</div>
                      <div className="text-[11px] text-sam-muted mt-0.5">
                        {row.author || "—"} · {row.sourcePublishedDate || "—"}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface overflow-hidden max-h-[calc(100vh-180px)] flex flex-col min-w-0">
          <div className="px-4 py-3 border-b border-sam-border flex justify-between gap-3">
            <div>
              <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                선택됨 · {activeKey || "—"}
              </div>
              <div className="text-xs text-sam-muted mt-1">
                임시저장: {saved ? "됨" : "안 함"} · 게시: {publishResult ? "완료" : "안 함"} · 미적용 편집:{" "}
                {pendingDirty ? "있음" : "없음"}
              </div>
            </div>
            <div className="text-[11px] text-sam-muted text-right">
              내부 원문 URL은 운영용으로만 보관
              <br />
              (공개 출처 블록 없음)
            </div>
          </div>

          <div className="px-3 py-2 border-b border-sam-border flex flex-wrap gap-1.5">
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

          <div className="p-4 overflow-auto flex-1 min-h-[320px]">
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
                  className="rounded-ui-rect border border-sam-border p-4 bg-white"
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
                <div className="rounded border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm space-y-1">
                  <div className="font-semibold">게시 대상 확인</div>
                  <div>
                    선택: <b>{[...selected].join(", ") || "(없음)"}</b> · 작업 본문: <b>{article.sourceArticleKey}</b>
                  </div>
                  <div>
                    주제:{" "}
                    <b>{topics.find((t) => t.id === draft.topicId)?.name || "미선택"}</b>
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

          <div className="px-3 py-2.5 border-t border-sam-border bg-sam-app flex flex-wrap gap-2">
            <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={() => setTab("after")}>
              미리보기
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
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-sam-fg text-white text-xs px-3 py-2 shadow">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
