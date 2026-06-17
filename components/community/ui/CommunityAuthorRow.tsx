"use client";

import { MapPin } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";
import { CM_AUTHOR_NAME_CLASS, CM_META_CLASS } from "@/lib/community/community-ui-classes";
import { CommunityMoreMenu } from "./CommunityMoreMenu";

import { CommunityOwnPostMoreMenu } from "./CommunityOwnPostMoreMenu";

type Props = {
  authorName: string;
  locationLabel?: string;
  timeLabel?: string;
  avatarUrl?: string | null;
  subline?: string;
  showMoreMenu?: boolean;
  postId?: string;
  targetUserId?: string | null;
  canReport?: boolean;
  onReport?: () => void;
  isOwnPost?: boolean;
  onOwnShare?: () => void;
  onOwnDelete?: () => void;
  ownDeleteBusy?: boolean;
};

function AuthorAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  const ch = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <SamarketThumbnail
      src={avatarUrl}
      size={40}
      roundedClassName="rounded-full"
      className="bg-[var(--cm-primary-soft)] ring-1 ring-[var(--cm-border)]"
      fallbackSrc=""
      fallbackNode={
        <span className="text-[14px] font-bold text-[var(--cm-primary)]" aria-hidden>
          {ch}
        </span>
      }
    />
  );
}

export function CommunityAuthorRow({
  authorName,
  locationLabel = "",
  timeLabel = "",
  avatarUrl,
  subline,
  showMoreMenu = false,
  postId,
  targetUserId,
  canReport,
  onReport,
  isOwnPost = false,
  onOwnShare,
  onOwnDelete,
  ownDeleteBusy = false,
}: Props) {
  const displayName = communityAuthorDisplayName(authorName, authorName.trim());
  const loc = locationLabel.trim();
  const time = timeLabel.trim();

  return (
    <div className="flex min-w-0 items-start gap-3">
      <AuthorAvatar name={displayName} avatarUrl={avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className={CM_AUTHOR_NAME_CLASS}>{displayName}</p>
        {(loc || time) ? (
          <p className={`mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 ${CM_META_CLASS}`}>
            {loc ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--cm-text-muted)]" strokeWidth={2} aria-hidden />
                <span className="truncate">{loc}</span>
              </span>
            ) : null}
            {loc && time ? <span className="text-[var(--cm-text-muted)]" aria-hidden>·</span> : null}
            {time ? <span className="shrink-0">{time}</span> : null}
          </p>
        ) : null}
        {subline ? <p className={`mt-1 ${CM_META_CLASS}`}>{subline}</p> : null}
      </div>
      {showMoreMenu && isOwnPost && onOwnShare && onOwnDelete ? (
        <CommunityOwnPostMoreMenu onShare={onOwnShare} onDelete={onOwnDelete} deleteBusy={ownDeleteBusy} />
      ) : null}
      {showMoreMenu && targetUserId && postId && !isOwnPost ? (
        <CommunityMoreMenu
          postId={postId}
          targetUserId={targetUserId}
          canReport={canReport}
          onReport={onReport}
        />
      ) : null}
    </div>
  );
}
