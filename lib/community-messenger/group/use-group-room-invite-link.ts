"use client";

import { useCallback, useEffect, useState } from "react";
import { communityMessengerGroupRoomApiPath } from "@/lib/community-messenger/group/group-room-deeplink";

export type GroupInviteLinkState = {
  inviteToken: string | null;
  inviteUrl: string | null;
  enabled: boolean;
};

export function useGroupRoomInviteLink(roomId: string, enabled: boolean) {
  const [state, setState] = useState<GroupInviteLinkState>({
    inviteToken: null,
    inviteUrl: null,
    enabled: false,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const rid = roomId.trim();
    if (!rid || !enabled) {
      setState({ inviteToken: null, inviteUrl: null, enabled: false });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${communityMessengerGroupRoomApiPath(rid)}/invite-link`);
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        inviteToken?: string;
        inviteUrl?: string;
        enabled?: boolean;
      };
      if (res.ok && json.ok) {
        setState({
          inviteToken: json.inviteToken?.trim() || null,
          inviteUrl: json.inviteUrl?.trim() || null,
          enabled: json.enabled !== false,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, refresh, setState };
}
