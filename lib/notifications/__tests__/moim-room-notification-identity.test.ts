import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 R5 A14 · A23 · A19 — 모임 방 알림은 모임 프로필로, 고정 알림은 방 알림 끄기를 따른다.
 * 고치기 전:
 * - A14 푸시·알림함 보낸 사람 = DIBAY 닉네임/@아이디·DIBAY 사진(방 프로필을 보지 않음 — 계약 §4 「보이지 않는 것: DIBAY ID」)
 * - A14 배너 = members 에 없으면 `senderLabel`(메신저 프로필)
 * - A23 알림 끈 사람에게도 고정 푸시를 보냄
 * - A19 모임 사진을 비우면 DIBAY 사진
 */

const pushDispatch = vi.fn(async () => undefined);
const createEvent = vi.fn(async (_sb: unknown, input: Record<string, unknown>) => ({ ok: true, row: { id: `ev-${String(input.userId)}`, ...input } }));
vi.mock("@/lib/notifications/pipeline/notify-push-dispatcher", () => ({
  dispatchNotificationPushIfAllowed: (...a: unknown[]) => pushDispatch(...(a as [])),
}));
vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...a: [unknown, Record<string, unknown>]) => createEvent(...a),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: async () => "ko",
}));

import { translate } from "@/lib/i18n/messages";
import {
  CM_ROOM_ROW_FOR_NOTIFY_SELECT,
  buildRecipientMessageNotificationDisplay,
  loadMessageNotificationDisplaySharedContext,
} from "@/lib/notifications/display/load-message-notification-display-context";
import { buildMessengerInAppBannerContent } from "@/lib/community-messenger/notifications/messenger-in-app-banner-content";
import { notifyGroupPinMessage } from "@/lib/community-messenger/group/group-room-pin-notify";

type Call = { table: string; select?: string; filters: string[] };

const SENDER = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";

function fakeSb(tables: Record<string, unknown>) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const entry: Call = { table, filters: [] };
      calls.push(entry);
      const data = tables[table];
      const chain: Record<string, unknown> = {};
      chain.select = (cols?: string) => {
        entry.select = cols;
        return chain;
      };
      for (const m of ["eq", "is", "in"]) {
        chain[m] = (col: string, v: unknown) => {
          entry.filters.push(`${m}:${col}=${String(v)}`);
          return chain;
        };
      }
      chain.maybeSingle = async () => ({ data: Array.isArray(data) ? data[0] ?? null : data ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error: null });
      return chain;
    },
  };
}

const roomRow = (over: Record<string, unknown> = {}) => ({
  title: "BGC 배드민턴",
  room_type: "private_group",
  chat_domain: "group",
  owner_domain: "moim",
  community_messenger_room_profiles: [{ user_id: SENDER, identity_mode: "alias", display_name: "민지(초보)", avatar_url: "https://img/moim.jpg" }],
  ...over,
});

const tables = (room: Record<string, unknown>, profile: Record<string, unknown> = { id: SENDER, nickname: "닉네임", dibay_id: "minji99", avatar_url: "https://img/dibay.jpg" }) => ({
  community_messenger_rooms: room,
  profiles: profile,
  community_messenger_messages: { message_type: "text", content: "안녕하세요" },
  user_settings: [],
});

const shared = (sb: ReturnType<typeof fakeSb>) =>
  loadMessageNotificationDisplaySharedContext(sb as never, {
    roomId: ROOM,
    messageId: "msg-1",
    senderUserId: SENDER,
    recipientUserIds: ["r1"],
    roomKind: "group",
  });

beforeEach(() => vi.clearAllMocks());

