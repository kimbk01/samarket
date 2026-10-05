"use client";

import { useEffect, useMemo, useState } from "react";
import type { OperatorContentBlock, OperatorDraftEdit } from "@/lib/community-operator-import/types";
import { VerdictBadge } from "./ImportSourcesPanel";
import { call, type ContentPolicy, type DetailPayload, fmtDate, type InboxRow, POLICY_LABEL, type PublishContent, STATUS_LABEL, type TopicOption } from "./api";

export function Blocks({ blocks }: { blocks: OperatorContentBlock[] }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-sam-fg break-words">
      {blocks.map((b, i) => {
        if (b.type === "image")
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={b.displaySrc || b.url} alt={b.alt || ""} referrerPolicy="no-referrer" loading="lazy" className="block max-h-72 w-auto max-w-full rounded-ui-rect border border-sam-border bg-sam-app" />
          );
        if (b.type === "heading") return <p key={i} className="font-semibold">{b.text}</p>;
        if (b.type === "quote") return <blockquote key={i} className="border-l-2 border-sam-border pl-2 text-sam-muted">{b.text}</blockquote>;
        if (b.type === "list")
          return (
            <ul key={i} className="list-disc pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          );
        if (b.type === "link")
          return (
            <a key={i} href={b.href || "#"} target="_blank" rel="noreferrer noopener" className="underline text-sam-primary">
              {b.text || b.href}
            </a>
          );
        return <p key={i} className="whitespace-pre-wrap">{b.text}</p>;
      })}
    </div>
  );
}

type Props = {
  row: InboxRow;
  topics: TopicOption[];
  onClose: () => void;
  onChanged: () => void;
};

