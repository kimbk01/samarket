/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimMessengerImageSendPreviews,
  playMessengerMessageSentFeedbackOnce,
} from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-controller";
import { syncNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate";

describe("playMessengerMessageSentFeedbackOnce — user sound gate", () => {
  beforeEach(() => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
  });

  it("plays messenger_message_sent once after successful ACK with confirmed id", () => {
    const play = vi.fn();
    const played = new Set<string>();

    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("messenger_message_sent");
  });

  it("does not play before ACK (no confirmed id)", () => {
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-1", null, play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("dedupes repeated ACK for the same clientMessageId", () => {
    const play = vi.fn();
    const played = new Set<string>();
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(true);
    expect(playMessengerMessageSentFeedbackOnce(played, "cid-1", "msg-1", play)).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("does not play when user sound_enabled is false", () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: false,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-2", "msg-2", play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("does not play when community_chat_enabled is false", () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: false,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });
    const play = vi.fn();
    expect(playMessengerMessageSentFeedbackOnce(new Set(), "cid-3", "msg-3", play)).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("claimMessengerImageSendPreviews — 사진 전송 미리보기 URL 소유권(넘겨받은 URL 은 전송에 쓰거나 즉시 해제)", () => {
  const file = (n: number) => new File([new Uint8Array([n])], `p${n}.jpg`, { type: "image/jpeg" });
  function setup(count: number) {
    const live = new Set<string>();
    const urls = Array.from({ length: count }, (_, i) => {
      const u = `blob:cm/${i}`;
      live.add(u);
      return u;
    });
    const revoke = (u: string) => void live.delete(u);
    return { live, urls, revoke };
  }

  it("방을 쓸 수 없으면(스냅샷 없음·방 사용 불가) 전송하지 않고 넘겨받은 URL 전부 해제", () => {
    const { live, urls, revoke } = setup(3);
    const out = claimMessengerImageSendPreviews([file(1), file(2), file(3)], urls, false, 10, revoke);
    expect(out).toBeNull();
    expect(live.size).toBe(0);
  });

  it("파일·미리보기 개수가 다르면 전송하지 않고 전부 해제", () => {
    const { live, urls, revoke } = setup(2);
    expect(claimMessengerImageSendPreviews([file(1)], urls, true, 10, revoke)).toBeNull();
    expect(live.size).toBe(0);
  });

  it("파일이 없으면 전부 해제", () => {
    const { live, urls, revoke } = setup(1);
    expect(claimMessengerImageSendPreviews([], urls, true, 10, revoke)).toBeNull();
    expect(live.size).toBe(0);
  });

  it("상한 초과분은 전송에 쓰지 않으므로 즉시 해제, 쓰는 URL 은 유지(이후 기존 전송 해제 경로가 해제)", () => {
    const { live, urls, revoke } = setup(12);
    const files = Array.from({ length: 12 }, (_, i) => file(i));
    const out = claimMessengerImageSendPreviews(files, urls, true, 10, revoke);
    expect(out?.files).toHaveLength(10);
    expect(out?.previews).toEqual(urls.slice(0, 10));
    expect([...live]).toEqual(urls.slice(0, 10));
  });

  it("정상 전송: 아무것도 해제하지 않는다", () => {
    const { live, urls, revoke } = setup(2);
    const out = claimMessengerImageSendPreviews([file(1), file(2)], urls, true, 10, revoke);
    expect(out?.previews).toEqual(urls);
    expect(live.size).toBe(2);
  });
});
