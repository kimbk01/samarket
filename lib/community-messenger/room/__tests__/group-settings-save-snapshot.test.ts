/**
 * 그룹 설정·공지·권한·사진 저장 뒤 화면 값 — `silent_delta` 는 방 설정 필드를 싣지 않고 이전 스냅샷 값을 유지한다.
 * 저장값을 스냅샷에 먼저 반영하지 않으면 병합된 새 스냅샷이 폼을 옛 값으로 되돌린다(운영 2026-11-05 21:54 PHT, DB 는 저장됨).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
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
    const delta = snap({ allowAdminKick: true, noticeText: "", title: "B2B TEST", avatarUrl: null, lastMessage: "Permissions updated" });
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
    ["savePrivateGroupSettings", ["title:", "avatarUrl:"]],
    ["savePrivateGroupNotice", ["noticeText: savedNotice", "noticeUpdatedAt: savedAt"]],
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
    const patchAt = b.indexOf("setSnapshot(");
    const refreshAt = b.indexOf("await refresh(true)");
    expect(patchAt).toBeGreaterThan(-1);
    expect(refreshAt).toBeGreaterThan(patchAt);
    for (const f of fields) expect(b.slice(patchAt, refreshAt)).toContain(f);
  });
});
