"use client";

/**
 * 게시글 수정 이력 (설계 §C-6 · §E-3). API 의 각 행은 그 수정 **전** 값이다.
 * 비교: 이력 i 의 「수정 후」 = 바로 다음(더 최근) 이력의 「수정 전」, 가장 최근 이력은 현재 글.
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
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

const ROLE: Record<string, { labelKey: MessageKey; tone: "neutral" | "progress" | "warning" }> = {
  admin: { labelKey: "admin_community_postrev_role_admin", tone: "warning" },
  author: { labelKey: "admin_community_postrev_role_author", tone: "neutral" },
  member: { labelKey: "admin_community_postrev_role_author", tone: "neutral" },
  system: { labelKey: "admin_community_postrev_role_system", tone: "progress" },
};

function bodyText(s: { content?: string | null; content_blocks?: unknown }, lang: string): string {
  const blocks = communityBlocksToText(s.content_blocks, lang);
  return blocks || String(s.content ?? "");
}

function CompareRow({ label, before, after }: { label: string; before: string; after: string }) {
  const { t } = useI18n();
  const same = before === after;
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold text-sam-muted">
        {label} {same ? <span className="font-normal">{t("admin_community_postrev_unchanged")}</span> : null}
      </p>
      {same ? null : (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft p-2">
            <p className="mb-1 text-[12px] font-semibold text-sam-danger">{t("admin_community_postrev_before")}</p>
            <p className="max-h-60 overflow-auto whitespace-pre-wrap text-[13px] text-sam-fg">{before || "—"}</p>
          </div>
          <div className="rounded-ui-rect border border-sam-success bg-sam-success-soft p-2">
            <p className="mb-1 text-[12px] font-semibold text-sam-success">{t("admin_community_postrev_after")}</p>
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
  const { t, language } = useI18n();
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
  if (rows.length === 0) return <AdminEmptyState ko message={t("admin_community_postrev_empty")} />;

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
            <AdminListItemButton
              selected={isOpen}
              className="px-3 text-[13px]"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              <span className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <AdminToneBadge tone={role.tone}>{t(role.labelKey)}</AdminToneBadge>
                  <span className="font-medium text-sam-fg">{rev.editor_label?.trim() || t("admin_community_postrev_no_record")}</span>
                  {rev.reason ? <span className="text-sam-muted">{t("admin_community_kit_reason", { reason: rev.reason })}</span> : null}
                </span>
                <span className="text-sam-muted">
                  {formatAdminManilaDateTime(rev.created_at)} PHT · {isOpen ? t("admin_community_postrev_collapse") : t("admin_community_postrev_compare")}
                </span>
              </span>
            </AdminListItemButton>
            {isOpen ? (
              <div className="space-y-3 border-t border-sam-border-soft px-3 py-3">
                <CompareRow label={t("admin_community_postrev_field_title")} before={String(rev.title ?? "")} after={after.title} />
                <CompareRow
                  label={t("admin_community_postrev_field_category")}
                  before={topicNameOf(String(rev.topic_slug ?? ""))}
                  after={topicNameOf(after.topic_slug)}
                />
                <CompareRow
                  label={t("admin_community_postrev_field_body")}
                  before={bodyText(rev, language)}
                  after={bodyText(after, language)}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
