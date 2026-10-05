"use client";

import { useCallback, useEffect, useState } from "react";
import type { BoardProbe } from "@/lib/community-operator-import/detect";
import type { AdapterConfig, SourceEngine } from "@/lib/community-operator-import/types";
import { call, fmtDate, VERDICT_TONE } from "./api";
import { Blocks } from "./ImportEditorPanel";

function VerdictBadge({ v }: { v: string }) {
  return <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_TONE[v] || VERDICT_TONE.NOT_PROVEN}`}>{v}</span>;
}

const REASON: Record<string, string> = {
  title_missing: "제목 없음",
  body_missing: "본문·이미지 모두 없음",
  images_missing: "원본 이미지 일부 누락",
  feed_fallback: "원문 페이지를 못 읽어 피드 요약만 사용",
  entity_leak: "HTML 문자 노출",
  date_missing: "원본 게시일 없음",
};

type Target = { baseUrl: string; engine: SourceEngine; adapterConfig: AdapterConfig; engineKey: string; displayName: string };

/** Read-only: real list of one board + full extraction of the chosen article, next to a link to the original. */
export function BoardProbePanel({ target, onClose }: { target: Target; onClose: () => void }) {
  const [probe, setProbe] = useState<BoardProbe | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (articleIndex: number) => {
    setLoading(true);
    setError(null);
    setIndex(articleIndex);
    try {
      const r = await call<{ probe: BoardProbe }>("/sources", { body: { action: "probe", ...target, articleIndex } });
      setProbe(r.probe);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void load(0);
  }, [load]);

  const a = probe?.article;
  const ex = a?.extraction;
  const imgs = a ? a.orderedContentBlocks.filter((b) => b.type === "image").length : 0;
  const chars = a
    ? a.orderedContentBlocks.reduce((n, b) => n + (b.type === "paragraph" || b.type === "heading" || b.type === "quote" ? b.text.length : 0), 0)
    : 0;

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sam-border">
        <span className="text-xs font-semibold">샘플 보기 · {target.displayName}</span>
        <span className="text-[11px] text-sam-muted">저장하지 않는 읽기 전용 확인입니다.</span>
        <button type="button" className="sam-btn sam-btn-ghost text-[11px] ml-auto" onClick={onClose}>
          닫기
        </button>
      </div>
      {error ? <p className="p-3 text-xs text-rose-600 break-words">{error}</p> : null}
      {probe?.listError ? <p className="p-3 text-xs text-rose-600 break-words">목록 수집 실패: {probe.listError}</p> : null}
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <ul className="max-h-[520px] overflow-auto border border-sam-border rounded-ui-rect">
          {(probe?.rows ?? []).map((r, i) => (
            <li key={r.articleKey}>
              <button
                type="button"
                className={`w-full flex gap-2 text-left px-2 py-1.5 border-b border-sam-border ${i === index ? "bg-sam-app" : ""}`}
                onClick={() => void load(i)}
              >
                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-12 h-9 object-cover rounded bg-sam-app shrink-0" />
                ) : (
                  <span className="w-12 h-9 rounded bg-sam-app shrink-0 text-[9px] text-sam-muted flex items-center justify-center">없음</span>
                )}
                <span className="min-w-0">
                  <span className="block text-[11px] line-clamp-2 break-words">{r.title}</span>
                  <span className="block text-[10px] text-sam-muted">{fmtDate(r.sourcePublishedDate) || "날짜 없음"}</span>
                </span>
              </button>
            </li>
          ))}
          {loading && !probe ? <li className="p-2 text-[11px] text-sam-muted">불러오는 중…</li> : null}
        </ul>
        <div className="min-w-0 space-y-2">
          {loading ? <p className="text-xs text-sam-muted">원문 추출 중…</p> : null}
          {probe?.detailError ? <p className="text-xs text-rose-600 break-words">본문 수집 실패: {probe.detailError}</p> : null}
          {a ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-sam-muted">
                {probe?.quality ? <VerdictBadge v={probe.quality.verdict} /> : null}
                <span>본문 {chars.toLocaleString()}자 · 이미지 {imgs}{ex ? ` / 원본 ${ex.sourceImageCount}` : ""}</span>
                <span>추출: {ex?.bodySource ?? "-"}</span>
                <a className="underline" href={a.canonicalUrl} target="_blank" rel="noreferrer noopener">
                  원문 열기
                </a>
              </div>
              {probe?.quality?.reasons.length ? (
                <p className="text-[11px] text-amber-700">{probe.quality.reasons.map((r) => REASON[r] || r).join(" · ")}</p>
              ) : null}
              {ex?.warnings.length ? <p className="text-[11px] text-sam-muted break-words">경고: {ex.warnings.join(" · ")}</p> : null}
              <h3 className="text-sm font-semibold break-words">{a.title}</h3>
              <p className="text-[11px] text-sam-muted">
                {a.author || "작성자 없음"} · {fmtDate(a.sourcePublishedDate) || "게시일 없음"}
              </p>
              <div className="max-h-[440px] overflow-auto border-t border-sam-border pt-2">
                <Blocks blocks={a.orderedContentBlocks} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
