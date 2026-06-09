import { create } from "zustand";
import type { CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

/** 글로벌 팝업 전용 — 알림이 부트스트랩보다 빠를 때 동기화가 팝업을 지우지 않게 하는 타임스탬프 */
export type IncomingFriendRequestPopupEntry = CommunityMessengerFriendRequest & {
  popupQueuedAtMs?: number;
};

export type IncomingGroupInvitePopupEntry = {
  id: string;
  roomId: string;
  roomTitle: string;
  inviterUserId: string;
  inviterLabel: string;
  createdAt: string;
  popupQueuedAtMs?: number;
};

/** 알림 INSERT 후 부트스트랩 `requests`(pending만) 갱신 지연 동안 팝업 유지 */
const BOOTSTRAP_PENDING_GRACE_MS = 45_000;

type IncomingFriendRequestPopupState = {
  /** 동시에 여러 수신 요청을 스택으로 표시 */
  incomingList: IncomingFriendRequestPopupEntry[];
  /** 그룹 초대는 이미 참가자 추가가 완료된 알림이므로 친구 요청과 별도 액션으로 표시 */
  groupInviteList: IncomingGroupInvitePopupEntry[];
  upsertIncoming: (req: CommunityMessengerFriendRequest) => void;
  upsertGroupInvite: (invite: Omit<IncomingGroupInvitePopupEntry, "popupQueuedAtMs">) => void;
  dismissAllIncoming: () => void;
  dismissIncomingIfRequestId: (requestId: string) => void;
  dismissGroupInviteIfId: (id: string) => void;
  /**
   * 부트스트랩 `requests` 와 동기화.
   * - 목록에 같은 id 가 있으면 incoming·pending 일 때만 유지.
   * - 없으면: 최근 알림으로 넣은 행(Grace)은 부트스트랩 지연을 허용하고, 그 외는 제거(수락/거절 등으로 pending 에 없음).
   */
  syncIncomingFromBootstrapRequests: (requests: CommunityMessengerFriendRequest[] | undefined) => void;
};

export const useIncomingFriendRequestPopupStore = create<IncomingFriendRequestPopupState>((set, get) => ({
  incomingList: [],
  groupInviteList: [],
  upsertIncoming: (req) => {
    const id = String(req.id ?? "").trim();
    if (!id) return;
    set((s) => {
      const idx = s.incomingList.findIndex((r) => r.id === id);
      if (idx >= 0) {
        const prev = s.incomingList[idx];
        const next = [...s.incomingList];
        next[idx] = {
          ...prev,
          ...req,
          requesterLabel: req.requesterLabel?.trim() ? req.requesterLabel : prev.requesterLabel,
          addresseeLabel: req.addresseeLabel?.trim() ? req.addresseeLabel : prev.addresseeLabel,
          popupQueuedAtMs: prev.popupQueuedAtMs,
        };
        return { incomingList: next };
      }
      const entry: IncomingFriendRequestPopupEntry = { ...req, popupQueuedAtMs: Date.now() };
      return { incomingList: [entry, ...s.incomingList] };
    });
  },
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
      return { groupInviteList: [entry, ...withoutSameRoom.filter((r) => r.roomId !== roomId)].slice(0, 6) };
    });
  },
  dismissAllIncoming: () => set({ incomingList: [], groupInviteList: [] }),
  dismissIncomingIfRequestId: (requestId) => {
    const id = String(requestId ?? "").trim();
    if (!id) return;
    set((s) => ({ incomingList: s.incomingList.filter((r) => r.id !== id) }));
  },
  dismissGroupInviteIfId: (inviteId) => {
    const id = String(inviteId ?? "").trim();
    if (!id) return;
    set((s) => ({ groupInviteList: s.groupInviteList.filter((r) => r.id !== id) }));
  },
  syncIncomingFromBootstrapRequests: (requests) => {
    const list = requests ?? [];
    const now = Date.now();
    set((s) => ({
      incomingList: s.incomingList
        .map((r) => {
          const match = list.find((x) => x.id === r.id);
          if (!match || match.direction !== "incoming") return r;
          return {
            ...r,
            requesterId: match.requesterId,
            requesterLabel: match.requesterLabel?.trim() ? match.requesterLabel : r.requesterLabel,
            addresseeId: match.addresseeId,
            addresseeLabel: match.addresseeLabel?.trim() ? match.addresseeLabel : r.addresseeLabel,
            status: match.status,
            direction: match.direction,
            createdAt: match.createdAt,
          };
        })
        .filter((r) => {
          const match = list.find((x) => x.id === r.id);
          if (match) return match.direction === "incoming" && match.status === "pending";
          const queued = r.popupQueuedAtMs ?? 0;
          if (queued && now - queued < BOOTSTRAP_PENDING_GRACE_MS) return true;
          return false;
        }),
    }));
  },
}));
