import type { CommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";

export type NeighborhoodFeedPostDTO = {
  id: string;
  /** `community_topics.slug` 와 동기(어드민 피드 주제) */
  category: string;
  category_label: string;
  /** 어드민 주제별 목록 카드 스킨 (`community_topics.feed_list_skin`) */
  feed_list_skin: CommunityFeedListSkin;
  topic_color: string | null;
  is_question: boolean;
  /** 모임 글·오픈채팅 표시용 */
  is_meetup: boolean;
  meetup_place: string | null;
  title: string;
  summary: string;
  content: string;
  location_id: string;
  location_label: string;
  images: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  author_name: string;
  author_id: string;
  meeting_id: string | null;
  meeting_date: string | null;
};

export type NeighborhoodMeetingDetailDTO = {
  id: string;
  post_id: string;
  title: string;
  description: string;
  location_text: string;
  meeting_date: string | null;
  /** short=단기 모임, long=장기 모임(일정 비고정) */
  tenure_type?: "short" | "long";
  max_members: number;
  member_count: number;
  created_by: string;
  host_user_id: string;
  join_policy: string;
  entry_policy: "open" | "approve" | "password" | "invite_only";
  requires_approval: boolean;
  has_password: boolean;
  /** open | closed | ended | cancelled */
  status: string;
  is_closed: boolean;
  joined_count: number;
  pending_count: number;
  banned_count: number;
  notice_count: number;
  last_notice_at: string | null;
  chat_room_id: string | null;
  /** 모임장이 설정한 환영 메시지 */
  welcome_message?: string | null;
  /** 대표 이미지 URL */
  cover_image_url?: string | null;
  /** 피드 허용 여부 */
  allow_feed?: boolean;
  /** 앨범 업로드 허용 여부 */
  allow_album_upload?: boolean;
};

/** 모임 내부 피드 게시글 */
export type MeetingFeedPostDTO = {
  id: string;
  meeting_id: string;
  author_user_id: string;
  author_name: string;
  post_type: "normal" | "notice" | "intro" | "attendance" | "review";
  content: string;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: string;
};

/** 모임 앨범 항목 */
export type MeetingAlbumItemDTO = {
  id: string;
  meeting_id: string;
  uploader_user_id: string;
  uploader_name: string;
  image_url: string | null;
  caption: string | null;
  is_hidden?: boolean;
  created_at: string;
};

export type NeighborhoodMeetingNoticeDTO = {
  id: string;
  meeting_id: string;
  title: string;
  body: string;
  visibility: "members" | "public";
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  author_user_id: string;
};

export type NeighborhoodMeetingEventDTO = {
  id: string;
  meeting_id: string;
  actor_user_id: string | null;
  actor_name: string;
  target_user_id: string | null;
  target_name: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/** 관리자 모임 운영 로그 목록 (모임 제목 포함) */
export type AdminMeetingEventRow = NeighborhoodMeetingEventDTO & {
  meeting_title: string | null;
};

export type NeighborhoodCommentNode = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author_name: string;
  children: NeighborhoodCommentNode[];
};
