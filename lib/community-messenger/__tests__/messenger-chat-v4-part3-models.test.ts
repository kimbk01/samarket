import { describe, expect, it } from "vitest";
import {
  canCreateMessengerPickerGroup,
  filterMessengerPickerFriends,
  toggleMessengerPickerSelection,
} from "@/lib/community-messenger/messenger-friend-picker";
import {
  MESSENGER_CHAT_SEARCH_TABS,
  messengerChatSearchSections,
  pushMessengerRecentSearch,
} from "@/lib/community-messenger/messenger-chat-search-model";
import {
  MESSENGER_SETTINGS_ROOT_GROUPS,
  messengerNotificationSettingsBusyKey,
  messengerSoundVibrationChecked,
  messengerSoundVibrationPatch,
} from "@/lib/community-messenger/messenger-settings-screen-model";
import { translate } from "@/lib/i18n/messages";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

const friend = (id: string, label: string, extra: Partial<CommunityMessengerProfileLite> = {}) =>
  ({
    id,
    label,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    ...extra,
  }) as CommunityMessengerProfileLite;

describe("친구 고르기 (채팅 시안 4판 「6」)", () => {
  const friends = [friend("me", "나"), friend("a", "김선희"), friend("b", "Alyn Buque"), friend("c", "차단", { blocked: true })];

  it("나·차단 상대는 빼고, 이름으로 찾는다 (대소문자 무시)", () => {
    expect(filterMessengerPickerFriends(friends, { viewerUserId: "me", query: "" }).map((f) => f.id)).toEqual(["a", "b"]);
    expect(filterMessengerPickerFriends(friends, { viewerUserId: "me", query: "alyn" }).map((f) => f.id)).toEqual(["b"]);
    expect(filterMessengerPickerFriends(friends, { viewerUserId: "me", query: "없음" })).toEqual([]);
  });

  it("고르기·빼기는 고른 순서를 지키고, 1명부터 그룹을 만들 수 있다 (서버 members_required 와 같음)", () => {
    let ids: string[] = [];
    ids = toggleMessengerPickerSelection(ids, "b");
    ids = toggleMessengerPickerSelection(ids, "a");
    expect(ids).toEqual(["b", "a"]);
    ids = toggleMessengerPickerSelection(ids, "b");
    expect(ids).toEqual(["a"]);
    expect(canCreateMessengerPickerGroup(0)).toBe(false);
    expect(canCreateMessengerPickerGroup(ids.length)).toBe(true);
    expect(translate("ko", "cm_pick_create_group_cta", { count: 2 })).toBe("2명으로 그룹 만들기");
  });
});

describe("채팅 설정 (채팅 시안 4판 「7」)", () => {
  it("첫 화면 묶음 순서 — 통화 · 대화 · 모임 (+ 기존 친구 항목을 모은 「친구」)", () => {
    expect(MESSENGER_SETTINGS_ROOT_GROUPS.map((g) => g.page)).toEqual(["call", "conversation", "meeting", "friends"]);
    expect(MESSENGER_SETTINGS_ROOT_GROUPS.map((g) => translate("ko", g.rowKey))).toEqual([
      "수신 벨 · 화면 안내 · 마이크 · 카메라",
      "사진 자동 저장 · 대화 백업",
      "모임 찾기 · 모임 만들기",
      "전화번호 · 연락처 · 즐겨찾기",
    ]);
  });

  it("「소리 · 진동」 = 서버 소리·진동 두 칸을 함께 — 둘 다 켜져야 켜짐", () => {
    expect(messengerSoundVibrationChecked({ sound_enabled: true, vibration_enabled: true })).toBe(true);
    expect(messengerSoundVibrationChecked({ sound_enabled: true, vibration_enabled: false })).toBe(false);
    expect(messengerSoundVibrationPatch(false)).toEqual({ sound_enabled: false, vibration_enabled: false });
    expect(messengerNotificationSettingsBusyKey(messengerSoundVibrationPatch(true))).toBe(
      "notification-setting:sound_enabled+vibration_enabled"
    );
    expect(messengerNotificationSettingsBusyKey({ trade_chat_enabled: true })).toBe("notification-setting:trade_chat_enabled");
  });
});

describe("채팅 검색 (채팅 시안 4판 「8」)", () => {
  it("탭 전체·대화·친구·메시지 — 탭마다 보이는 결과 묶음", () => {
    expect(MESSENGER_CHAT_SEARCH_TABS.map((x) => translate("ko", x.labelKey))).toEqual(["전체", "대화", "친구", "메시지"]);
    expect(messengerChatSearchSections("all")).toEqual(["rooms", "friends", "messages", "meetings"]);
    expect(messengerChatSearchSections("rooms")).toEqual(["rooms"]);
    expect(messengerChatSearchSections("friends")).toEqual(["friends"]);
    expect(messengerChatSearchSections("messages")).toEqual(["messages"]);
  });

  it("최근 검색 — 맨 앞에 · 같은 말 하나 · 최대 8개 · 빈 말 무시", () => {
    const eight = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(pushMessengerRecentSearch(eight, " 2 ")).toEqual(["2", "1", "3", "4", "5", "6", "7", "8"]);
    expect(pushMessengerRecentSearch(eight, "9")).toEqual(["9", "1", "2", "3", "4", "5", "6", "7"]);
    expect(pushMessengerRecentSearch(["a"], "  ")).toEqual(["a"]);
  });
});
