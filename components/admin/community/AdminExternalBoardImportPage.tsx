"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TOPIC_GROUP_LABELS,
  TOPIC_GROUP_ORDER,
  authModeLabel,
  catalogCapabilityLabel,
  filterCatalogByTopicGroup,
  findCatalogSection,
  importKindLabel,
  sourceTypeLabel,
  type TopicGroupId,
} from "@/lib/external-board-import/catalog/source-catalog";
import { languageDisplayLabel } from "@/lib/external-board-import/catalog/language";
import { buildExternalTopicProposal } from "@/lib/external-board-import/mapping/topic-proposal";

type Topic = { id: string; name: string; slug: string; name_en: string | null };
type Source = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  enabled?: boolean;
  target_topic_id: string | null;
  target_topic_slug: string | null;
  last_fetched_at?: string | null;
  collected_count?: number;
  unpublished_count?: number;
  published_count?: number;
  failed_count?: number;
};
type Article = {
  id: string;
  source_id: string;
  source_title: string;
  draft_title?: string | null;
  canonical_source_url: string;
  source_author?: string | null;
  source_published_at?: string | null;
  ops_status: string;
  edit_status?: string | null;
  publication_state?: string | null;
  published_post_id: string | null;
  failure_message: string | null;
  has_image?: boolean;
  thumbnail_url?: string | null;
  source_language?: string | null;
  display_language?: string | null;
};

const field =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";

type Surface = "boards" | "articles";
type CollectMode = "recent" | "pages" | "dates";

function transformStatus(a: Article): string {
  if (a.published_post_id || a.edit_status === "published") return "게시 완료";
  if (a.edit_status === "saved") return "저장됨";
  if (a.edit_status === "transformed" || a.edit_status === "editing") return "변환됨";
  if (a.edit_status === "collected") return "미변환";
  return "미변환";
}

function publishStatus(a: Article): string {
  if (a.publication_state === "deleted" || a.publication_state === "suppressed") {
    return "삭제됨 · 재게시 금지";
  }
  if (a.publication_state === "hidden") return "숨김 · 재게시 금지";
  if (a.publication_state === "republish_allowed") return "다시 게시 허용";
  if (a.published_post_id || a.ops_status === "published") return "게시 완료";
  if (a.ops_status === "failed") return "게시 실패";
  return "미게시";
}

function connectionResultLabel(s: Source): string {
  if (s.enabled === false) return "확인 필요";
  if ((s.failed_count ?? 0) > 0 && (s.collected_count ?? 0) === 0) return "연결 실패";
  if (s.last_fetched_at) return "정상";
  return "확인 필요";
}

