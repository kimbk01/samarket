import { describe, expect, it } from "vitest";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildMessengerInAppBannerContent,
  buildMessengerInAppBannerContentFromSnapshot,
} from "@/lib/community-messenger/notifications/messenger-in-app-banner-content";

const NOW = Date.parse("2026-10-25T12:34:50Z");

function snap(
  room: Record<string, unknown>,
  messages: Record<string, unknown>[]
): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "me",
    room: { id: "room-1", roomType: "direct", title: "q테스트1", summary: "", chatDomain: "general_direct", ...room },
    members: [
      { id: "peer", label: "q테스트1", avatarUrl: "https://x/a.png" },
      { id: "me", label: "w테스트1", avatarUrl: null },
    ],
    messages: messages.map((m, i) => ({
      id: `m${i}`,
      roomId: "room-1",
      senderId: "peer",
      senderLabel: "q테스트1",
      messageType: "text",
      content: "",
      createdAt: "2026-10-25T12:34:49Z",
      isMine: false,
      ...m,
    })),
  } as unknown as CommunityMessengerRoomSnapshot;
}

const build = (s: CommunityMessengerRoomSnapshot, chatPreviewEnabled = true) =>
  buildMessengerInAppBannerContentFromSnapshot({
    snapshot: s,
    viewerUserId: "me",
    language: "ko",
    chatPreviewEnabled,
    nowMs: NOW,
  });

describe("§14-11 앱 안 배너 문구 = OS 푸시 문구", () => {
  it("1:1 글: 제목 보낸 사람 · 본문 그대로 (운영 20:34:50 알림과 동일)", () => {
    expect(build(snap({}, [{ content: "C-N1 일반 메시지 확인" }]))).toEqual({
      title: "q테스트1",
      preview: "C-N1 일반 메시지 확인",
      avatarUrl: "https://x/a.png",
      kind: "message",
    });
  });

  it("가장 최근 수신 메시지만 — 내가 보낸 것·시스템·삭제 제외", () => {
    const c = build(
      snap({}, [
        { content: "예전", createdAt: "2026-10-25T12:34:40Z" },
        { content: "최신", createdAt: "2026-10-25T12:34:48Z" },
        { content: "내 글", createdAt: "2026-10-25T12:34:49Z", isMine: true, senderId: "me" },
        { content: "삭제", createdAt: "2026-10-25T12:34:49Z", deletedForEveryoneAt: "2026-10-25T12:34:49Z" },
        { content: "sys", createdAt: "2026-10-25T12:34:49Z", messageType: "system" },
      ])
    );
    expect(c?.preview).toBe("최신");
  });

  it("사진은 푸시와 같은 표기", () => {
    const c = build(snap({}, [{ messageType: "image", content: "https://x/p.jpg" }]));
    expect(c?.preview).not.toContain("https://");
    expect(c?.preview.length).toBeGreaterThan(0);
  });

  it("그룹: 방 이름 / 「보낸 사람: 본문」", () => {
    const c = build(snap({ roomType: "private_group", chatDomain: "group", title: "가족방" }, [{ content: "안녕" }]));
    expect(c).toMatchObject({ title: "가족방", preview: "q테스트1: 안녕" });
  });

  it("미리보기 끔이면 본문 숨김", () => {
    const c = build(snap({}, [{ content: "비밀" }]), false);
    expect(c?.title).toBe("q테스트1");
    expect(c?.preview).not.toContain("비밀");
  });

  it("부재중 통화 기록: 서버 부재중 알림과 같은 「부재중 전화 / 이름 · 부재중 음성 통화」", () => {
    const c = build(
      snap({}, [{ messageType: "call_stub", callStatus: "missed", callKind: "voice", createdAt: "2026-10-25T12:30:00Z" }])
    );
    expect(c).toMatchObject({ title: "부재중 전화", preview: "q테스트1 · 부재중 음성 통화" });
  });

  it("부재중 외 통화 기록·오래된 메시지·수신 메시지 없음 → null (배너 생략)", () => {
    expect(build(snap({}, [{ messageType: "call_stub", callStatus: "ended" }]))).toBeNull();
    expect(build(snap({}, [{ content: "옛 글", createdAt: "2026-10-25T12:00:00Z" }]))).toBeNull();
    expect(build(snap({}, [{ content: "내 글", isMine: true, senderId: "me" }]))).toBeNull();
  });
});

describe("§17 V-1 그룹 배너 — 최신 메시지 + 홈 목록 행 방 정보 (실기기 23:36 직전 글 표시 결함)", () => {
  it("그룹: 방 이름 / 「보낸 사람: 본문」 (참여자 정보 없어도 senderLabel)", () => {
    const c = buildMessengerInAppBannerContent({
      room: { id: "g1", roomType: "private_group", chatDomain: "group", title: "테스트", summary: "", avatarUrl: null } as never,
      members: null,
      messages: [
        { id: "a", roomId: "g1", senderId: "peer", senderLabel: "q테스트1", messageType: "text", content: "이전 글", createdAt: "2026-10-25T12:34:00Z", isMine: false },
        { id: "b", roomId: "g1", senderId: "peer", senderLabel: "q테스트1", messageType: "text", content: "새 글", createdAt: "2026-10-25T12:34:49Z", isMine: false },
      ] as never,
      viewerUserId: "me",
      language: "ko",
      chatPreviewEnabled: true,
      nowMs: Date.parse("2026-10-25T12:34:50Z"),
    });
    expect(c).toMatchObject({ title: "테스트", preview: "q테스트1: 새 글" });
  });

  it("배너는 캐시 없는 messages?latest=1 로 최신 메시지를 받는다", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/notifications/cm-participant-unread-full-effects.ts"), "utf8");
    expect(src).toContain("/messages?latest=1&limit=5");
    expect(src).toContain('{ cache: "no-store", credentials: "include" }');
    expect(src).not.toContain("prefetchCommunityMessengerRoomSnapshot(roomId, { force: true })");
  });
});

