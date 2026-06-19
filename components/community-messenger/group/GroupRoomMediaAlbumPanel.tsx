"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  useGroupRoomMediaAlbum,
  type GroupMediaAlbumFilter,
} from "@/lib/community-messenger/group/use-group-room-media-album";
import { formatTime, looksLikeDirectImageUrl } from "@/components/community-messenger/room/community-messenger-room-helpers";

type GroupRoomMediaAlbumPanelProps = {
  roomId: string;
  filter: GroupMediaAlbumFilter;
  enabled: boolean;
  onOpenMessage: (messageId: string) => void;
};

export function GroupRoomMediaAlbumPanel({
  roomId,
  filter,
  enabled,
  onOpenMessage,
}: GroupRoomMediaAlbumPanelProps) {
  const { t } = useI18n();
  const { items, loading, loadingMore, hasMore, loadMore } = useGroupRoomMediaAlbum(roomId, filter, enabled);
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 6,
  });

  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const last = virtualItems.at(-1);
    if (!last || !hasMore || loadingMore) return;
    if (last.index >= items.length - 4) loadMore();
  }, [hasMore, items.length, loadMore, loadingMore, rowVirtualizer]);

  if (loading && !items.length) {
    return (
      <p className="py-8 text-center sam-text-body-secondary text-sam-muted" aria-busy="true">
        {t("chats_spinner_loading_aria")}
      </p>
    );
  }

  if (!items.length) {
    return <p className="py-8 text-center sam-text-body-secondary text-sam-muted">{t("cm_ui_no_media")}</p>;
  }

  return (
    <div ref={parentRef} className="mt-3 max-h-[55vh] overflow-y-auto">
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          const isImage = item.messageType === "image" || looksLikeDirectImageUrl(item.content);
          return (
            <button
              key={item.messageId}
              type="button"
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => onOpenMessage(item.messageId)}
              className="absolute left-0 flex w-full gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left active:bg-sam-app"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-ui-rect bg-sam-border-soft sam-text-xxs font-semibold text-sam-muted">
                {isImage ? (
                  <SamarketThumbnail
                    src={item.content.trim()}
                    size={64}
                    roundedClassName="rounded-ui-rect"
                    className="h-full w-full object-cover"
                    fallbackSrc=""
                  />
                ) : (
                  t("cm_ui_file")
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="sam-text-helper text-sam-muted">{formatTime(item.createdAt)}</p>
                <p className="mt-0.5 truncate sam-text-body text-sam-fg">
                  {isImage ? t("cm_ui_photo") : t("cm_ui_file")}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {loadingMore ? (
        <p className="py-3 text-center sam-text-helper text-sam-muted">{t("chats_spinner_loading_aria")}</p>
      ) : null}
    </div>
  );
}

type GroupRoomMediaAlbumTabsProps = {
  roomId: string;
  enabled: boolean;
  onOpenMessage: (messageId: string) => void;
};

export function GroupRoomMediaAlbumTabs({ roomId, enabled, onOpenMessage }: GroupRoomMediaAlbumTabsProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<GroupMediaAlbumFilter>("image");
  const tabs: { id: GroupMediaAlbumFilter; label: string }[] = [
    { id: "image", label: t("cm_ui_photo") },
    { id: "file", label: t("cm_ui_file") },
    { id: "all", label: t("cm_ui_media") },
  ];

  return (
    <>
      <div className="mt-3 flex gap-1 rounded-ui-rect border border-[#006241]/20 bg-[#EAF4EF] p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`min-h-[36px] flex-1 rounded-ui-rect px-2 py-1.5 sam-text-helper font-semibold transition ${
              tab === item.id ? "bg-[#006241] text-white" : "text-[#006241] active:bg-white/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <GroupRoomMediaAlbumPanel roomId={roomId} filter={tab} enabled={enabled} onOpenMessage={onOpenMessage} />
    </>
  );
}
