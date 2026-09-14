"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { Sam } from "@/lib/ui/css-vars";

type Country = { code: string; nameKo: string; nameEn: string; usableSiteCount: number };
type Site = {
  id: string;
  countryCode: string;
  name: string;
  status: string;
  boardCount: number;
  loginRequired: boolean;
  selectable?: boolean;
  lastCheckedAt: string | null;
};
type BoardCapabilities = {
  supportsRecent: boolean;
  supportsPageRange: boolean;
  supportsDateRange: boolean;
  recentCounts?: number[];
};
type Board = {
  id: string;
  siteId: string;
  name: string;
  topicHint: string | null;
  rangeOptions: string[];
  capabilities?: BoardCapabilities;
};
type Article = {
  id: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  hasDetail: boolean;
  publishStatus: string;
  communityPostId: string | null;
};
type Topic = { id: string; name: string; slug: string };

const RANGE_LABEL: Record<string, string> = {
  recent_10: "최근 10",
  recent_20: "최근 20",
  recent_50: "최근 50",
  page_range: "페이지 범위",
  date_range: "날짜 범위",
};

const STATUS_LABEL: Record<string, string> = {
  USABLE: "사용 가능",
  BLOCKED: "차단됨",
  NOT_PROVEN: "미검증",
  LOGIN_REQUIRED: "로그인 필요",
};