describe("A14 서버 — 푸시·알림함 보낸 사람 = 방 프로필", () => {
  it("모임 방 + 별칭 「민지(초보)」 → 이름·사진이 모임 프로필 (고치기 전: 닉네임 · DIBAY 사진)", async () => {
    const ctx = await shared(fakeSb(tables(roomRow())));
    expect(ctx.sender).toEqual({ displayName: "민지(초보)", avatarUrl: "https://img/moim.jpg" });
    const display = await buildRecipientMessageNotificationDisplay(
      fakeSb({}) as never,
      { roomId: ROOM, messageId: "msg-1", senderUserId: SENDER, recipientUserId: "r1", roomKind: "group" },
      ctx,
      "ko"
    );
    expect(display.title).toBe("BGC 배드민턴");
    expect(display.body).toBe("민지(초보): 안녕하세요");
    expect(display.senderAvatarUrl).toBe("https://img/moim.jpg");
  });

  it("모임 방 + 별칭 빈칸 + 닉네임 없음 + 아이디 있음 → 받는 사람 언어 대체 이름 (고치기 전: @아이디)", async () => {
    const ctx = await shared(
      fakeSb(
        tables(roomRow({ community_messenger_room_profiles: [{ user_id: SENDER, display_name: "", avatar_url: null }] }), {
          id: SENDER,
          nickname: "",
          dibay_id: "minji99",
          avatar_url: "https://img/dibay.jpg",
        })
      )
    );
    expect(ctx.sender).toEqual({ displayName: "", avatarUrl: null });
    const display = await buildRecipientMessageNotificationDisplay(
      fakeSb({}) as never,
      { roomId: ROOM, messageId: "msg-1", senderUserId: SENDER, recipientUserId: "r1", roomKind: "group" },
      ctx,
      "ko"
    );
    expect(display.senderName).toBe(translate("ko", "notify_peer_fallback"));
    expect(display.body).not.toContain("minji99");
  });

  it("모임 방 + 방 프로필 행 없음 → 이름 빈 값·사진 null (DIBAY 사진으로 대신 채우지 않음)", async () => {
    const ctx = await shared(fakeSb(tables(roomRow({ community_messenger_room_profiles: [] }))));
    expect(ctx.sender).toEqual({ displayName: "", avatarUrl: null });
  });

  it("일반 그룹 → 지금과 같음(닉네임·DIBAY 사진)", async () => {
    const ctx = await shared(fakeSb(tables(roomRow({ owner_domain: null }))));
    expect(ctx.sender).toEqual({ displayName: "닉네임", avatarUrl: "https://img/dibay.jpg" });
  });

  it("요청 수 그대로(4) · 방 행 조회 1번에 묶음 조회 · select 문자열 고정", async () => {
    const sb = fakeSb(tables(roomRow()));
    await shared(sb);
    expect(sb.calls.map((c) => c.table).sort()).toEqual(["community_messenger_messages", "community_messenger_rooms", "profiles", "user_settings"]);
    const roomCall = sb.calls.find((c) => c.table === "community_messenger_rooms")!;
    expect(roomCall.select).toBe(CM_ROOM_ROW_FOR_NOTIFY_SELECT);
    expect(CM_ROOM_ROW_FOR_NOTIFY_SELECT).toBe(
      "title, room_type, direct_key, summary, chat_domain, domain_identity_key, domain_identity, owner_domain, community_messenger_room_profiles(user_id, identity_mode, display_name, avatar_url)"
    );
    expect(roomCall.filters).toContain(`eq:community_messenger_room_profiles.user_id=${SENDER}`);
  });

  it("보낸 사람 id 가 uuid 가 아니면 묶음 없이 읽는다(방 행 조회 실패 방지)", async () => {
    const sb = fakeSb(tables(roomRow()));
    await loadMessageNotificationDisplaySharedContext(sb as never, {
      roomId: ROOM,
      messageId: "msg-1",
      senderUserId: "system",
      recipientUserIds: ["r1"],
      roomKind: "group",
    });
    const roomCall = sb.calls.find((c) => c.table === "community_messenger_rooms")!;
    expect(roomCall.select).not.toContain("community_messenger_room_profiles");
  });
});

describe("A14 앱 안 배너", () => {
  const room = { id: ROOM, title: "BGC 배드민턴", roomType: "private_group", chatDomain: "group", avatarUrl: "https://img/room.jpg" } as never;
  const message = {
    id: "m1",
    senderId: SENDER,
    senderLabel: "닉네임(메신저)",
    messageType: "text",
    content: "안녕하세요",
    createdAt: new Date().toISOString(),
    isMine: false,
  } as never;

  it("모임 방 + members 에 없음 → 이름 없는 본문 · 사진 없음 (고치기 전: senderLabel 사용)", () => {
    const out = buildMessengerInAppBannerContent({
      room,
      members: [],
      messages: [message],
      viewerUserId: "viewer",
      language: "ko",
      chatPreviewEnabled: true,
      moimManaged: true,
    });
    expect(out).toMatchObject({ title: "BGC 배드민턴", preview: "안녕하세요", avatarUrl: null });
  });

  it("모임 방 + members 에 있음 → 모임 별칭·모임 사진", () => {
    const out = buildMessengerInAppBannerContent({
      room,
      members: [{ id: SENDER, label: "민지(초보)", avatarUrl: "https://img/moim.jpg" }],
      messages: [message],
      viewerUserId: "viewer",
      language: "ko",
      chatPreviewEnabled: true,
      moimManaged: true,
    });
    expect(out).toMatchObject({ preview: "민지(초보): 안녕하세요", avatarUrl: "https://img/moim.jpg" });
  });

  it("일반 그룹(moimManaged 없음) → 기존대로 senderLabel", () => {
    const out = buildMessengerInAppBannerContent({
      room,
      members: [],
      messages: [message],
      viewerUserId: "viewer",
      language: "ko",
      chatPreviewEnabled: true,
    });
    expect(out?.preview).toBe("닉네임(메신저): 안녕하세요");
  });
});

describe("A23 고정 알림 = 방 알림 끄기를 따른다", () => {
  it("끈 사람: 알림 행 mutedSnapshot true · 푸시 안 보냄 / 켠 사람: 그대로", async () => {
    const sb = fakeSb({
      community_messenger_participants: [
        { user_id: "actor", is_muted: false },
        { user_id: "muted-user", is_muted: true },
        { user_id: "on-user", is_muted: false },
      ],
    });
    await notifyGroupPinMessage(sb as never, { roomId: ROOM, actorUserId: "actor", messageId: "msg-1", pinned: true });
    expect(sb.calls[0].select).toBe("user_id, is_muted");
    const byUser = Object.fromEntries(createEvent.mock.calls.map(([, input]) => [String(input.userId), input]));
    expect(Object.keys(byUser).sort()).toEqual(["muted-user", "on-user"]);
    expect(byUser["muted-user"]).toMatchObject({ mutedSnapshot: true, pushSuppressedReason: "muted_room", soundSuppressedReason: "muted_room" });
    expect(byUser["on-user"]).toMatchObject({ mutedSnapshot: false, pushSuppressedReason: null, soundSuppressedReason: null });
    const pushed = (pushDispatch.mock.calls as unknown as Array<[unknown, { userId: string }]>).map(([, row]) => row.userId);
    expect(pushed).toEqual(["on-user"]);
  });
});