export function ImportEditorPanel({ row, topics, onClose, onChanged }: Props) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [edit, setEdit] = useState<OperatorDraftEdit | null>(null);
  const [preview, setPreview] = useState<PublishContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [acceptPartial, setAcceptPartial] = useState(false);
  const [view, setView] = useState<"compare" | "source" | "result">("compare");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMsg(null);
    setData(null);
    const p = new URLSearchParams({ site: row.sourceSite, board: row.sourceBoard, key: row.sourceArticleKey });
    call<DetailPayload>(`/detail?${p.toString()}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setEdit(d.edit);
        setPreview(d.preview);
      })
      .catch((e) => alive && setMsg({ tone: "err", text: `원문을 가져오지 못했습니다: ${e instanceof Error ? e.message : e}` }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [row.sourceSite, row.sourceBoard, row.sourceArticleKey]);

  const images = useMemo(
    () =>
      (data?.article.orderedContentBlocks ?? [])
        .map((b, i) => ({ b, i }))
        .filter((x): x is { b: Extract<OperatorContentBlock, { type: "image" }>; i: number } => x.b.type === "image"),
    [data],
  );

  if (loading) return <div className="p-4 text-xs text-sam-muted">원문 가져오는 중…</div>;
  if (!data || !edit) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs text-rose-600 break-words">{msg?.text ?? "원문을 불러올 수 없습니다."}</p>
        <a className="text-xs underline" href={row.canonicalUrl} target="_blank" rel="noreferrer noopener">
          원문 열기
        </a>
        <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onClose}>
          닫기
        </button>
      </div>
    );
  }

  const a = data.article;
  const q = a.quality;
  const published = Boolean(data.inbox?.publishedPostId || data.draft?.publishedPostId);
  const set = (patch: Partial<OperatorDraftEdit>) => setEdit({ ...edit, ...patch });
  const topic = topics.find((t) => t.id === edit.topicId);

  const save = async (action: "save" | "preview") => {
    setBusy(action);
    setMsg(null);
    try {
      const r = await call<{ preview: PublishContent }>("/drafts", { body: { article: a, edit, action } });
      setPreview(r.preview);
      if (action === "save") {
        setMsg({ tone: "ok", text: "임시저장했습니다." });
        onChanged();
      }
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy("publish");
    setMsg(null);
    try {
      const r = await call<{ postId: string; mode: string; imageCount: number; warnings: string[] }>("/publish", {
        body: { article: a, edit, mode: published ? "update" : "create", acceptPartial },
      });
      setMsg({
        tone: "ok",
        text: `${r.mode === "update" ? "업데이트" : "게시"} 완료 · 이미지 ${r.imageCount}장${r.warnings.length ? ` · 경고 ${r.warnings.length}` : ""}`,
      });
      onChanged();
      setData({ ...data, inbox: data.inbox ? { ...data.inbox, status: "published", publishedPostId: r.postId } : data.inbox });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const ex = a.extraction;
  const policy = edit.contentPolicy ?? data.source.contentPolicy;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sam-border">
        <button type="button" className="sam-btn sam-btn-ghost text-xs" onClick={onClose}>
          ← 목록
        </button>
        <span className="text-xs text-sam-muted truncate">
          {data.source.displayName} · {data.board.displayName}
        </span>
        <span className="rounded-full border border-sam-border px-1.5 text-[10px]">{STATUS_LABEL[data.inbox?.status ?? "new"]}</span>
        {q ? <VerdictBadge v={q.verdict} /> : null}
        <span className="ml-auto flex gap-1">
          {(["compare", "source", "result"] as const).map((v) => (
            <button key={v} type="button" className={`sam-btn text-[11px] ${view === v ? "sam-btn-secondary" : "sam-btn-ghost"}`} onClick={() => setView(v)}>
              {v === "compare" ? "비교" : v === "source" ? "원문" : "게시 결과"}
            </button>
          ))}
        </span>
      </div>

      {q && q.reasons.length ? (
        <div className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-50 text-amber-800 border-b border-amber-200">
          품질: {q.reasons.map((r) => data.qualityLabels[r] || r).join(" · ")}
          {ex ? ` (본문 추출: ${ex.bodySource}, 원본 이미지 ${ex.sourceImageCount})` : ""}
        </div>
      ) : null}

      <div className={`flex-1 min-h-0 overflow-auto grid gap-3 p-3 ${view === "compare" ? "lg:grid-cols-2" : ""}`}>
        {view !== "result" ? (
          <section className="space-y-2 min-w-0">
            <div className="text-[11px] font-semibold text-sam-muted">원문</div>
            <h3 className="text-base font-semibold break-words">{a.title}</h3>
            <div className="text-[11px] text-sam-muted">
              {a.author || "작성자 없음"} · {fmtDate(a.sourcePublishedDate) || "날짜 없음"} ·{" "}
              <a className="underline" href={a.canonicalUrl} target="_blank" rel="noreferrer noopener">
                원문 열기
              </a>
            </div>
            <Blocks blocks={a.orderedContentBlocks} />
          </section>
        ) : null}

        {view !== "source" ? (
          <section className="space-y-3 min-w-0">
            <div className="text-[11px] font-semibold text-sam-muted">편집 · 게시 결과</div>
            <label className="block text-xs text-sam-muted">
              제목
              <input aria-label="제목" className="sam-input w-full text-sm mt-0.5" value={edit.displayTitle} onChange={(e) => set({ displayTitle: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                DIBAY 주제
                <select
                  aria-label="DIBAY 주제"
                  className="sam-input w-full text-sm mt-0.5"
                  value={edit.topicId ?? ""}
                  onChange={(e) => {
                    const t = topics.find((x) => x.id === e.target.value);
                    set({ topicId: t?.id ?? null, topicSlug: t?.slug ?? null });
                  }}
                >
                  <option value="">주제 선택</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-sam-muted">
                게시 정책
                <select
                  className="sam-input w-full text-sm mt-0.5"
                  value={policy}
                  onChange={(e) => set({ contentPolicy: e.target.value as ContentPolicy })}
                >
                  {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                    <option key={p} value={p} disabled={p === "full" && data.source.contentPolicy !== "full"}>
                      {POLICY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-sam-muted">
                표시 작성자
                <input className="sam-input w-full text-sm mt-0.5" value={edit.displayAuthor} onChange={(e) => set({ displayAuthor: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                표시 날짜
                <input className="sam-input w-full text-sm mt-0.5" value={edit.displayDate} onChange={(e) => set({ displayDate: e.target.value })} />
              </label>
            </div>
            {policy === "summary_link" ? (
              <label className="block text-xs text-sam-muted">
                요약 (비우면 원문 요약·첫 문장 사용 — 원문에 없는 내용을 쓰지 마세요)
                <textarea className="sam-input w-full text-sm mt-0.5 min-h-[80px]" value={edit.summaryText ?? ""} onChange={(e) => set({ summaryText: e.target.value })} />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                바꿀 문구
                <input className="sam-input w-full text-sm mt-0.5" value={edit.replaceFrom} onChange={(e) => set({ replaceFrom: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                새 문구
                <input className="sam-input w-full text-sm mt-0.5" value={edit.replaceTo} onChange={(e) => set({ replaceTo: e.target.value })} />
              </label>
            </div>
            {images.length ? (
              <div>
                <div className="text-xs text-sam-muted mb-1">이미지 (체크=포함, ★=썸네일)</div>
                <div className="flex flex-wrap gap-2">
                  {images.map(({ b, i }) => {
                    const included = edit.imageIncludes[String(i)] !== false;
                    const thumb = edit.thumbnailImageIndex === i;
                    return (
                      <div key={i} className={`relative rounded-ui-rect border ${thumb ? "border-sam-primary" : "border-sam-border"} p-1`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.displaySrc || b.url} alt="" referrerPolicy="no-referrer" loading="lazy" className={`w-20 h-16 object-cover rounded ${included ? "" : "opacity-30"}`} />
                        <div className="flex items-center justify-between mt-0.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(e) => set({ imageIncludes: { ...edit.imageIncludes, [String(i)]: e.target.checked } })}
                          />
                          <button type="button" className="text-[11px]" disabled={!included} onClick={() => set({ thumbnailImageIndex: i })}>
                            {thumb ? "★" : "☆"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="rounded-ui-rect border border-sam-border p-2 space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-sam-muted">
                게시될 내용 ({POLICY_LABEL[preview?.policy ?? policy]})
                <button type="button" className="sam-btn sam-btn-ghost text-[11px] ml-auto" disabled={!!busy} onClick={() => void save("preview")}>
                  {busy === "preview" ? "계산 중…" : "미리보기 갱신"}
                </button>
              </div>
              {preview ? (
                <>
                  <p className="font-semibold text-sm break-words">{preview.title}</p>
                  <Blocks blocks={preview.blocks} />
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="space-y-2">
            {preview ? (
              <>
                <p className="font-semibold break-words">{preview.title}</p>
                <Blocks blocks={preview.blocks} />
              </>
            ) : null}
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-sam-border px-3 py-2 space-y-1.5 bg-sam-surface">
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-rose-600" : "text-emerald-700"}`}>{msg.text}</p> : null}
        {q?.verdict === "PARTIAL" ? (
          <label className="flex items-center gap-1 text-[11px] text-sam-muted">
            <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
            품질 PARTIAL 확인함 — 게시 허용
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="sam-btn sam-btn-secondary text-sm" disabled={!!busy} onClick={() => void save("save")}>
            {busy === "save" ? "저장 중…" : "임시저장"}
          </button>
          <button
            type="button"
            className="sam-btn sam-btn-primary text-sm"
            disabled={!!busy || !topic || q?.verdict === "FAILED" || (q?.verdict === "PARTIAL" && !acceptPartial)}
            onClick={() => void publish()}
          >
            {busy === "publish" ? "처리 중…" : published ? "게시물 업데이트" : "DIBAY에 게시"}
          </button>
          {!topic ? <span className="text-[11px] text-sam-muted self-center">주제를 선택해야 게시할 수 있습니다.</span> : null}
          {q?.verdict === "FAILED" ? <span className="text-[11px] text-rose-600 self-center">품질 FAILED — 게시 불가</span> : null}
        </div>
      </div>
    </div>
  );
}
