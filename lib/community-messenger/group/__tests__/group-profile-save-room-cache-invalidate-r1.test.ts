import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 재감사 R1 (docs/design/group-chat-reaudit-2026-11-13.md §3-1·§6):
 * 그룹 사진·제목 저장이 성공하면 이 서버의 방 부트스트랩 캐시(silent_delta 포함)를 비운다.
 * 실제 서비스 함수를 돌려 확인한다(저장소 접근만 대체).
 */
const repo = vi.hoisted(() => ({ patchOk: true }));

vi.mock("@/lib/community-messenger/group/group-room-repository", () => ({
  resolveGroupRoomSupabase: () => ({}),
  fetchPrivateGroupRoom: async () => ({ id: "room-1", room_type: "private_group", owner_user_id: "owner-1" }),
  fetchActiveParticipant: async () => ({ role: "owner" }),
}));
vi.mock("@/lib/community-messenger/group/group-room-profile-repository", () => ({
  fetchGroupRoomProfileRow: async () => ({ title: "B2B TEST", avatar_url: null }),
  patchGroupRoomProfile: async () => (repo.patchOk ? { ok: true } : { ok: false, error: "update_failed" }),
}));
vi.mock("@/lib/community-messenger/group/group-room-profile-policy", () => ({
  canEditGroupRoomProfile: () => true,
  normalizeGroupRoomProfilePatch: (patch: unknown) => ({ ok: true, patch }),
}));
vi.mock("@/lib/community-messenger/group/group-active-membership-gate", () => ({
  listActiveGroupRecipientUserIds: async () => [],
}));

import { updateGroupRoomProfile } from "@/lib/community-messenger/group/group-room-profile-service";
import {
  getCachedRoomBootstrap,
  setCachedRoomBootstrap,
} from "@/lib/community-messenger/server/room-bootstrap-route-cache";

const SILENT_KEY = "cm_room_bootstrap:member-2:room-1:silent_delta:x";
const OTHER_ROOM_KEY = "cm_room_bootstrap:member-2:room-9:silent_delta:x";

describe("R1 그룹 프로필 저장 → 방 서버 캐시 비움", () => {
  beforeEach(() => {
    setCachedRoomBootstrap(SILENT_KEY, { room: { title: "옛 제목", avatarUrl: null } });
    setCachedRoomBootstrap(OTHER_ROOM_KEY, { room: { title: "다른 방" } });
  });

  it("저장 성공: 이 방 캐시만 비워지고 다른 방 캐시는 그대로", async () => {
    repo.patchOk = true;
    await expect(
      updateGroupRoomProfile({ userId: "owner-1", roomId: "room-1", patch: { title: "새 제목" } })
    ).resolves.toEqual({ ok: true });
    expect(getCachedRoomBootstrap(SILENT_KEY)).toBeNull();
    expect(getCachedRoomBootstrap(OTHER_ROOM_KEY)).not.toBeNull();
  });

  it("저장 실패: 캐시를 건드리지 않는다", async () => {
    repo.patchOk = false;
    const out = await updateGroupRoomProfile({ userId: "owner-1", roomId: "room-1", patch: { title: "새 제목" } });
    expect(out.ok).toBe(false);
    expect(getCachedRoomBootstrap(SILENT_KEY)).not.toBeNull();
  });
});