export function AdminExternalBoardImportPage() {
  const [surface, setSurface] = useState<Surface>("boards");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editArticleId, setEditArticleId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);

  const [boardName, setBoardName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [topicGroup, setTopicGroup] = useState<TopicGroupId | "all">("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>("dot");

  const [collectMode, setCollectMode] = useState<CollectMode>("pages");
  const [collectLimit, setCollectLimit] = useState("30");
  const [collectPageFrom, setCollectPageFrom] = useState("1");
  const [collectPageTo, setCollectPageTo] = useState("3");
  const [collectDateFrom, setCollectDateFrom] = useState("");
  const [collectDateTo, setCollectDateTo] = useState("");

  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [articleSort, setArticleSort] = useState<"latest" | "oldest">("latest");

  const catalogSources = useMemo(
    () => filterCatalogByTopicGroup(topicGroup, catalogQuery),
    [topicGroup, catalogQuery]
  );
  const selectedCatalog = selectedSectionId ? findCatalogSection(selectedSectionId) : null;
  const topicName = useCallback(
    (id: string | null | undefined) => topics.find((t) => t.id === id)?.name ?? "—",
    [topics]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, tp] = await Promise.all([
        fetch("/api/admin/community/external-board/overview"),
        fetch("/api/admin/community/external-board/topics"),
      ]);
      const j = await ov.json();
      const tj = await tp.json();
      if (!j.ok) throw new Error(j.error || "overview_failed");
      if (!tj.ok) throw new Error(tj.error || "topics_failed");
      setSources(j.sources ?? []);
      setArticles(j.articles ?? []);
      setTopics(tj.topics ?? []);
      if (!topicId && (tj.topics ?? [])[0]?.id) setTopicId(String(tj.topics[0].id));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, [topicId]);

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

  const visibleArticles = useMemo(() => {
    const filtered = articles.filter((a) => !selectedSourceId || a.source_id === selectedSourceId);
    const sorted = [...filtered].sort((a, b) => {
      const da = a.source_published_at || "";
      const db = b.source_published_at || "";
      if (!da && !db) return a.id < b.id ? 1 : -1;
      if (!da) return 1;
      if (!db) return -1;
      const cmp = da < db ? -1 : da > db ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return articleSort === "latest" ? -cmp : cmp;
    });
    return sorted;
  }, [articles, selectedSourceId, articleSort]);
  const selectable = useMemo(
    () =>
      visibleArticles.filter((a) => {
        const blocked =
          a.publication_state === "deleted" ||
          a.publication_state === "suppressed" ||
          a.publication_state === "hidden";
        if (blocked) return false;
        if (a.published_post_id && a.publication_state !== "republish_allowed") return false;
        if (a.ops_status === "published" && a.publication_state !== "republish_allowed") return false;
        return true;
      }),
    [visibleArticles]
  );

  const topicProposal = useMemo(() => {
    if (!selectedCatalog) return null;
    return buildExternalTopicProposal({
      recommendedTopicHint: selectedCatalog.section.recommendedTopicHint,
      liveTopics: topics,
    });
  }, [selectedCatalog, topics]);
  const selectedCount = selectedIds.size;
  const publishLabel =
    selectedCount === 0
      ? "게시할 글을 선택하세요."
      : selectedCount === 1
        ? "선택 1건 게시"
        : `선택 ${selectedCount}건 게시`;

  function toggleAll(on: boolean) {
    if (!on) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectable.map((a) => a.id)));
  }

  function toggleOne(id: string, published: boolean) {
    if (published) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 text-sam-fg">
      <header className="space-y-1">
        <h1 className="sam-text-title font-semibold">외부 정보 가져오기</h1>
        <p className="sam-text-caption text-sam-muted">
          외부 게시판에서 글을 불러와 DIBAY 주제로 선택 게시합니다.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <button type="button" className={surface === "boards" ? btnPrimary : btnGhost} onClick={() => setSurface("boards")}>
          정보 소스
        </button>
        <button
          type="button"
          className={surface === "articles" ? btnPrimary : btnGhost}
          onClick={() => setSurface("articles")}
        >
          수집된 게시물
        </button>
        <button type="button" className={btnGhost} disabled={busy || loading} onClick={() => void load()}>
          새로고침
        </button>
      </nav>

      {error ? <div className="rounded-ui-rect border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}
      {loading ? <p className="sam-text-body text-sam-muted">로딩…</p> : null}

      {surface === "boards" ? (
        <section className="space-y-4">
          <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-caption text-sam-muted">
            <strong className="text-sam-fg">1. 정보 소스 선택</strong>
            {" · "}카테고리 → 정보 소스 → 세부 게시판 → DIBAY 주제 등록
            {" · "}
            <strong className="text-sam-fg">2. 수집 범위 설정</strong>
            {" · "}페이지/날짜 → 게시물 불러오기
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
            <h2 className="font-medium">필리핀 정보 소스</h2>
            <p className="sam-text-caption text-sam-muted">
              목록에 보이는 것과 실제 불러오기 가능은 다릅니다. 상태가 「사용 가능」인 항목만 등록·수집할 수 있습니다.
              현재 사용 가능이 0이면 수집 버튼이 비활성인 것이 정상입니다.
            </p>
            <label className="block text-sm">
              검색
              <input
                className={field}
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="정보 소스 · 지역 · 세부 게시판"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {TOPIC_GROUP_ORDER.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={topicGroup === g ? btnPrimary : btnGhost}
                  onClick={() => setTopicGroup(g)}
                >
                  {TOPIC_GROUP_LABELS[g]}
                </button>
              ))}
            </div>
            <ul className="space-y-3">
              {catalogSources.map((src) => {
                const availableCount = src.sections.filter((s) => s.status === "available").length;
                const open = expandedSourceId === src.sourceId;
                return (
                  <li key={src.sourceId} className="rounded-ui-rect border border-sam-border bg-sam-app p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium">{src.sourceName}</div>
                        <div className="sam-text-caption text-sam-muted">
                          {sourceTypeLabel(src.sourceType)} ·{" "}
                          {src.topicGroups.map((g) => TOPIC_GROUP_LABELS[g]).join(" · ")}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => setExpandedSourceId(open ? null : src.sourceId)}
                      >
                        {open
                          ? "닫기"
                          : availableCount > 0
                            ? `사용 가능한 항목 보기 (${availableCount})`
                            : "항목 보기"}
                      </button>
                    </div>
                    {open ? (
                      <ul className="mt-3 space-y-2 border-t border-sam-border pt-3">
                        {src.sections.map((sec) => (
                          <li
                            key={sec.sectionId}
                            className="flex flex-wrap items-center justify-between gap-2"
                          >
                            <div>
                              <div className="sam-text-body">{sec.sectionName}</div>
                              <div className="sam-text-caption text-sam-muted">
                                {catalogCapabilityLabel(sec.status)}
                                {" · "}
                                {authModeLabel(sec.authMode)}
                                {" · "}
                                {languageDisplayLabel(sec.defaultLanguage)}
                                {" · "}
                                {importKindLabel(sec.importKind)}
                              </div>
                            </div>
                            {sec.status === "available" && sec.canonicalUrl ? (
                              <button
                                type="button"
                                className={btnGhost}
                                onClick={() => {
                                  setSelectedSectionId(sec.sectionId);
                                  setSiteName(src.sourceName);
                                  setBoardName(`${src.sourceName} · ${sec.sectionName}`);
                                }}
                              >
                                선택
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
            <h2 className="font-medium">등록 · DIBAY 주제</h2>
            <div className="sam-text-caption text-sam-muted">
              선택 정보 소스:{" "}
              {selectedCatalog
                ? `${selectedCatalog.source.sourceName} · ${selectedCatalog.section.sectionName}`
                : "「사용 가능」 항목을 선택하세요. (현재 사용 가능 0이면 선택이 없습니다)"}
            </div>
            <label className="block text-sm">
              표시 이름
              <input className={field} value={boardName} onChange={(e) => setBoardName(e.target.value)} />
            </label>
            <label className="block text-sm">
              게시할 DIBAY 주제
              <select className={field} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">선택하세요</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {topicProposal?.status === "propose" ? (
              <div className="sam-text-caption rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-sam-muted">
                {topicProposal.proposalLabel}. 자동 생성되지 않습니다. 커뮤니티 주제 관리에서 확인 후
                추가하세요.
              </div>
            ) : null}
            {topicProposal?.status === "matched" && topicProposal.matchedTopicName ? (
              <div className="sam-text-caption text-sam-muted">
                추천 주제 일치: {topicProposal.matchedTopicName}
              </div>
            ) : null}
            <p className="sam-text-caption text-sam-muted">
              DIBAY에서 글을 삭제하면 같은 원문은 다시 게시되지 않습니다. 필요 시 「다시 게시 허용」만
              예외입니다.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              등록 후 사용
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() =>
                void run("등록", async () => {
                  const picked = selectedSectionId ? findCatalogSection(selectedSectionId) : null;
                  if (!picked || picked.section.status !== "available" || !picked.section.canonicalUrl) {
                    throw new Error("불러올 정보 소스 항목을 선택하세요.");
                  }
                  if (!topicId) throw new Error("게시할 DIBAY 주제를 선택하세요.");
                  const res = await fetch("/api/admin/community/external-board/boards", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      sourceUrl: picked.section.canonicalUrl,
                      sourceBoardName:
                        boardName || `${picked.source.sourceName} · ${picked.section.sectionName}`,
                      siteName: siteName || picked.source.sourceName,
                      targetTopicId: topicId,
                      enabled,
                      ...(picked.source.sourceType === "OFFICIAL"
                        ? {
                            rightsBasis: `Official public destination content — ${picked.source.sourceName}`,
                          }
                        : {}),
                    }),
                  });
                  const j = await res.json();
                  if (res.status === 409) {
                    if (j.existingSourceId) setSelectedSourceId(String(j.existingSourceId));
                    await load();
                    throw new Error(j.error || "이미 등록된 외부 게시판입니다.");
                  }
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
                      DIBAY 주제: {topicName(s.target_topic_id)} · {s.enabled === false ? "중지" : "사용"}
                    </div>
                    <div className="sam-text-caption mt-1">
                      최근 연결 {connectionResultLabel(s)} · 마지막 수집 {s.last_fetched_at ?? "—"} · 미게시{" "}
                      {s.unpublished_count ?? 0} · 게시 완료 {s.published_count ?? 0}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      setSelectedSourceId(s.id);
                      setSurface("articles");
                      setSelectedIds(new Set());
                    }}
                  >
                    관리
                  </button>
                </div>
                {selectedSourceId === s.id ? (
                  <div className="mt-2 space-y-3 border-t border-sam-border pt-3">
                    <div className="font-medium">2. 수집 범위 설정</div>
                    <p className="sam-text-caption text-sam-muted">
                      이 정보 소스가 지원하지 않는 범위는 사용할 수 없습니다. 가짜 페이지 범위는 지원하지 않습니다.
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {(
                        [
                          ["recent", "최근 글"],
                          ["pages", "페이지 범위"],
                          ["dates", "날짜 범위"],
                        ] as const
                      ).map(([v, label]) => (
                        <label key={v} className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="collectMode"
                            checked={collectMode === v}
                            onChange={() => setCollectMode(v)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {collectMode === "pages" || collectMode === "recent" ? (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="block text-sm">
                          시작 페이지
                          <input className={field} value={collectPageFrom} onChange={(e) => setCollectPageFrom(e.target.value)} />
                        </label>
                        <label className="block text-sm">
                          종료 페이지
                          <input className={field} value={collectPageTo} onChange={(e) => setCollectPageTo(e.target.value)} />
                        </label>
                        <label className="block text-sm">
                          최대 게시물 수
                          <input className={field} value={collectLimit} onChange={(e) => setCollectLimit(e.target.value)} />
                        </label>
                      </div>
                    ) : null}
                    {collectMode === "dates" ? (
                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="block text-sm">
                          시작 날짜
                          <input className={field} value={collectDateFrom} onChange={(e) => setCollectDateFrom(e.target.value)} placeholder="YYYY-MM-DD" />
                        </label>
                        <label className="block text-sm">
                          종료 날짜
                          <input className={field} value={collectDateTo} onChange={(e) => setCollectDateTo(e.target.value)} placeholder="YYYY-MM-DD" />
                        </label>
                        <label className="block text-sm">
                          최대 게시물 수
                          <input className={field} value={collectLimit} onChange={(e) => setCollectLimit(e.target.value)} />
                        </label>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={busy || s.enabled === false}
                        onClick={() =>
                          void run("게시물 불러오기", async () => {
                            const payload: Record<string, unknown> = {
                              limit: Number(collectLimit) || 30,
                            };
                            if (collectMode === "pages" || collectMode === "recent") {
                              payload.pageFrom = Number(collectPageFrom) || 1;
                              payload.pageTo =
                                collectMode === "recent" ? Number(collectPageFrom) || 1 : Number(collectPageTo) || 1;
                            } else {
                              payload.pageFrom = 1;
                              payload.pageTo = 20;
                              payload.dateFrom = collectDateFrom || null;
                              payload.dateTo = collectDateTo || null;
                            }
                            const res = await fetch(`/api/admin/community/external-board/boards/${s.id}/discover`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(payload),
                            });
                            const j = await res.json();
                            if (!j.ok) throw new Error(j.error || "불러오기 실패");
                            setSurface("articles");
                            setSelectedSourceId(s.id);
                            await load();
                          })
                        }
                      >
                        게시물 불러오기
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={busy}
                        onClick={() =>
                          void run("상태 변경", async () => {
                            const res = await fetch(`/api/admin/community/external-board/boards/${s.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ enabled: s.enabled === false }),
                            });
                            const j = await res.json();
                            if (!j.ok) throw new Error(j.error || "patch_failed");
                            await load();
                          })
                        }
                      >
                        {s.enabled === false ? "사용으로 전환" : "중지로 전환"}
                      </button>
                    </div>
                    <div className="space-y-2 border-t border-sam-border pt-3">
                      <div className="font-medium text-sm">치환 규칙</div>
                      <div className="flex flex-wrap gap-2">
                        <input className={field} style={{ maxWidth: 160 }} value={replaceFrom} onChange={(e) => setReplaceFrom(e.target.value)} placeholder="찾을 단어" />
                        <input className={field} style={{ maxWidth: 160 }} value={replaceTo} onChange={(e) => setReplaceTo(e.target.value)} placeholder="바꿀 단어" />
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={busy || !replaceFrom.trim()}
                          onClick={() =>
                            void run("치환 규칙", async () => {
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
                          + 치환 규칙 추가
                        </button>
                      </div>
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
          <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-caption text-sam-muted">
            <strong className="text-sam-fg">3. 게시물 선택 및 변환</strong>
            {" · "}선택 · 정렬 · 미리보기
            {" · "}
            <strong className="text-sam-fg">4. DIBAY 게시</strong>
            {" · "}변환 적용 → 저장 → 선택 게시
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btnGhost} disabled={busy} onClick={() => toggleAll(true)}>
              전체 선택
            </button>
            <button type="button" className={btnGhost} disabled={busy} onClick={() => toggleAll(false)}>
              전체 해제
            </button>
            <button
              type="button"
              className={articleSort === "latest" ? btnPrimary : btnGhost}
              disabled={busy}
              onClick={() => setArticleSort("latest")}
            >
              최신순
            </button>
            <button
              type="button"
              className={articleSort === "oldest" ? btnPrimary : btnGhost}
              disabled={busy}
              onClick={() => setArticleSort("oldest")}
            >
              오래된순
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={busy || selectedCount === 0}
              onClick={() => {
                const first = visibleArticles.find((a) => selectedIds.has(a.id));
                if (!first) return;
                setPreviewText(
                  `미리보기 (DB 게시 없음)\n제목: ${first.draft_title || first.source_title}\n원문: ${first.canonical_source_url}`
                );
              }}
            >
              선택 미리보기
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || selectedCount === 0}
              onClick={() =>
                void run("선택 게시", async () => {
                  const ids = [...selectedIds];
                  if (ids.length === 0) throw new Error("게시할 글을 선택하세요.");
                  const res = await fetch("/api/admin/community/external-board/articles/publish-selected", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ articleIds: ids }),
                  });
                  const j = await res.json();
                  if (!j.ok && j.published === 0) throw new Error(j.error || "게시 실패");
                  setSelectedIds(new Set());
                  await load();
                })
              }
            >
              {publishLabel}
            </button>
          </div>
          {selectedSource ? (
            <p className="sam-text-caption text-sam-muted">
              {selectedSource.source_board_name} · DIBAY {topicName(selectedSource.target_topic_id)}
            </p>
          ) : null}
          {previewText ? (
            <pre className="max-h-40 overflow-auto rounded-ui-rect border border-sam-border bg-sam-app p-3 text-xs whitespace-pre-wrap">
              {previewText}
            </pre>
          ) : null}

          <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
            <table className="min-w-full text-sm">
              <thead className="bg-sam-surface">
                <tr className="text-left">
                  <th className="p-2">
                    <input
                      type="checkbox"
                      checked={selectable.length > 0 && selectable.every((a) => selectedIds.has(a.id))}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="p-2">썸네일</th>
                  <th className="p-2">제목</th>
                  <th className="p-2">원문 작성자</th>
                  <th className="p-2">원문 작성일</th>
                  <th className="p-2">언어</th>
                  <th className="p-2">DIBAY 주제</th>
                  <th className="p-2">변환 상태</th>
                  <th className="p-2">게시 상태</th>
                  <th className="p-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {visibleArticles.map((a) => {
                  const blocked =
                    a.publication_state === "deleted" ||
                    a.publication_state === "suppressed" ||
                    a.publication_state === "hidden";
                  const published =
                    Boolean(a.published_post_id) && a.publication_state !== "republish_allowed";
                  const canSelect = selectable.some((s) => s.id === a.id);
                  const src = sources.find((s) => s.id === a.source_id);
                  return (
                    <tr key={a.id} className="border-t border-sam-border align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={canSelect && selectedIds.has(a.id)}
                          onChange={() => toggleOne(a.id, !canSelect)}
                        />
                      </td>
                      <td className="p-2">
                        {a.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.thumbnail_url} alt="" className="h-12 w-16 rounded-ui-rect object-cover" />
                        ) : (
                          <span className="sam-text-caption text-sam-muted">이미지 없음</span>
                        )}
                      </td>
                      <td className="p-2 max-w-[14rem]">
                        <div className="font-medium line-clamp-2">{a.draft_title || a.source_title}</div>
                      </td>
                      <td className="p-2">{a.source_author ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">{a.source_published_at?.slice(0, 10) ?? "—"}</td>
                      <td className="p-2">
                        {languageDisplayLabel(a.display_language || a.source_language)}
                      </td>
                      <td className="p-2">{topicName(src?.target_topic_id)}</td>
                      <td className="p-2">{transformStatus(a)}</td>
                      <td className="p-2">{publishStatus(a)}</td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <a className="text-sam-primary underline" href={a.canonical_source_url} target="_blank" rel="noreferrer">
                            원문 보기
                          </a>
                          <button
                            type="button"
                            className="text-left underline"
                            onClick={() => {
                              setPreviewText(
                                `미리보기 (DB 게시 없음)\n제목: ${a.draft_title || a.source_title}\n원문: ${a.canonical_source_url}`
                              );
                            }}
                          >
                            미리보기
                          </button>
                          {blocked ? (
                            <button
                              type="button"
                              className="text-left underline"
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                setError(null);
                                try {
                                  const res = await fetch(
                                    `/api/admin/community/external-board/articles/${a.id}/allow-republish`,
                                    { method: "POST" }
                                  );
                                  const j = await res.json();
                                  if (!res.ok || !j.ok) throw new Error(j.error || "다시 게시 허용 실패");
                                  await load();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : String(e));
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              다시 게시 허용
                            </button>
                          ) : null}
                          {!published && !blocked ? (
                            <button
                              type="button"
                              className="text-left underline"
                              onClick={() => {
                                setEditArticleId(a.id);
                                setEditTitle(a.draft_title || a.source_title || "");
                              }}
                            >
                              변환
                            </button>
                          ) : a.published_post_id ? (
                            <a className="underline" href={`/philife/${a.published_post_id}`} target="_blank" rel="noreferrer">
                              DIBAY에서 보기
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editArticleId ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
              <h3 className="font-medium">4. DIBAY 게시</h3>
              <p className="sam-text-caption text-sam-muted">
                원문 | DIBAY 변환본 · 상태: 미변환 / 변환됨 / 저장됨 / 게시 완료 (번역 자동 기능 없음)
              </p>
              <label className="block text-sm">
                변환 후 제목
                <input className={field} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() =>
                    void run("변환 적용", async () => {
                      const res = await fetch(`/api/admin/community/external-board/articles/${editArticleId}/draft`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "apply_transform" }),
                      });
                      const j = await res.json();
                      if (!j.ok) throw new Error(j.error || "apply_failed");
                      setEditTitle(String(j.draftTitle ?? editTitle));
                      await load();
                    })
                  }
                >
                  변환 적용
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() =>
                    void run("되돌리기", async () => {
                      const res = await fetch(`/api/admin/community/external-board/articles/${editArticleId}/draft`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "revert" }),
                      });
                      const j = await res.json();
                      if (!j.ok) throw new Error(j.error || "revert_failed");
                      setEditTitle(String(j.article?.source_title ?? editTitle));
                      await load();
                    })
                  }
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() =>
                    void run("미리보기", async () => {
                      const res = await fetch(`/api/admin/community/external-board/articles/${editArticleId}/draft`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "preview_transform" }),
                      });
                      const j = await res.json();
                      if (!j.ok) throw new Error(j.error || "preview_failed");
                      setPreviewText(`미리보기 (DB 게시 없음)\n${j.preview?.title ?? ""}`);
                    })
                  }
                >
                  미리보기
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() =>
                    void run("저장", async () => {
                      const res = await fetch(`/api/admin/community/external-board/articles/${editArticleId}/draft`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "save", draftTitle: editTitle }),
                      });
                      const j = await res.json();
                      if (!j.ok) throw new Error(j.error || "save_failed");
                      await load();
                    })
                  }
                >
                  저장
                </button>
                <button type="button" className={btnGhost} onClick={() => setEditArticleId(null)}>
                  취소
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() =>
                    void run("선택 게시", async () => {
                      const res = await fetch("/api/admin/community/external-board/articles/publish-selected", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ articleIds: [editArticleId] }),
                      });
                      const j = await res.json();
                      if (!j.ok && j.published === 0) throw new Error(j.error || "게시 실패");
                      setEditArticleId(null);
                      await load();
                    })
                  }
                >
                  선택 게시
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
