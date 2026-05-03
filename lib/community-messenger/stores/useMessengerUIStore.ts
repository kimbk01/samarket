import { create } from "zustand";

export type MessengerActiveSection = "friends" | "chats" | "openchat" | "archive";

export type MessengerChatFilter =
  | "all"
  | "unread"
  | "pinned"
  | "direct"
  | "group"
  | "trade"
  | "delivery";

type MessengerUIState = {
  activeSection: MessengerActiveSection;
  activeChatFilter: MessengerChatFilter;
  isSearchOpen: boolean;
  isAlertOpen: boolean;
  isSettingsOpen: boolean;
  isAddFriendOpen: boolean;
  isNewChatOpen: boolean;
  selectedRoomId: string | null;
  selectedFriendId: string | null;
  /** 채팅방 하단 입력 포커스 — 스크롤·키보드 보조 */
  composerFocused: boolean;

  setActiveSection: (section: MessengerActiveSection) => void;
  setActiveChatFilter: (filter: MessengerChatFilter) => void;
  openSearch: () => void;
  closeSearch: () => void;
  openAlert: () => void;
  closeAlert: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAddFriend: () => void;
  closeAddFriend: () => void;
  openNewChat: () => void;
  closeNewChat: () => void;
  selectRoom: (roomId: string | null) => void;
  selectFriend: (friendId: string | null) => void;
  setComposerFocused: (v: boolean) => void;
};

export const useMessengerUIStore = create<MessengerUIState>((set) => ({
  activeSection: "chats",
  activeChatFilter: "all",
  isSearchOpen: false,
  isAlertOpen: false,
  isSettingsOpen: false,
  isAddFriendOpen: false,
  isNewChatOpen: false,
  selectedRoomId: null,
  selectedFriendId: null,
  composerFocused: false,

  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveChatFilter: (activeChatFilter) => set({ activeChatFilter }),
  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false }),
  openAlert: () => set({ isAlertOpen: true }),
  closeAlert: () => set({ isAlertOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddFriend: () => set({ isAddFriendOpen: true }),
  closeAddFriend: () => set({ isAddFriendOpen: false }),
  openNewChat: () => set({ isNewChatOpen: true }),
  closeNewChat: () => set({ isNewChatOpen: false }),
  selectRoom: (selectedRoomId) => set({ selectedRoomId }),
  selectFriend: (selectedFriendId) => set({ selectedFriendId }),
  setComposerFocused: (composerFocused) => set({ composerFocused }),
}));
