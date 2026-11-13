// @vitest-environment jsdom
/**
 * 채팅 시안 4판 3부 (Owner 「정확히 시안대로」 2026-11-10) — 「5. 새 대화」·「6. 친구 고르기」·「7. 채팅 설정」·「8. 채팅 검색」 화면 렌더 시험.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/community-messenger",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  /** 실제 카탈로그 값(ko)으로 그린다 — 화면 글자 그대로 확인 */
  const { translate } = await import("@/lib/i18n/messages");
  const t = (k: string, vars?: Record<string, string | number>) => translate("ko", k as never, vars);
  const value = { language: "ko", t, safeT: t, tt: (s: string) => s };
  return { useI18n: () => value };
});
vi.mock("@/components/profile/SamarketUserAvatarThumb", () => ({
  SamarketUserAvatarThumb: () => <span data-avatar="" />,
}));
vi.mock("@/components/community-messenger/CommunityMessengerDeviceSettingsSection", () => ({
  CommunityMessengerDeviceSettingsSection: () => <div data-device-settings="" />,
}));
vi.mock("@/lib/community-messenger/attachment/messenger-image-save", () => ({
  getMessengerPhotoSaveDiagnostics: () => Promise.resolve(null),
}));
vi.mock("@/components/community-messenger/MessengerChatListItem", () => ({
  MessengerChatListItem: ({ item }: { item: { room: { id: string; title: string } } }) => (
    <a data-room-row={item.room.id}>{item.room.title}</a>
  ),
}));

import { MessengerFriendPickerScreen } from "@/components/community-messenger/MessengerFriendPickerScreen";
import { MessengerSettingsScreen, type MessengerSettingsScreenProps } from "@/components/community-messenger/MessengerSettingsScreen";
import { MessengerChatSearchScreen } from "@/components/community-messenger/MessengerChatSearchScreen";
import { MessengerNewConversationSheet } from "@/components/community-messenger/MessengerNewConversationSheet";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const friend = (id: string, label: string) =>
  ({
    id,
    label,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
  }) as CommunityMessengerProfileLite;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});
const render = (node: ReactNode) => act(() => root.render(node));
const click = (el: Element | null) => {
  expect(el).not.toBeNull();
  act(() => (el as HTMLElement).click());
};

