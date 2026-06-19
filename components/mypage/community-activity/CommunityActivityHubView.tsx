"use client";

import type {
  CommunityActivityCommentItem,
  CommunityActivityHubData,
  CommunityActivityReactionItem,
  CommunityActivityReportItem,
} from "@/lib/mypage/community-activity-types";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";
import type { CommunityActivityHubTabId } from "@/lib/mypage/community-activity-types";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ActivityTabs({
  active,
  onChange,
  labels,
}: {
  active: CommunityActivityHubTabId;
  onChange: (tab: CommunityActivityHubTabId) => void;
  labels: Record<CommunityActivityHubTabId, string>;
}) {
  const tabs: CommunityActivityHubTabId[] = ["comments", "reactions", "reports"];
  return (
    <div className="flex gap-2 px-4 pb-2" role="tablist">
      {tabs.map((tab) => {
        const selected = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`min-h-11 min-w-[5.5rem] rounded-ui-rect px-4 py-2.5 text-sm font-medium transition-colors ${
              selected
                ? "bg-sam-brand text-white"
                : "border border-sam-border bg-sam-surface text-sam-fg"
            }`}
            onClick={() => onChange(tab)}
          >
            {labels[tab]}
          </button>
        );
      })}
    </div>
  );
}

function CommentRow({ row }: { row: CommunityActivityCommentItem }) {
  const href = row.postId ? `/community/${row.postId}` : undefined;
  const body = (
    <div className={`${Sam.card.base} flex min-h-[4.5rem] flex-col gap-1 px-4 py-3`}>
      {row.postTitle ? (
        <p className="line-clamp-1 text-xs font-medium text-sam-muted">{row.postTitle}</p>
      ) : null}
      <p className="line-clamp-2 text-sm text-sam-fg">{row.content || "—"}</p>
      <p className="text-xs text-sam-muted">{formatWhen(row.createdAt)}</p>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block active:opacity-80">
      {body}
    </Link>
  );
}

function ReactionRow({ row }: { row: CommunityActivityReactionItem }) {
  const href = row.postId ? `/community/${row.postId}` : undefined;
  const body = (
    <div className={`${Sam.card.base} flex min-h-[4.5rem] flex-col gap-1 px-4 py-3`}>
      <p className="line-clamp-2 text-sm font-medium text-sam-fg">{row.title || "—"}</p>
      <p className="text-xs text-sam-muted">{formatWhen(row.createdAt)}</p>
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block active:opacity-80">
      {body}
    </Link>
  );
}

function ReportRow({ row }: { row: CommunityActivityReportItem }) {
  return (
    <div className={`${Sam.card.base} flex min-h-[4.5rem] flex-col gap-1 px-4 py-3`}>
      <p className="line-clamp-2 text-sm text-sam-fg">{row.title || "—"}</p>
      <p className="text-xs text-sam-muted">
        {row.reasonType} · {formatWhen(row.createdAt)}
      </p>
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-sam-muted">{message}</div>
  );
}

export function CommunityActivityHubView({
  initialData,
  initialTab = "comments",
}: {
  initialData: CommunityActivityHubData;
  initialTab?: CommunityActivityHubTabId;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<CommunityActivityHubTabId>(initialTab);

  const labels = useMemo(
    () => ({
      comments: t("mypage_comp_activity_hub_tab_comments"),
      reactions: t("mypage_comp_activity_hub_tab_reactions"),
      reports: t("mypage_comp_activity_hub_tab_reports"),
    }),
    [t],
  );

  const { comments, reactions, reports } = initialData;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ActivityTabs active={tab} onChange={setTab} labels={labels} />
      {tab === "comments" ? (
        comments.length === 0 ? (
          <EmptyBlock message={t("mypage_comp_community_comments_empty")} />
        ) : (
          <ul className="flex flex-col gap-2 px-4">
            {comments.map((row) => (
              <li key={row.id}>
                <CommentRow row={row} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "reactions" ? (
        reactions.length === 0 ? (
          <EmptyBlock message={t("mypage_comp_activity_hub_reactions_empty")} />
        ) : (
          <ul className="flex flex-col gap-2 px-4">
            {reactions.map((row) => (
              <li key={`${row.id}-${row.createdAt}`}>
                <ReactionRow row={row} />
              </li>
            ))}
          </ul>
        )
      ) : null}
      {tab === "reports" ? (
        reports.length === 0 ? (
          <EmptyBlock message={t("mypage_comp_community_reports_empty")} />
        ) : (
          <ul className="flex flex-col gap-2 px-4">
            {reports.map((row) => (
              <li key={row.id}>
                <ReportRow row={row} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
