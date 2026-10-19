"use client";

/**
 * 게시글 수정 이력 (설계 §C-6 · §E-3). API 의 각 행은 그 수정 **전** 값이다.
 * 비교: 이력 i 의 「수정 후」 = 바로 다음(더 최근) 이력의 「수정 전」, 가장 최근 이력은 현재 글.
 */
import { useEffect, useState } from "react";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { communityBlocksToText } from "@/components/admin/community/posts/CommunityPostBlocksEditor";
import { communityJsonFetch } from "@/components/admin/community/posts/community-post-admin-shared";

type Revision = {
  id: string | number;
  editor_role?: string | null;
  editor_label?: string | null;
  title?: string | null;
  content?: string | null;
  content_blocks?: unknown;
  topic_slug?: string | null;
  reason?: string | null;
  created_at: string;
};

export type RevisionSnapshot = {
  title: string;
  content: string;
  content_blocks: unknown;
  topic_slug: string;
};

const ROLE: Record<string, { label: string; tone: "neutral" | "progress" | "warning" }> = {
  admin: { label: "관리자 수정", tone: "warning" },
  author: { label: "작성자 수정", tone: "neutral" },
  member: { label: "작성자 수정", tone: "neutral" },
  system: { label: "자동 처리", tone: "progress" },
};

function bodyText(s: { content?: string | null; content_blocks?: unknown }): string {
  const blocks = communityBlocksToText(s.content_blocks);
  return blocks || String(s.content ?? "");
}

function CompareRow({ label, before, after }: { label: string; before: string; after: string }) {
  const same = before === after;
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold text-sam-muted">
        {label} {same ? <span className="font-normal">(변경 없음)</span> : null}
      </p>
      {same ? null : (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-ui-rect border border-red-200 bg-red-50 p-2">
            <p className="mb-1 text-[11px] font-semibold text-red-800">수정 전</p>
            <p className="max-h-60 overflow-auto whitespace-pre-wrap text-[13px] text-sam-fg">{before || "—"}</p>
          </div>
          <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 p-2">
            <p className="mb-1 text-[11px] font-semibold text-emerald-800">수정 후</p>
            <p className="max-h-60 overflow-auto whitespace-pre-wrap text-[13px] text-sam-fg">{after || "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommunityPostRevisionsTab({
  postId,
  current,
  topicNameOf,
  reloadKey,
}: {
  postId: string;
  current: RevisionSnapshot;
  topicNameOf: (slug: string) => string;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<Revision[] | null>(null);
  const [err, setErr] = useState<{ code: string; status: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancel = false;
    setRows(null);
    setErr(null);
    void (async () => {
      const r = await communityJsonFetch<{ revisions?: Revision[] }>(
        `/api/admin/community/engine/posts/${encodeURIComponent(postId)}/revisions?limit=100`
      );
      if (cancel) return;
      if (!r.ok) setErr({ code: r.code, status: r.status });
      else setRows(r.json.revisions ?? []);
    })();
    return () => {
      cancel = true;
    };
  }, [postId, reloadKey, retry]);

  if (err) return <AdminErrorState ko code={err.code} httpStatus={err.status} onRetry={() => setRetry((n) => n + 1)} />;
  if (!rows) return <AdminLoadingState ko />;
  if (rows.length === 0) return <AdminEmptyState ko message="수정 이력이 없습니다. 처음 게시된 그대로입니다." />;

  return (
    <ol className="space-y-2" data-community-post-revisions="1">
      {rows.map((rev, i) => {
        const key = String(rev.id);
        const after: RevisionSnapshot =
          i === 0
            ? current
            : {
                title: String(rows[i - 1].title ?? ""),
                content: String(rows[i - 1].content ?? ""),
                content_blocks: rows[i - 1].content_blocks,
                topic_slug: String(rows[i - 1].topic_slug ?? ""),
              };
        const role = ROLE[String(rev.editor_role ?? "system")] ?? ROLE.system;
        const isOpen = open === key;
        return (
          <li key={key} className="rounded-ui-rect border border-sam-border bg-sam-surface">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-[13px]"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              <span className="flex flex-wrap items-center gap-2">
                <AdminToneBadge tone={role.tone}>{role.label}</AdminToneBadge>
                <span className="font-medium text-sam-fg">{rev.editor_label?.trim() || "기록 없음"}</span>
                {rev.reason ? <span className="text-sam-muted">사유: {rev.reason}</span> : null}
              </span>
              <span className="text-sam-muted">
                {formatAdminManilaDateTime(rev.created_at)} PHT · {isOpen ? "접기" : "전후 비교"}
              </span>
            </button>
            {isOpen ? (
              <div className="space-y-3 border-t border-sam-border-soft px-3 py-3">
                <CompareRow label="제목" before={String(rev.title ?? "")} after={after.title} />
                <CompareRow
                  label="카테고리"
                  before={topicNameOf(String(rev.topic_slug ?? ""))}
                  after={topicNameOf(after.topic_slug)}
                />
                <CompareRow label="본문" before={bodyText(rev)} after={bodyText(after)} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