async function pollJob(jobId: string): Promise<{ status: string; statusLabel: string; errorMessage: string | null }> {
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`/api/admin/community/external-import/jobs/${jobId}`, { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "job_poll_failed");
    const st = String(json.job.status);
    if (st === "completed" || st === "failed") {
      return {
        status: st,
        statusLabel: json.job.statusLabel,
        errorMessage: json.job.errorMessage,
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("timeout");
}

export function AdminExternalImportPage() {
  const { language } = useI18n();
  const [countries, setCountries] = useState<Country[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [country, setCountry] = useState("");
  const [siteId, setSiteId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [range, setRange] = useState("recent_20");
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topicId, setTopicId] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<{
    title: string;
    author: string | null;
    publishedAt: string | null;
    nodes: Array<{ type: string; text?: string; src?: string }>;
    bodyImageUrls: string[];
  } | null>(null);
  const [publishResult, setPublishResult] = useState<Array<{ articleId: string; postId: string }> | null>(null);

  const loadCatalog = useCallback(async () => {
    const [cRes, tRes] = await Promise.all([
      fetch("/api/admin/community/external-import/catalog", { cache: "no-store" }),
      fetch("/api/admin/community/external-import/topics", { cache: "no-store" }),
    ]);
    const cJson = await cRes.json();
    const tJson = await tRes.json();
    if (cJson.ok) {
      setCountries(cJson.countries || []);
      setSites(cJson.sites || []);
      setBoards(cJson.boards || []);
    }
    if (tJson.ok) setTopics(tJson.topics || []);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const countrySites = useMemo(
    () => sites.filter((s) => !country || s.countryCode === country),
    [sites, country]
  );
  const siteBoards = useMemo(() => boards.filter((b) => b.siteId === siteId), [boards, siteId]);
  const activeBoard = siteBoards.find((b) => b.id === boardId);
  const rangeOptions = activeBoard?.rangeOptions?.length
    ? activeBoard.rangeOptions
    : ["recent_10", "recent_20", "recent_50"];

  useEffect(() => {
    if (!activeBoard) return;
    const opts = activeBoard.rangeOptions || [];
    if (opts.length && !opts.includes(range)) {
      setRange(opts[0]);
    }
  }, [activeBoard, range]);

  async function loadArticles() {
    setErrorMsg("");
    setStatusMsg("");
    setPublishResult(null);
    if (!boardId) {
      setErrorMsg("게시판을 선택하세요.");
      return;
    }
    setBusy(true);
    try {
      setStatusMsg("불러오는 중");
      const body: Record<string, unknown> = { action: "list", boardId, range };
      if (range === "page_range") {
        body.pageFrom = pageFrom;
        body.pageTo = pageTo;
      }
      if (range === "date_range") {
        body.dateFrom = dateFrom;
        body.dateTo = dateTo;
      }
      const res = await fetch("/api/admin/community/external-import/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "load_failed");
      const polled = await pollJob(json.jobId);
      if (polled.status === "failed") {
        setErrorMsg(polled.errorMessage || "게시물을 불러오지 못했습니다.");
        setStatusMsg("");
        return;
      }
      setStatusMsg(polled.statusLabel);
      const listRes = await fetch(`/api/admin/community/external-import/articles?boardId=${boardId}`, {
        cache: "no-store",
      });
      const listJson = await listRes.json();
      if (!listJson.ok) throw new Error(listJson.error || "list_failed");
      setArticles(listJson.articles || []);
      setSelected(new Set());
      setPreview(null);
    } catch (e) {
      setErrorMsg("게시물을 불러오지 못했습니다.");
      setStatusMsg("");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function ensureDetail(articleId: string) {
    const art = articles.find((a) => a.id === articleId);
    if (art?.hasDetail) return;
    const res = await fetch("/api/admin/community/external-import/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "detail", boardId, articleId }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "detail_failed");
    const polled = await pollJob(json.jobId);
    if (polled.status === "failed") throw new Error("detail_failed");
  }

  async function openPreview(articleId: string) {
    setBusy(true);
    setErrorMsg("");
    try {
      await ensureDetail(articleId);
      const res = await fetch(`/api/admin/community/external-import/articles/${articleId}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok || !json.document) throw new Error("preview_failed");
      setPreview({
        title: json.document.title,
        author: json.document.author,
        publishedAt: json.document.publishedAt,
        nodes: json.document.nodes || [],
        bodyImageUrls: json.document.bodyImageUrls || [],
      });
      setSelected(new Set([articleId]));
      const listRes = await fetch(`/api/admin/community/external-import/articles?boardId=${boardId}`, {
        cache: "no-store",
      });
      const listJson = await listRes.json();
      if (listJson.ok) setArticles(listJson.articles || []);
      requestAnimationFrame(() => {
        document.getElementById("external-import-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setErrorMsg("게시물을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publishSelected() {
    if (selected.size === 0) {
      setErrorMsg("게시할 글을 선택하세요.");
      return;
    }
    if (!topicId) {
      setErrorMsg("DIBAY 주제를 선택하세요.");
      return;
    }
    setBusy(true);
    setErrorMsg("");
    try {
      for (const id of selected) {
        await ensureDetail(id);
      }
      const res = await fetch("/api/admin/community/external-import/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: [...selected], topicId }),
      });
      const json = await res.json();
      const published = Array.isArray(json.published) ? json.published : [];
      const failed = Array.isArray(json.failed) ? json.failed : [];

      const existingFromFailed = failed
        .filter((f: { code?: string }) => f.code === "already_published")
        .map((f: { articleId: string }) => {
          const art = articles.find((a) => a.id === f.articleId);
          return art?.communityPostId
            ? { articleId: f.articleId, postId: art.communityPostId, existing: true as const }
            : null;
        })
        .filter(Boolean) as Array<{ articleId: string; postId: string; existing: true }>;

      const combined = [
        ...published.map((p: { articleId: string; postId: string }) => ({ ...p, existing: false as const })),
        ...existingFromFailed,
      ];

      if (combined.length === 0) {
        const needsRepublish = failed.some((f: { code?: string }) => f.code === "republish_required");
        setErrorMsg(
          needsRepublish
            ? "삭제된 글입니다. 「다시 게시 허용」 후 다시 시도하세요."
            : "선택한 게시물을 게시하지 못했습니다."
        );
        return;
      }

      setPublishResult(combined.map((p) => ({ articleId: p.articleId, postId: p.postId })));
      const newly = published.length;
      const existing = existingFromFailed.length;
      setStatusMsg(
        newly > 0
          ? `선택 게시 완료 (${newly}건)${existing ? ` · 이미 게시됨 ${existing}건` : ""}`
          : `이미 게시된 글입니다 (${existing}건)`
      );
      const listRes = await fetch(`/api/admin/community/external-import/articles?boardId=${boardId}`, {
        cache: "no-store",
      });
      const listJson = await listRes.json();
      if (listJson.ok) setArticles(listJson.articles || []);
    } catch {
      setErrorMsg("선택한 게시물을 게시하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function allowRepublish(articleId: string) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/admin/community/external-import/articles/${articleId}/allow-republish`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "allow_failed");
      setStatusMsg("다시 게시가 허용되었습니다.");
      const listRes = await fetch(`/api/admin/community/external-import/articles?boardId=${boardId}`, {
        cache: "no-store",
      });
      const listJson = await listRes.json();
      if (listJson.ok) setArticles(listJson.articles || []);
    } catch {
      setErrorMsg("다시 게시 허용에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const selectedTopic = topics.find((t) => t.id === topicId);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={language === "en" ? "Import external info" : "외부 정보 가져오기"}
        description={
          language === "en"
            ? "Choose a board, load real articles, preview, and publish into Community."
            : "사이트·게시판을 고르고 실제 글을 불러와 미리본 뒤 커뮤니티에 게시합니다."
        }
      />

      {errorMsg ? (
        <div className="rounded-ui-rect border border-sam-danger/40 bg-sam-danger/10 px-3 py-2 text-sm text-sam-danger">
          {errorMsg}
        </div>
      ) : null}
      {statusMsg ? <div className="text-sm text-sam-muted">{statusMsg}</div> : null}

      <AdminCard title="1. 국가">
        <div className="flex flex-wrap gap-2">
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={c.usableSiteCount === 0}
              className={`${Sam.chip.base} ${country === c.code ? Sam.chip.active : ""} ${
                c.usableSiteCount === 0 ? "opacity-40" : ""
              }`}
              onClick={() => {
                setCountry(c.code);
                setSiteId("");
                setBoardId("");
                setArticles([]);
              }}
            >
              {language === "en" ? c.nameEn : c.nameKo}
              {c.usableSiteCount === 0 ? " (없음)" : ""}
            </button>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="2. 사이트">
        {!country ? (
          <p className="text-sm text-sam-muted">국가를 선택하세요.</p>
        ) : countrySites.length === 0 ? (
          <p className="text-sm text-sam-muted">사용 가능한 사이트가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {countrySites.map((s) => {
              const selectable = s.selectable !== false && s.status === "USABLE";
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!selectable}
                  className={`block w-full rounded-ui-rect border px-3 py-2 text-left text-sm ${
                    siteId === s.id ? "border-sam-brand bg-sam-brand/5" : "border-sam-border"
                  } ${!selectable ? "opacity-50" : ""}`}
                  onClick={() => {
                    if (!selectable) return;
                    setSiteId(s.id);
                    setBoardId("");
                    setArticles([]);
                  }}
                >
                  <div className="font-medium text-sam-fg">{s.name}</div>
                  <div className="text-xs text-sam-muted">
                    게시판 {s.boardCount}개 · {STATUS_LABEL[s.status] || s.status}
                    {s.loginRequired ? " · 로그인 필요" : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </AdminCard>

      <AdminCard title="3. 게시판">
        {!siteId ? (
          <p className="text-sm text-sam-muted">사이트를 선택하세요.</p>
        ) : siteBoards.length === 0 ? (
          <p className="text-sm text-sam-muted">사용 가능한 게시판이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {siteBoards.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`${Sam.chip.base} ${boardId === b.id ? Sam.chip.active : ""}`}
                onClick={() => {
                  setBoardId(b.id);
                  setArticles([]);
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard title="4. 범위">
        {!boardId ? (
          <p className="text-sm text-sam-muted">게시판을 선택하세요.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {rangeOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${Sam.chip.base} ${range === r ? Sam.chip.active : ""}`}
                  onClick={() => setRange(r)}
                >
                  {RANGE_LABEL[r] || r}
                </button>
              ))}
            </div>
            {range === "page_range" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-sam-muted">
                  시작
                  <input
                    type="number"
                    min={1}
                    className={`${Sam.input.base} ml-2 w-20`}
                    value={pageFrom}
                    onChange={(e) => setPageFrom(Math.max(1, Number(e.target.value) || 1))}
                  />
                </label>
                <span>~</span>
                <label className="text-sam-muted">
                  끝
                  <input
                    type="number"
                    min={pageFrom}
                    className={`${Sam.input.base} ml-2 w-20`}
                    value={pageTo}
                    onChange={(e) => setPageTo(Math.max(pageFrom, Number(e.target.value) || pageFrom))}
                  />
                </label>
              </div>
            ) : null}
            {range === "date_range" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-sam-muted">
                  From
                  <input
                    type="date"
                    className={`${Sam.input.base} ml-2`}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label className="text-sam-muted">
                  To
                  <input
                    type="date"
                    className={`${Sam.input.base} ml-2`}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <button
              type="button"
              className={`${Sam.btn.base} ${Sam.btn.primary}`}
              disabled={!boardId || busy}
              onClick={() => void loadArticles()}
            >
              게시물 불러오기
            </button>
          </div>
        )}
      </AdminCard>

      <AdminCard title="5. 게시물">
        {articles.length === 0 ? (
          <p className="text-sm text-sam-muted">이 게시판에서 불러온 게시물이 없습니다.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={`${Sam.btn.base} ${Sam.btn.secondary}`}
                onClick={() => setSelected(new Set(articles.map((a) => a.id)))}
              >
                전체 선택
              </button>
              <button type="button" className={`${Sam.btn.base} ${Sam.btn.secondary}`} onClick={() => setSelected(new Set())}>
                전체 해제
              </button>
              <button
                type="button"
                className={`${Sam.btn.base} ${Sam.btn.secondary}`}
                disabled={selected.size !== 1 || busy}
                onClick={() => {
                  const id = [...selected][0];
                  if (id) void openPreview(id);
                }}
              >
                미리보기
              </button>
            </div>
            <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border">
              {articles.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="mt-1"
                    aria-label="선택"
                  />
                  {a.thumbnailUrl ? (
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-ui-rect">
                      <SamarketThumbnail src={a.thumbnailUrl} alt="" fill className="relative h-full w-full" imageClassName="object-cover" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-sam-fg">{a.title}</div>
                    <div className="text-xs text-sam-muted">
                      {a.author || "작성자 없음"} · {a.publishedAt ? String(a.publishedAt).slice(0, 10) : "날짜 없음"}
                      {a.publishStatus === "published" ? " · 게시됨" : ""}
                      {a.publishStatus === "deleted" ? " · 삭제됨" : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <button
                      type="button"
                      className="text-xs text-sam-brand underline"
                      disabled={busy}
                      onClick={() => void openPreview(a.id)}
                    >
                      미리보기
                    </button>
                    {a.publishStatus === "published" && a.communityPostId ? (
                      <a
                        className="text-xs text-sam-brand underline"
                        href={`/philife/${a.communityPostId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        상세 보기
                      </a>
                    ) : null}
                    {a.publishStatus === "deleted" ? (
                      <button
                        type="button"
                        className="text-xs text-sam-brand underline"
                        disabled={busy}
                        onClick={() => void allowRepublish(a.id)}
                      >
                        다시 게시 허용
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </AdminCard>

      <AdminCard title="6. DIBAY 주제">
        {topics.length === 0 ? (
          <p className="text-sm text-sam-muted">
            사용 가능한 주제가 없습니다.{" "}
            <a className="text-sam-brand underline" href="/admin/community/topics">
              새 주제 추가
            </a>
          </p>
        ) : (
          <select className={Sam.input.select} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">DIBAY 주제 선택</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </AdminCard>

      <div id="external-import-preview">
        <AdminCard title="7. 미리보기">
          {!preview ? (
            <p className="text-sm text-sam-muted">게시물을 선택해 미리보세요.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold text-sam-muted">원문 정보</div>
                <div className="text-base font-semibold">{preview.title}</div>
                <div className="text-xs text-sam-muted">
                  {preview.author} · {preview.publishedAt}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {preview.nodes.slice(0, 40).map((n, i) => {
                    if (n.type === "paragraph" && n.text) return <p key={i}>{n.text}</p>;
                    if (n.type === "heading" && n.text) return <h3 key={i} className="font-semibold">{n.text}</h3>;
                    if (n.type === "image" && n.src)
                      return (
                        <div key={i} className="relative h-48 w-full max-w-md overflow-hidden rounded-ui-rect">
                          <SamarketThumbnail src={n.src} alt="" fill className="relative h-full w-full" imageClassName="object-contain" />
                        </div>
                      );
                    return null;
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold text-sam-muted">DIBAY 적용 결과</div>
                <div className="text-base font-semibold">{preview.title}</div>
                <div className="text-xs text-sam-muted">
                  {preview.author} · {preview.publishedAt}
                </div>
                <div className="mt-1 text-xs text-sam-brand">주제: {selectedTopic?.name || "(미선택)"}</div>
                <div className="mt-3 space-y-2 text-sm">
                  {preview.bodyImageUrls.length === 0 ? (
                    <p className="text-sam-muted">이미지 없음</p>
                  ) : (
                    preview.bodyImageUrls.map((src) => (
                      <div key={src} className="relative h-40 w-full max-w-md overflow-hidden rounded-ui-rect">
                        <SamarketThumbnail src={src} alt="" fill className="relative h-full w-full" imageClassName="object-contain" />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </AdminCard>
      </div>

      <AdminCard title="8. 게시">
        <button
          type="button"
          className={`${Sam.btn.base} ${Sam.btn.primary}`}
          disabled={busy || selected.size === 0 || !topicId}
          onClick={() => void publishSelected()}
        >
          선택 게시 ({selected.size})
        </button>
        {publishResult && publishResult.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {publishResult.map((p) => (
              <li key={p.postId}>
                게시 완료 →{" "}
                <a className="text-sam-brand underline" href={`/philife/${p.postId}`} target="_blank" rel="noreferrer">
                  상세 보기
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </AdminCard>
    </div>
  );
}
