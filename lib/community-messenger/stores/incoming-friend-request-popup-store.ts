import { create } from "zustand";

export type IncomingGroupInvitePopupEntry = {
  id: string;
  roomId: string;
  roomTitle: string;
  inviterUserId: string;
  inviterLabel: string;
  createdAt: string;
  popupQueuedAtMs?: number;
};

export type IncomingFriendRequestPopupEntry = {
  id: string;
  requesterId: string;
  requesterLabel: string;
  requesterAvatarUrl?: string | null;
  /** DIBAY 아이디(@ 없이) */
  requesterHandle?: string | null;
  createdAt: string;
  popupQueuedAtMs?: number;
};

type IncomingFriendRequestPopupState = {
  groupInviteList: IncomingGroupInvitePopupEntry[];
  upsertGroupInvite: (invite: Omit<IncomingGroupInvitePopupEntry, "popupQueuedAtMs">) => void;
  dismissAllGroupInvites: () => void;
  dismissGroupInviteIfId: (id: string) => void;

  /** UI-only queue — dismiss does NOT reject DB pending. */
  friendRequestList: IncomingFriendRequestPopupEntry[];
  /** Session: dismissed from popup but still pending in DB/list — do not auto-reopen. */
  dismissedFriendRequestPopupIds: string[];
  upsertFriendRequest: (entry: Omit<IncomingFriendRequestPopupEntry, "popupQueuedAtMs">) => void;
  dismissFriendRequestIfId: (id: string) => void;
  dismissAllFriendRequests: () => void;
  removeFriendRequestIfId: (id: string) => void;
};

export const useIncomingFriendRequestPopupStore = create<IncomingFriendRequestPopupState>((set) => ({
  groupInviteList: [],
  upsertGroupInvite: (invite) => {
    const id = String(invite.id ?? "").trim();
    const roomId = String(invite.roomId ?? "").trim();
    if (!id || !roomId) return;
    set((s) => {
      const withoutSameRoom = s.groupInviteList.filter((r) => r.roomId !== roomId || r.id === id);
      const idx = withoutSameRoom.findIndex((r) => r.id === id);
      if (idx >= 0) {
        const prev = withoutSameRoom[idx];
        const next = [...withoutSameRoom];
        next[idx] = {
          ...prev,
          ...invite,
          roomTitle: invite.roomTitle?.trim() ? invite.roomTitle : prev.roomTitle,
          inviterLabel: invite.inviterLabel?.trim() ? invite.inviterLabel : prev.inviterLabel,
          popupQueuedAtMs: prev.popupQueuedAtMs,
        };
        return { groupInviteList: next };
      }
      const entry: IncomingGroupInvitePopupEntry = { ...invite, popupQueuedAtMs: Date.now() };
      return {
        groupInviteList: [entry, ...withoutSameRoom.filter((r) => r.roomId !== roomId)].slice(0, 6),
      };
    });
  },
  dismissAllGroupInvites: () => set({ groupInviteList: [] }),
  dismissGroupInviteIfId: (inviteId) => {
    const id = String(inviteId ?? "").trim();
    if (!id) return;
    set((s) => ({ groupInviteList: s.groupInviteList.filter((r) => r.id !== id) }));
  },

  friendRequestList: [],
  dismissedFriendRequestPopupIds: [],
  upsertFriendRequest: (raw) => {
    const id = String(raw.id ?? "").trim();
    const requesterId = String(raw.requesterId ?? "").trim();
    if (!id || !requesterId) return;
    set((s) => {
      if (s.dismissedFriendRequestPopupIds.includes(id)) return s;
      const idx = s.friendRequestList.findIndex((r) => r.id === id);
      if (idx >= 0) {
        const prev = s.friendRequestList[idx];
        const next = [...s.friendRequestList];
        next[idx] = {
          ...prev,
          ...raw,
          requesterLabel: raw.requesterLabel?.trim() ? raw.requesterLabel : prev.requesterLabel,
          popupQueuedAtMs: prev.popupQueuedAtMs,
        };
        return { friendRequestList: next };
      }
      const entry: IncomingFriendRequestPopupEntry = { ...raw, popupQueuedAtMs: Date.now() };
      return { friendRequestList: [entry, ...s.friendRequestList].slice(0, 8) };
    });
  },
  dismissFriendRequestIfId: (requestId) => {
    const id = String(requestId ?? "").trim();
    if (!id) return;
    set((s) => ({
      friendRequestList: s.friendRequestList.filter((r) => r.id !== id),
      dismissedFriendRequestPopupIds: s.dismissedFriendRequestPopupIds.includes(id)
        ? s.dismissedFriendRequestPopupIds
        : [...s.dismissedFriendRequestPopupIds, id].slice(-40),
    }));
  },
  dismissAllFriendRequests: () => set({ friendRequestList: [] }),
  removeFriendRequestIfId: (requestId) => {
    const id = String(requestId ?? "").trim();
    if (!id) return;
    set((s) => ({
      friendRequestList: s.friendRequestList.filter((r) => r.id !== id),
      dismissedFriendRequestPopupIds: s.dismissedFriendRequestPopupIds.filter((x) => x !== id),
    }));
  },
}));
