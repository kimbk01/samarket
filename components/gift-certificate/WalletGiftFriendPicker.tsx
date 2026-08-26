"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";

type FriendRow = {
  id: string;
  displayName?: string | null;
  nickname?: string | null;
};

/**
 * Wallet → friend pick → open general_direct → same Gift Offer flow (preselected instance).
 */
export function WalletGiftFriendPicker({
  open,
  onClose,
  instanceId,
}: {
  open: boolean;
  onClose: () => void;
  instanceId: string;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReady(false);
    try {
      const res = await fetch("/api/community-messenger/friends", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        friends?: FriendRow[];
        data?: { friends?: FriendRow[] };
      };
      const list = json.friends ?? json.data?.friends ?? [];
      setFriends(Array.isArray(list) ? list : []);
    } catch {
      setFriends([]);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    void load();
  }, [open, load]);

  const pick = async (peerUserId: string) => {
    if (busyId) return;
    setBusyId(peerUserId);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/community-messenger/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomType: "direct", peerUserId }),
      });
      const json = (await res.json()) as { ok?: boolean; roomId?: string; error?: string };
      if (!res.ok || !json.ok || !json.roomId) {
        setErrorMsg(
          safeT("gift_u3_err_not_friend", {
            fallbackKo: "친구에게만 상품권을 선물할 수 있습니다.",
            fallbackEn: "You can only send gift certificates to friends.",
          })
        );
        return;
      }
      onClose();
      const q = new URLSearchParams({
        giftInstanceId: instanceId,
        openGift: "1",
      });
      router.push(
        `/community-messenger/rooms/${encodeURIComponent(json.roomId)}?${q.toString()}`
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("gift_u3_friend_pick_title", {
        fallbackKo: "선물할 친구",
        fallbackEn: "Choose a friend",
      })}
    >
      <div className="px-4 pb-4" data-wallet-gift-friend-picker="1">
        {errorMsg ? <p className="mb-2 text-sm text-sam-danger">{errorMsg}</p> : null}
        {!ready ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("gift_u3_friend_pick_empty", {
              fallbackKo: "선물할 수 있는 친구가 없습니다.",
              fallbackEn: "No friends available to gift.",
            })}
          </p>
        ) : (
          <ul className="space-y-2">
            {friends.map((f) => {
              const label = String(f.displayName || f.nickname || f.id).trim();
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`${Sam.btn.secondary} flex min-h-[48px] w-full items-center justify-between px-3 text-left`}
                    disabled={busyId === f.id}
                    data-wallet-gift-friend={f.id}
                    onClick={() => void pick(f.id)}
                  >
                    <span className="truncate">{label}</span>
                    <span>›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DibayBottomSheet>
  );
}
