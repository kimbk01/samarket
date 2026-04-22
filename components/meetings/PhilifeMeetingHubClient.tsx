"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MeetingRoomHero } from "@/components/meetings/MeetingRoomHero";
import { MeetingHomeTab, type MeetingDetailTabId } from "@/components/meetings/MeetingHomeTab";
import { MeetingMembersTab } from "@/components/meetings/MeetingMembersTab";
import { MeetingNoticesTab } from "@/components/meetings/MeetingNoticesTab";
import { MeetingFeedTab } from "@/components/meetings/MeetingFeedTab";
import { MeetingAlbumTab } from "@/components/meetings/MeetingAlbumTab";
import { MeetingEventsSection } from "@/components/community/meeting/MeetingEventsSection";
import { philifeMeetingApi } from "@domain/philife/api";
import type {
  MeetingAlbumItemDTO,
  MeetingFeedPostDTO,
  MeetingMemberListItemDTO,
  NeighborhoodMeetingDetailDTO,
  NeighborhoodMeetingEventDTO,
  NeighborhoodMeetingNoticeDTO,
} from "@/lib/neighborhood/types";

const TAB_ITEMS: Array<{ id: MeetingDetailTabId; label: string }> = [
  { id: "home", label: "홈" },
  { id: "notices", label: "공지" },
  { id: "feed", label: "피드" },
  { id: "chat", label: "채팅" },
  { id: "album", label: "앨범" },
  { id: "members", label: "멤버" },
];

function roleLabel(role: MeetingMemberListItemDTO["role"] | undefined) {
  if (role === "host") return "모임장";
  if (role === "co_host") return "운영진";
  return "멤버";
}

export function PhilifeMeetingHubClient({
  meeting,
  currentUserId,
  joinedMembers,
  pendingMembers,
  notices,
  feedPosts,
  albumItems,
  initialEvents,
  initialEventsHasMore,
  isHost,
  isManager,
}: {
  meeting: NeighborhoodMeetingDetailDTO;
  currentUserId?: string | null;
  joinedMembers: MeetingMemberListItemDTO[];
  pendingMembers: MeetingMemberListItemDTO[];
  notices: NeighborhoodMeetingNoticeDTO[];
  feedPosts: MeetingFeedPostDTO[];
  albumItems: MeetingAlbumItemDTO[];
  initialEvents: NeighborhoodMeetingEventDTO[];
  initialEventsHasMore: boolean;
  isHost: boolean;
  isManager: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [leaving, setLeaving] = useState(false);
  const activeTab = (searchParams.get("tab") as MeetingDetailTabId | null) ?? "home";
  const operator = isHost || isManager;
  const messengerRoomHref = meeting.community_messenger_room_id
    ? `/community-messenger/rooms/${encodeURIComponent(meeting.community_messenger_room_id)}`
    : null;
  const me = joinedMembers.find((member) => member.userId === currentUserId) ?? null;

  const setTab = (tab: MeetingDetailTabId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const onLeave = async () => {
    if (!window.confirm("모임에서 나가시겠어요?")) return;
    setLeaving(true);
    try {
      const res = await fetch(philifeMeetingApi(meeting.id).leave(), { method: "POST" });
      const json = (await res.json()) as { ok?: boolean };
      if (res.ok && json.ok) {
        router.replace(`/philife/${meeting.post_id}`);
        router.refresh();
      }
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <MeetingRoomHero
        meetingId={meeting.id}
        title={meeting.title}
        entryPolicy={meeting.entry_policy}
        status={meeting.status}
        isClosed={meeting.is_closed}
        coverImageUrl={meeting.cover_image_url}
        pendingApprovalCount={pendingMembers.length}
        joinedCount={meeting.joined_count || meeting.member_count}
        maxMembers={meeting.max_members}
        showHostMenu={operator}
        isHostUser={isHost}
        backHref={`/philife/${meeting.post_id}`}
        backAriaLabel="게시글로"
      />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="sam-text-body font-semibold text-sam-fg">{meeting.region_text || meeting.location_text || "지역 미정"}</p>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {meeting.category_text || "모임"} · 내 역할 {roleLabel(me?.role)}
              {meeting.platform_approval_status ? ` · 운영 상태 ${meeting.platform_approval_status}` : ""}
            </p>
          </div>
          {messengerRoomHref ? (
            <Link
              href={messengerRoomHref}
              className="rounded-ui-rect bg-emerald-600 px-4 py-2 sam-text-body-secondary font-semibold text-white"
            >
              채팅 입장
            </Link>
          ) : (
            <span className="sam-text-helper text-sam-muted">채팅 준비 중</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-2">
          {TAB_ITEMS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`rounded-full px-3 py-2 sam-text-helper font-semibold ${
                  active ? "bg-sam-ink text-white" : "bg-sam-surface text-sam-muted border border-sam-border"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "home" ? (
        <div className="space-y-3">
          <MeetingHomeTab
            meeting={meeting}
            notices={notices}
            joinedMembers={joinedMembers}
            onTabChange={setTab}
            onLeave={onLeave}
            isLeaving={leaving}
            isHost={operator}
            pendingApprovalCount={pendingMembers.length}
            compactSummary
          />
          <MeetingEventsSection
            meetingId={meeting.id}
            initialEvents={initialEvents}
            initialHasMore={initialEventsHasMore}
          />
        </div>
      ) : null}

      {activeTab === "notices" ? (
        <MeetingNoticesTab
          notices={notices}
          feedPosts={feedPosts}
          isHost={operator}
          noticeCount={meeting.notice_count}
          lastNoticeAt={meeting.last_notice_at}
          feedNoticeCount={feedPosts.filter((post) => post.post_type === "notice").length}
          allowFeed={meeting.allow_feed}
          onGoFeed={() => setTab("feed")}
        />
      ) : null}

      {activeTab === "feed" ? (
        <MeetingFeedTab
          feedPosts={feedPosts}
          meetingId={meeting.id}
          currentUserId={currentUserId ?? undefined}
          isHost={operator}
          allowFeed={meeting.allow_feed}
        />
      ) : null}

      {activeTab === "album" ? (
        <MeetingAlbumTab
          albumItems={albumItems}
          meetingId={meeting.id}
          allowUpload={operator || meeting.allow_album_upload !== false}
          currentUserId={currentUserId ?? ""}
          isHost={operator}
        />
      ) : null}

      {activeTab === "members" ? (
        <MeetingMembersTab
          joinedMembers={joinedMembers}
          pendingMembers={pendingMembers}
          maxMembers={meeting.max_members}
          currentUserId={currentUserId ?? undefined}
          meetingId={meeting.id}
          isHost={operator}
        />
      ) : null}

      {activeTab === "chat" ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-5 text-center shadow-sm">
          <p className="sam-text-body font-semibold text-sam-fg">모임 기본 채팅방</p>
          <p className="mt-2 sam-text-body-secondary text-sam-muted">
            참여가 승인된 멤버만 기본 채팅방에 입장할 수 있습니다.
          </p>
          {messengerRoomHref ? (
            <Link
              href={messengerRoomHref}
              className="mt-4 inline-flex rounded-ui-rect bg-emerald-600 px-4 py-2.5 sam-text-body-secondary font-semibold text-white"
            >
              채팅방 열기
            </Link>
          ) : (
            <p className="mt-4 sam-text-helper text-sam-muted">채팅방이 아직 연결되지 않았습니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
