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

type IncomingGroupInvitePopupState = {
  groupInviteList: IncomingGroupInvitePopupEntry[];
  upsertGroupInvite: (invite: Omit<IncomingGroupInvitePopupEntry, "popupQueuedAtMs">) => void;
  dismissAllGroupInvites: () => void;
  dismissGroupInviteIfId: (id: string) => void;
};

export const useIncomingFriendRequestPopupStore = create<IncomingGroupInvitePopupState>((set) => ({
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
}));
