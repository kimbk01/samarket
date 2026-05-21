/** lite 소셜 deferred 캐시 — `service.ts` 내부 타입과 동형(순환 import 방지) */

export type CommunityFriendRequestAcceptedRow = {
  requester_id?: string;
  addressee_id?: string;
  status?: string;
  responded_at?: string | null;
  created_at?: string;
};
