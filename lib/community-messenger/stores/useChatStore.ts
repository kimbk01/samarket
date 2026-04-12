import { create } from "zustand";

/**
 * 목록 UI·낙관적 업데이트용 채팅방 요약.
 * 서버 `CommunityMessengerRoomSummary` 와 호환되도록 필드 정렬.
 */
export type ChatStoreRoomType = "direct" | "group" | "openchat" | "trade" | "delivery";

export type ChatStoreLastEventType =
  | "message"
  | "voice_call"
  | "video_call"
  | "missed_call"
  | "declined_call"
  | "canceled_call"
  | "failed_call"
  | "order_update"
  | "trade_update"
  | "system";

export type ChatStoreRoom = {
  id: string;
  type: ChatStoreRoomType;
  name: string;
  imageUrl: string | null;
  memberCount: number;
  /** 1:1 대화 상대 user id */
  targetId: string | null;
  lastEventType: ChatStoreLastEventType;
  lastEventText: string;
  lastEventAt: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
};

type ChatState = {
  rooms: ChatStoreRoom[];
  currentRoomId: string | null;

  setRooms: (rooms: ChatStoreRoom[]) => void;
  upsertRoom: (room: ChatStoreRoom) => void;
  setCurrentRoom: (roomId: string | null) => void;
  markRoomRead: (roomId: string) => void;
  togglePin: (roomId: string) => void;
  toggleMute: (roomId: string) => void;
  archiveRoom: (roomId: string) => void;
  restoreRoom: (roomId: string) => void;
  updateRoomLastEvent: (
    roomId: string,
    patch: {
      lastEventType: ChatStoreLastEventType;
      lastEventText: string;
      lastEventAt: string;
      incrementUnread?: boolean;
    }
  ) => void;
};

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  currentRoomId: null,

  setRooms: (rooms) => set({ rooms }),

  upsertRoom: (room) =>
    set((state) => {
      const idx = state.rooms.findIndex((r) => r.id === room.id);
      if (idx === -1) return { rooms: [room, ...state.rooms] };
      const next = [...state.rooms];
      next[idx] = room;
      return { rooms: next };
    }),

  setCurrentRoom: (currentRoomId) => set({ currentRoomId }),

  markRoomRead: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
    })),

  togglePin: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, isPinned: !r.isPinned } : r)),
    })),

  toggleMute: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, isMuted: !r.isMuted } : r)),
    })),

  archiveRoom: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, isArchived: true } : r)),
    })),

  restoreRoom: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, isArchived: false } : r)),
    })),

  updateRoomLastEvent: (roomId, patch) => {
    const { rooms } = get();
    const idx = rooms.findIndex((r) => r.id === roomId);
    if (idx === -1) return;
    const prev = rooms[idx]!;
    const unread =
      patch.incrementUnread === true ? prev.unreadCount + 1 : patch.incrementUnread === false ? 0 : prev.unreadCount;
    const nextRoom: ChatStoreRoom = {
      ...prev,
      lastEventType: patch.lastEventType,
      lastEventText: patch.lastEventText,
      lastEventAt: patch.lastEventAt,
      unreadCount: unread,
    };
    const rest = rooms.filter((_, i) => i !== idx);
    set({ rooms: [nextRoom, ...rest] });
  },
}));
