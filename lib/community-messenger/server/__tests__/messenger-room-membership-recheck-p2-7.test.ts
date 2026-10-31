import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2-7 — membership 캐시 적중이어도 활성 참가 여부를 재확인한다.
 * 다른 인스턴스에서 kick·ban·leave(left_at 기록)된 회원은 캐시가 남아 있어도 즉시 거부된다.
 */
const core = vi.hoisted(() => ({
  stillMember: true as boolean | null,
  resolveOk: false,
}));

vi.mock("@/lib/community-messenger/server/messenger-room-canonical-resolve-core", () => ({
  recheckActiveMessengerParticipant: vi.fn(async () => ({ stillMember: core.stillMember, access: null })),
  resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown: vi.fn(async () =>
    core.resolveOk
      ? {
          ok: true,
          canonicalRoomId: "room-1",
          breakdown: {
            permission_db_query_ms: 1,
            permission_room_fetch_ms: 0,
            permission_canonical_build_ms: 0,
            permission_profile_join_ms: 0,
            permission_cache_store_ms: 0,
            permission_source: "participant_direct",
          },
        }
      : {
          ok: false,
          error: "room_not_found",
          breakdown: {
            permission_db_query_ms: 1,
            permission_room_fetch_ms: 0,
            permission_canonical_build_ms: 0,
            permission_profile_join_ms: 0,
            permission_cache_store_ms: 0,
            permission_source: "room_exists_not_member",
          },
        },
  ),
}));

import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import {
  forgetMessengerRoomMembershipCache,
  probeMessengerRoomMembershipCache,
  rememberMessengerRoomMembershipCache,
} from "@/lib/community-messenger/server/messenger-room-membership-cache";

describe("messenger room membership cache recheck (P2-7)", () => {
  beforeEach(() => {
    forgetMessengerRoomMembershipCache("user-a", "room-1");
    core.stillMember = true;
    core.resolveOk = false;
  });

  it("캐시 적중 + 활성 참가 → 캐시 경로 허용", async () => {
    rememberMessengerRoomMembershipCache("user-a", "room-1", "room-1");
    const res = await messengerRoomCanonicalOrJsonError("user-a", "room-1");
    expect(res.ok).toBe(true);
    expect(res.membership_cache_hit).toBe(1);
  });

  it("캐시 적중이어도 이미 나간(left_at) 회원 → 캐시 폐기 후 404", async () => {
    rememberMessengerRoomMembershipCache("user-a", "room-1", "room-1");
    core.stillMember = false;
    const res = await messengerRoomCanonicalOrJsonError("user-a", "room-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(404);
    expect(probeMessengerRoomMembershipCache("user-a", "room-1").hit).toBe(false);
  });

  it("다른 회원은 A 의 캐시 항목을 쓸 수 없다 (키 = user+room)", async () => {
    rememberMessengerRoomMembershipCache("user-a", "room-1", "room-1");
    expect(probeMessengerRoomMembershipCache("user-b", "room-1").hit).toBe(false);
  });
});
