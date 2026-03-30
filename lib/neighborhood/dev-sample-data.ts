/**
 * 과거 인메모리·개발용 동네/필라이프 샘플 — 운영에서는 사용하지 않습니다.
 * 동일 시그니처를 유지해 기존 import 를 깨지 않되, 항상 “없음”만 반환합니다.
 */
import type { ChatMessage, ChatRoom } from "@/lib/types/chat";
import type {
  NeighborhoodCommentNode,
  NeighborhoodFeedPostDTO,
  NeighborhoodMeetingDetailDTO,
  MeetingFeedPostDTO,
  MeetingAlbumItemDTO,
} from "@/lib/neighborhood/types";

export type SampleMeetingMember = {
  user_id: string;
  label: string;
  role: "host" | "member";
  status: "joined" | "left" | "kicked" | "pending" | "banned";
  created_at?: string;
};

export type SampleCommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  author_name: string;
};

export function getNeighborhoodDevSampleFeed(_options: {
  city?: string;
  name?: string;
  category?: string | null;
  offset?: number;
  limit?: number;
}): { posts: NeighborhoodFeedPostDTO[]; hasMore: boolean } {
  return { posts: [], hasMore: false };
}

export function getNeighborhoodDevSamplePost(_postId: string): NeighborhoodFeedPostDTO | null {
  return null;
}

export function getNeighborhoodDevSampleMeeting(_meetingId: string): NeighborhoodMeetingDetailDTO | null {
  return null;
}

export function getNeighborhoodDevSampleComments(_postId: string): NeighborhoodCommentNode[] {
  return [];
}

export function getNeighborhoodDevSampleAdminPosts(): unknown[] {
  return [];
}

export function getNeighborhoodDevSampleAdminMeetings(): unknown[] {
  return [];
}

export function isNeighborhoodDevSampleRoomId(_roomId: string): boolean {
  return false;
}

export function getNeighborhoodDevSampleChatRooms(_currentUserId: string): ChatRoom[] {
  return [];
}

export function getNeighborhoodDevSampleChatRoom(_roomId: string, _currentUserId: string): ChatRoom | null {
  return null;
}

export function getNeighborhoodDevSampleChatMessages(_roomId: string): ChatMessage[] {
  return [];
}

export function updateNeighborhoodDevSamplePost(
  _postId: string,
  _patch: Partial<NeighborhoodFeedPostDTO>
): boolean {
  return false;
}

export function isNeighborhoodDevSamplePostId(_postId: string): boolean {
  return false;
}

export function incrementNeighborhoodDevSamplePostView(_postId: string): number | null {
  return null;
}

export function getNeighborhoodDevSamplePostViewCount(_postId: string): number | null {
  return null;
}

export function toggleNeighborhoodDevSamplePostLike(
  _postId: string,
  _userId: string
): { liked: boolean; like_count: number } | null {
  return null;
}

export function getNeighborhoodDevSampleCommentRows(_postId: string): SampleCommentRow[] {
  return [];
}

export function addNeighborhoodDevSampleComment(_args: {
  postId: string;
  userId: string;
  authorName: string;
  content: string;
  parentId: string | null;
}): { id: string } | null {
  return null;
}

export function updateNeighborhoodDevSampleMeeting(
  _meetingId: string,
  _patch: Partial<NeighborhoodMeetingDetailDTO>
): boolean {
  return false;
}

export function joinNeighborhoodDevSampleMeeting(
  _meetingId: string,
  _userId: string
): { ok: boolean; error?: string; chatRoomId?: string | null } {
  return { ok: false, error: "sample_disabled" };
}

export function leaveNeighborhoodDevSampleMeeting(_meetingId: string, _userId: string): boolean {
  return false;
}

export function closeNeighborhoodDevSampleMeeting(_meetingId: string, _userId: string): boolean {
  return false;
}

export function kickNeighborhoodDevSampleMeetingMember(
  _meetingId: string,
  _actorUserId: string,
  _targetUserId: string
): boolean {
  return false;
}

export function getNeighborhoodDevSampleMeetingMembers(_meetingId: string): SampleMeetingMember[] {
  return [];
}

export function getNeighborhoodDevSampleMeetingFeedPosts(_meetingId: string): MeetingFeedPostDTO[] {
  return [];
}

export function getNeighborhoodDevSampleMeetingAlbumItems(_meetingId: string): MeetingAlbumItemDTO[] {
  return [];
}

export function postNeighborhoodDevSampleChatMessage(
  _roomId: string,
  _userId: string,
  _body: string,
  _messageType: "text" | "image" | "system" = "text"
): ChatMessage | null {
  return null;
}
