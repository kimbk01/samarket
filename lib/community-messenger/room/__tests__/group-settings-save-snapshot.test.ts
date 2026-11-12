/**
 * 그룹 설정·공지·권한·사진 저장 뒤 화면 값 — `silent_delta` 는 방 설정 필드를 싣지 않고 이전 스냅샷 값을 유지한다.
 * 저장값을 스냅샷에 먼저 반영하지 않으면 병합된 새 스냅샷이 폼을 옛 값으로 되돌린다(운영 2026-11-05 21:54 PHT, DB 는 저장됨).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
import {
  noteGroupRoomIdentitySavedLocally,
  resetGroupRoomIdentitySavedLocallyForTests,
} from "@/lib/community-messenger/room/group-room-identity-local-save";
import {
  patchRoomSummaryInSnapshotCache,
  peekHotRoomSnapshot,
  peekRoomSnapshot,
  primeHotRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

function snap(room: Partial<CommunityMessengerRoomSnapshot["room"]>): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    room: {
      id: "r1",
      roomType: "private_group",
      title: "B2B TEST",
      subtitle: "",
      avatarUrl: null,
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      lastMessage: "",
      lastMessageType: "system",
      lastMessageAt: "2026-11-05T13:50:03Z",
      memberCount: 2,
      ...room,
    } as CommunityMessengerRoomSnapshot["room"],
    members: [],
    messages: [],
    myRole: "owner",
    activeCall: null,
  } as CommunityMessengerRoomSnapshot;
}

describe("silent_delta 병합은 방 설정 필드를 이전 스냅샷에서 유지한다", () => {
  it("저장값을 먼저 반영한 스냅샷 위에 delta 가 와도 저장값이 남는다", () => {
    const saved = snap({ allowAdminKick: false, noticeText: "b2b notice", title: "새 이름", avatarUrl: "https://x/a.png" });
    /**
     * 실제 흐름: applySavedGroupRoomFields 가 저장한 사진·제목을 기록한다(G4). 그 뒤 캐시된 옛 delta(실제 제목·옛 사진)가 와도
     * 보호 시간 동안 저장값이 남는다. (다른 멤버가 바꾼 값을 따라가는 것은 group-photo-list-header-g3-g7.test.ts)
     */
    resetGroupRoomIdentitySavedLocallyForTests();
    noteGroupRoomIdentitySavedLocally(String(saved.room.id), { title: "새 이름", avatarUrl: "https://x/a.png" });
    const delta = snap({
      allowAdminKick: true,
      noticeText: "",
      title: "B2B TEST",
      titleFromRoom: true,
      avatarUrl: null,
      lastMessage: "Permissions updated",
    });
    const merged = mergeCommunityMessengerSilentDeltaIntoSnapshot(saved, delta);
    expect(merged.room.allowAdminKick).toBe(false);
    expect(merged.room.noticeText).toBe("b2b notice");
    expect(merged.room.title).toBe("새 이름");
    expect(merged.room.avatarUrl).toBe("https://x/a.png");
    expect(merged.room.lastMessage).toBe("Permissions updated");
    expect(merged).not.toBe(saved);
  });

  it("저장값을 반영하지 않으면 delta 병합 뒤에도 옛 값 — 결함 재현 조건", () => {
    const stale = snap({ allowAdminKick: true });
    const merged = mergeCommunityMessengerSilentDeltaIntoSnapshot(stale, snap({ allowAdminKick: false }));
    expect(merged.room.allowAdminKick).toBe(true);
  });
});

describe("phase2 controller — 저장 성공 뒤 refresh(true) 전에 스냅샷에 저장값 반영", () => {
  const src = readFileSync(
    path.join(process.cwd(), "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"),
    "utf8"
  );

  function body(name: string): string {
    const decl = `const ${name} = useCallback(`;
    const start = src.indexOf(decl);
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf("useCallback(", start + decl.length);
    return src.slice(start, next > -1 ? next : undefined);
  }

  it.each([
    ["savePrivateGroupSettings", ["title: savedTitle", "avatarUrl: savedAvatarUrl"]],
    ["savePrivateGroupNotice", ["noticeText: savedNotice", "noticeUpdatedAt:"]],
    [
      "savePrivateGroupPermissions",
      [
        "allowMemberInvite: groupAllowMemberInvite",
        "allowAdminInvite: groupAllowAdminInvite",
        "allowAdminKick: groupAllowAdminKick",
        "allowAdminEditNotice: groupAllowAdminEditNotice",
        "allowMemberUpload: groupAllowMemberUpload",
        "allowMemberCall: groupAllowMemberCall",
      ],
    ],
    ["uploadPrivateGroupAvatar", ["avatarUrl: savedAvatarUrl"]],
  ])("%s", (name, fields) => {
    const b = body(name);
    const patchAt = b.indexOf("applySavedGroupRoomFields(");
    const refreshAt = b.indexOf("await refresh(true)");
    expect(patchAt).toBeGreaterThan(-1);
    expect(refreshAt).toBeGreaterThan(patchAt);
    for (const f of fields) expect(b.slice(patchAt, refreshAt)).toContain(f);
  });

  it("applySavedGroupRoomFields 는 화면 스냅샷과 재입장용 방 캐시를 함께 고친다", () => {
    const b = body("applySavedGroupRoomFields");
    expect(b).toContain("setSnapshot(");
    expect(b).toContain("patchRoomSummaryInSnapshotCache(");
    /** G4 — 저장한 사진·제목을 기록해 캐시된 옛 silent_delta 가 되돌리지 않게 */
    expect(b).toContain("noteGroupRoomIdentitySavedLocally(rid,");
  });

  it("설정 입력값 동기화 effect 는 스냅샷 객체가 아니라 방 필드 값에만 반응한다 — 입력 중 공지가 지워지지 않게", () => {
    expect(src).not.toMatch(/\}, \[isOpenGroupRoom, isPrivateGroupRoom, snapshot\]\);/);
    expect(src).not.toMatch(/\}, \[isOpenGroupRoom, snapshot\]\);/);
    expect(src).toMatch(
      /setPrivateGroupNoticeDraft\(syncedNoticeText\);\s*\}\s*\}, \[isOpenGroupRoom, isPrivateGroupRoom, syncedNoticeText, syncedRoomId, setPrivateGroupNoticeDraft\]\);/
    );
  });

  it("사진 업로드 — 서버 저장 실패 시 폼에 새 사진을 넣지 않는다", () => {
    const b = body("uploadPrivateGroupAvatar");
    const setAt = b.indexOf("setPrivateGroupAvatarUrl(");
    expect(setAt).toBeGreaterThan(b.indexOf("if (!patchRes.ok || !patchJson.ok)"));
  });
});

describe("재입장 캐시 — 저장값 패치 뒤 peek 이 저장값을 돌려준다", () => {
  it("entries·hot 캐시 모두", () => {
    const stale = snap({ allowAdminKick: true, noticeText: "" });
    primeRoomSnapshot("r1", stale);
    primeHotRoomSnapshot("r1", stale);
    patchRoomSummaryInSnapshotCache({ roomId: "r1", viewerUserId: "u1", patch: { allowAdminKick: false, noticeText: "b2b" } });
    expect(peekRoomSnapshot("r1", "u1")?.room.allowAdminKick).toBe(false);
    expect(peekRoomSnapshot("r1", "u1")?.room.noticeText).toBe("b2b");
    expect(peekHotRoomSnapshot("r1", "u1")?.room.allowAdminKick).toBe(false);
  });
});