describe("「5. 새 대화」 시트", () => {
  it("1:1 대화 · 그룹 대화 두 줄 — 시안 문구, 누르면 시트를 닫고 친구 고르기로", () => {
    const onClose = vi.fn();
    const onPickDirect = vi.fn();
    const onPickGroup = vi.fn();
    render(<MessengerNewConversationSheet onClose={onClose} onPickDirect={onPickDirect} onPickGroup={onPickGroup} />);
    const sheet = document.querySelector("[data-cm-new-conversation-sheet]");
    expect(sheet?.textContent).toContain("새 대화");
    expect(sheet?.textContent).toContain("친구 한 명을 골라 바로 대화");
    expect(sheet?.textContent).toContain("친구 여러 명을 골라 그룹 만들기");
    click(document.querySelector('[data-cm-new-conversation-item="group"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPickGroup).toHaveBeenCalledTimes(1);
    expect(onPickDirect).not.toHaveBeenCalled();
  });

  it("누르자마자 열린다 — 지연 불러오기(dynamic) 없이 홈이 정적으로 불러 둔다", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const lazy = read("components/community-messenger/community-messenger-home-lazy-sheets.tsx");
    expect(home).toContain(
      'import { MessengerNewConversationSheet } from "@/components/community-messenger/MessengerNewConversationSheet";'
    );
    expect(lazy).not.toContain("MessengerNewConversationSheet\"");
    expect(lazy).not.toContain("export const MessengerNewConversationSheet");
  });
});

describe("「6. 친구 고르기」", () => {
  const friends = [friend("me", "나"), friend("a", "김선희"), friend("b", "Alyn Buque"), friend("c", "김광수")];

  function Group({ selected, onChange, onCreate }: { selected: string[]; onChange: (n: string[]) => void; onCreate: () => void }) {
    return (
      <MessengerFriendPickerScreen
        mode="group"
        friends={friends}
        viewerUserId="me"
        selectedIds={selected}
        onSelectedIdsChange={onChange}
        onPickDirect={vi.fn()}
        onCreateGroup={onCreate}
        creatingGroup={false}
      />
    );
  }

  it("그룹: 줄을 누르면 고르기 · 고른 친구 줄 · 「n명으로 그룹 만들기」(0명이면 못 누름)", () => {
    let selected: string[] = [];
    const onCreate = vi.fn();
    const onChange = (next: string[]) => {
      selected = next;
      render(<Group selected={selected} onChange={onChange} onCreate={onCreate} />);
    };
    render(<Group selected={selected} onChange={onChange} onCreate={onCreate} />);
    expect(document.querySelectorAll("[data-cm-friend-picker-row]")).toHaveLength(3);
    expect(document.querySelector('[data-cm-friend-picker-row="me"]')).toBeNull();
    const cta = () => document.querySelector("[data-cm-friend-picker-cta] button") as HTMLButtonElement;
    expect(cta().disabled).toBe(true);
    expect(document.querySelector("[data-cm-friend-picker-picked]")).toBeNull();

    click(document.querySelector('[data-cm-friend-picker-row="a"]'));
    click(document.querySelector('[data-cm-friend-picker-row="b"]'));
    expect(selected).toEqual(["a", "b"]);
    expect(cta().disabled).toBe(false);
    expect(cta().textContent).toBe("2명으로 그룹 만들기");
    expect(document.querySelector('[data-cm-friend-picker-row="a"]')?.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector("[data-cm-friend-picker-picked]")?.textContent).toBe("김선희Alyn Buque");

    click(cta());
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("1:1: 동그라미·아래 버튼 없음 — 친구를 누르면 바로 그 친구와 대화", () => {
    const onPickDirect = vi.fn();
    render(
      <MessengerFriendPickerScreen
        mode="direct"
        friends={friends}
        viewerUserId="me"
        selectedIds={[]}
        onSelectedIdsChange={vi.fn()}
        onPickDirect={onPickDirect}
        onCreateGroup={vi.fn()}
        creatingGroup={false}
      />
    );
    expect(document.querySelector("[data-cm-friend-picker-check]")).toBeNull();
    expect(document.querySelector("[data-cm-friend-picker-cta]")).toBeNull();
    click(document.querySelector('[data-cm-friend-picker-row="c"]'));
    expect(onPickDirect).toHaveBeenCalledWith("c");
  });
});

describe("「7. 채팅 설정」", () => {
  const baseProps = (over: Partial<MessengerSettingsScreenProps> = {}): MessengerSettingsScreenProps => ({
    page: "root",
    onOpenPage: vi.fn(),
    busyId: null,
    blockedCount: 1,
    hiddenCount: 2,
    favoriteManageFriends: [],
    notificationSettings: {
      trade_chat_enabled: true,
      community_chat_enabled: true,
      order_enabled: false,
      store_enabled: true,
      sound_enabled: true,
      vibration_enabled: true,
    },
    updateNotificationSettings: vi.fn(),
    incomingCallSoundEnabled: true,
    onIncomingCallSoundChange: vi.fn(),
    incomingCallBannerEnabled: false,
    onIncomingCallBannerChange: vi.fn(),
    localSettings: {
      phoneFriendAddEnabled: false,
      contactAutoAddEnabled: false,
      groupJoinPreviewEnabled: true,
      mediaAutoSaveEnabled: false,
    } as MessengerSettingsScreenProps["localSettings"],
    updateLocalSetting: vi.fn(),
    onOpenFriendManage: vi.fn(),
    onToggleFavoriteFriend: vi.fn(),
    exportSettingsBackup: vi.fn(),
    backupInputRef: createRef<HTMLInputElement>(),
    onBackupFileSelected: vi.fn(),
    onOpenOpenChatDiscovery: vi.fn(),
    onOpenOpenGroupCreate: vi.fn(),
    ...over,
  });

  it("첫 화면: 알림 4줄(같은 서버 설정) · 통화·대화·모임·친구 줄 → 상세", () => {
    const props = baseProps();
    render(<MessengerSettingsScreen {...props} />);
    const switches = [...document.querySelectorAll('[role="switch"]')];
    expect(switches.map((s) => s.getAttribute("aria-label"))).toEqual([
      "LETARING · 1:1 채팅",
      "거래 채팅",
      "주문 · 배달",
      "소리 · 진동",
    ]);
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "true", "false", "true"]);
    click(switches[2]);
    expect(props.updateNotificationSettings).toHaveBeenCalledWith({ order_enabled: true });
    click(switches[3]);
    expect(props.updateNotificationSettings).toHaveBeenCalledWith({ sound_enabled: false, vibration_enabled: false });
    click(document.querySelector('[data-cm-settings-nav="call"]'));
    click(document.querySelector('[data-cm-settings-nav="meeting"]'));
    expect(props.onOpenPage).toHaveBeenNthCalledWith(1, "call");
    expect(props.onOpenPage).toHaveBeenNthCalledWith(2, "meeting");
  });

  it("상세: 통화(수신 벨·화면 안내·기기) · 모임(찾기·만들기) · 친구(연락처 동기화 진입·즐겨찾기·친구 관리)", () => {
    const call = baseProps({ page: "call" });
    render(<MessengerSettingsScreen {...call} />);
    expect(document.querySelector("[data-device-settings]")).not.toBeNull();
    click(document.querySelector('[role="switch"][aria-label="수신 통화 화면 안내"]'));
    expect(call.onIncomingCallBannerChange).toHaveBeenCalledWith(true);

    const meeting = baseProps({ page: "meeting" });
    render(<MessengerSettingsScreen {...meeting} />);
    click(document.querySelector('[data-cm-settings-nav="meeting-find"]'));
    click(document.querySelector('[data-cm-settings-nav="meeting-create"]'));
    expect(meeting.onOpenOpenChatDiscovery).toHaveBeenCalledTimes(1);
    expect(meeting.onOpenOpenGroupCreate).toHaveBeenCalledTimes(1);

    const friends = baseProps({ page: "friends" });
    render(<MessengerSettingsScreen {...friends} />);
    // 연락처 동기화 2단계 (SSOT messenger-contacts-sync-plan v5 §13): 무동작 스위치 2개 → 「연락처 동기화」 설정 진입 1줄
    expect(document.querySelector('[role="switch"][aria-label="전화번호로 친구 추가"]')).toBeNull();
    expect(document.querySelector('[data-cm-settings-nav="contacts-sync"]')).not.toBeNull();
    click(document.querySelector('[data-cm-settings-nav="friend-manage"]'));
    expect(friends.onOpenFriendManage).toHaveBeenCalledTimes(1);
  });
});

describe("「8. 채팅 검색」", () => {
  const room = (id: string, title: string, preview: string) =>
    ({ room: { id, title }, preview, lastEventAt: new Date().toISOString() }) as never;

  const props = (over: Record<string, unknown> = {}) => ({
    keyword: "",
    onKeywordChange: vi.fn(),
    recentSearches: ["김선희", "영양제"],
    onCommitRecentSearch: vi.fn(),
    onRemoveRecentSearch: vi.fn(),
    onClearRecentSearches: vi.fn(),
    searchFriendMatches: [friend("a", "김선희")],
    searchRoomMatches: [room("r1", "김선희", "안녕")],
    searchMessageMatches: [room("r2", "모임방", "김선희 왔어요")],
    searchOpenChatMatches: [],
    viewerUserId: "me",
    favoriteFriendIds: new Set<string>(),
    busyId: null,
    onTogglePin: vi.fn(),
    onToggleMute: vi.fn(),
    onMarkRead: vi.fn(),
    onToggleArchive: vi.fn(),
    onSelectFriend: vi.fn(),
    onSelectOpenGroup: vi.fn(),
    onSelectMessageRoom: vi.fn(),
    ...over,
  });

  it("검색어 없음: 최근 검색 · 「전체 삭제」 · 줄마다 ✕", () => {
    const p = props();
    render(<MessengerChatSearchScreen {...p} />);
    expect(document.querySelector("[data-cm-chat-search-recent]")?.textContent).toContain("최근 검색");
    click(document.querySelector("[data-cm-chat-search-clear-all]"));
    expect(p.onClearRecentSearches).toHaveBeenCalledTimes(1);
    click(document.querySelectorAll("[data-cm-chat-search-remove]")[1]!);
    expect(p.onRemoveRecentSearch).toHaveBeenCalledWith("영양제");
    expect(document.querySelector("input")?.getAttribute("placeholder")).toBe("대화·친구·메시지 검색");
  });

  it("탭: 전체 = 대화·친구·메시지(·모임) / 대화 / 친구 / 메시지 만", () => {
    render(<MessengerChatSearchScreen {...props({ keyword: "김선희" })} />);
    const sections = () =>
      [...document.querySelectorAll("[data-cm-chat-search-section]")].map((s) => s.getAttribute("data-cm-chat-search-section"));
    expect(sections()).toEqual(["rooms", "friends", "messages"]);
    click(document.querySelector('[data-cm-chat-search-tab="friends"]'));
    expect(sections()).toEqual(["friends"]);
    click(document.querySelector('[data-cm-chat-search-tab="messages"]'));
    expect(sections()).toEqual(["messages"]);
    click(document.querySelector('[data-cm-chat-search-tab="rooms"]'));
    expect(sections()).toEqual(["rooms"]);
    expect(document.querySelector('[data-room-row="r1"]')).not.toBeNull();
  });
});
