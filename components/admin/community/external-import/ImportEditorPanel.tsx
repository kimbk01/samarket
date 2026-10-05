"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
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
  const [reloadToken, setReloadToken] = useState(0);
  const [confirm, setConfirm] = useState<null | { kind: "publish" } | { kind: "status"; status: "active" | "hidden" | "deleted" }>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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
  }, [row.sourceSite, row.sourceBoard, row.sourceArticleKey, reloadToken]);

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
        <AdminActionButton variant="neutral" onClick={onClose}>
          닫기
        </AdminActionButton>
      </div>
    );
  }

  const a = data.article;
  const q = a.quality;
  const post = data.post;
  const published = Boolean(post || data.inbox?.publishedPostId || data.draft?.publishedPostId);
  const set = (patch: Partial<OperatorDraftEdit>) => setEdit({ ...edit, ...patch });
  const topic = topics.find((t) => t.id === edit.topicId);
  const postTopic = post ? topics.find((t) => t.slug === post.topicSlug) : undefined;
  const POST_STATUS: Record<string, string> = { active: "공개 중", hidden: "숨김", deleted: "삭제됨" };

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
      const r = await call<{ postId: string; mode: string; imageCount: number; topicSlug: string; warnings: string[] }>("/publish", {
        body: { article: a, edit, mode: published ? "update" : "create", acceptPartial },
      });
      const tName = topics.find((t) => t.slug === r.topicSlug)?.name ?? r.topicSlug;
      setMsg({
        tone: "ok",
        text: `${r.mode === "update" ? "업데이트" : "게시"} 완료 · 주제 ${tName} · 이미지 ${r.imageCount}장${r.warnings.length ? ` · 경고: ${r.warnings.join(", ")}` : ""}`,
      });
      onChanged();
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  // Post management goes through the admin community post API (audit-logged, same as 게시글 관리).
  const setPostStatus = async (status: "active" | "hidden" | "deleted") => {
    if (!post) return;
    setBusy("status");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg({ tone: "ok", text: `게시물 상태: ${POST_STATUS[status]}` });
      onChanged();
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMsg({ tone: "err", text: `상태 변경 실패: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const ex = a.extraction;
  const policy = edit.contentPolicy ?? data.source.contentPolicy;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sam-border">
        <AdminActionButton variant="neutral" onClick={onClose}>
          ← 목록
        </AdminActionButton>
        <span className="text-xs text-sam-muted truncate">
          {data.source.displayName} · {data.board.displayName}
        </span>
        <span className="rounded-full border border-sam-border px-1.5 text-[10px]">{STATUS_LABEL[data.inbox?.status ?? "new"]}</span>
        {q ? <VerdictBadge v={q.verdict} /> : null}
        <span className="ml-auto flex gap-1">
          {(["compare", "source", "result"] as const).map((v) => (
            <AdminActionButton key={v} variant={view === v ? "secondary" : "quiet"} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "compare" ? "비교" : v === "source" ? "원문" : "게시 결과"}
            </AdminActionButton>
          ))}
        </span>
      </div>

      {q && q.reasons.length ? (
        <div className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-50 text-amber-800 border-b border-amber-200">
          품질: {q.reasons.map((r) => data.qualityLabels[r] || r).join(" · ")}
          {ex ? ` (본문 추출: ${ex.bodySource}, 원본 이미지 ${ex.sourceImageCount})` : ""}
        </div>
      ) : null}

      {post ? (
        <div data-testid="import-post-manage" className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sam-border bg-sam-app text-xs">
          <span className="font-semibold text-sam-fg">게시된 글</span>
          <span className="rounded-full border border-sam-border px-2 py-0.5">{POST_STATUS[post.status] ?? post.status}</span>
          <span className="text-sam-muted">주제 {postTopic?.name ?? post.topicSlug}</span>
          <span className="text-sam-muted">수정 {fmtDate(post.updatedAt)}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <AdminActionLink variant="neutral" href={`/philife/${post.id}`} target="_blank" rel="noreferrer">
              커뮤니티에서 보기
            </AdminActionLink>
            <AdminActionLink variant="neutral" href={`/admin/community/posts/${post.id}`}>
              게시글 관리 화면
            </AdminActionLink>
            {post.status === "active" ? (
              <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => setConfirm({ kind: "status", status: "hidden" })}>
                숨김
              </AdminActionButton>
            ) : (
              <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => setConfirm({ kind: "status", status: "active" })}>
                다시 공개
              </AdminActionButton>
            )}
            {post.status !== "deleted" ? (
              <AdminActionButton variant="danger" disabled={!!busy} onClick={() => setConfirm({ kind: "status", status: "deleted" })}>
                삭제
              </AdminActionButton>
            ) : null}
          </span>
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
              <input aria-label="제목" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.displayTitle} onChange={(e) => set({ displayTitle: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                DIBAY 주제
                <select
                  aria-label="DIBAY 주제"
                  className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5"
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
                  className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5"
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
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.displayAuthor} onChange={(e) => set({ displayAuthor: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                표시 날짜
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.displayDate} onChange={(e) => set({ displayDate: e.target.value })} />
              </label>
            </div>
            {policy === "summary_link" ? (
              <label className="block text-xs text-sam-muted">
                요약 (비우면 원문 요약·첫 문장 사용 — 원문에 없는 내용을 쓰지 마세요)
                <textarea className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5 min-h-[80px]" value={edit.summaryText ?? ""} onChange={(e) => set({ summaryText: e.target.value })} />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                바꿀 문구
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.replaceFrom} onChange={(e) => set({ replaceFrom: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                새 문구
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.replaceTo} onChange={(e) => set({ replaceTo: e.target.value })} />
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
                          <button type="button" aria-label="썸네일로 지정" className="text-sm px-1" disabled={!included} onClick={() => set({ thumbnailImageIndex: i })}>
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
                <AdminActionButton variant="neutral" className="ml-auto" disabled={!!busy} onClick={() => void save("preview")}>
                  {busy === "preview" ? "계산 중…" : "미리보기 갱신"}
                </AdminActionButton>
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
          <AdminActionButton variant="secondary" disabled={!!busy} onClick={() => void save("save")}>
            {busy === "save" ? "저장 중…" : "임시저장"}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={!!busy || !topic || q?.verdict === "FAILED" || (q?.verdict === "PARTIAL" && !acceptPartial)}
            onClick={() => setConfirm({ kind: "publish" })}
          >
            {busy === "publish" ? "처리 중…" : published ? "게시물 업데이트" : "DIBAY에 게시"}
          </AdminActionButton>
          {!topic ? <span className="text-[11px] text-sam-muted self-center">주제를 선택해야 게시할 수 있습니다.</span> : null}
          {q?.verdict === "FAILED" ? <span className="text-[11px] text-rose-600 self-center">품질 FAILED — 게시 불가</span> : null}
        </div>
        {post ? (
          <p className="text-[11px] text-sam-muted">
            「게시물 업데이트」는 이 화면의 내용으로 게시글을 덮어씁니다. 게시글 관리 화면에서 직접 고친 내용도 바뀝니다.
          </p>
        ) : null}
      </div>

      <AdminActionConfirmDialog
        open={confirm?.kind === "publish"}
        title={published ? "게시물을 업데이트할까요?" : "DIBAY에 게시할까요?"}
        description={`주제: ${topic?.name ?? "-"} · 정책: ${POLICY_LABEL[preview?.policy ?? policy]} · 제목: ${preview?.title || edit.displayTitle}${
          post && post.status !== "active" ? ` · 현재 상태 ${POST_STATUS[post.status] ?? post.status}(업데이트해도 상태는 바뀌지 않습니다)` : ""
        }`}
        confirmLabel={published ? "업데이트" : "게시"}
        cancelLabel="취소"
        pending={busy === "publish"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void publish()}
      />
      <AdminActionConfirmDialog
        open={confirm?.kind === "status"}
        title={
          confirm?.kind === "status"
            ? confirm.status === "deleted"
              ? "게시물을 삭제할까요?"
              : confirm.status === "hidden"
                ? "게시물을 숨길까요?"
                : "게시물을 다시 공개할까요?"
            : ""
        }
        description={`${post?.title ?? ""} — 커뮤니티 피드·상세에 ${
          confirm?.kind === "status" && confirm.status === "active" ? "다시 보입니다." : "더 이상 보이지 않습니다. 수집함 기록과 출처 연결은 남습니다."
        }`}
        confirmLabel={confirm?.kind === "status" ? (confirm.status === "deleted" ? "삭제" : confirm.status === "hidden" ? "숨김" : "공개") : "확인"}
        cancelLabel="취소"
        tone={confirm?.kind === "status" && confirm.status === "deleted" ? "danger" : "primary"}
        pending={busy === "status"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === "status" && void setPostStatus(confirm.status)}
      />
    </div>
  );
}
