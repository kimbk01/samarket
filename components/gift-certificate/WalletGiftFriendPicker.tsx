"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import type { GiftInstanceDetail } from "@/lib/gift-certificate/load-gift-instance-detail";
import { Sam } from "@/lib/ui/sam-component-classes";

type FriendRow = {
  id: string;
  label?: string | null;
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
  const [instance, setInstance] = useState<GiftInstanceDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReady(false);
    try {
      const [friendsRes, instanceRes] = await Promise.all([
        fetch("/api/me/gift-certificates/friends/eligible", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/me/gift-certificates/instances/${encodeURIComponent(instanceId)}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);
      const friendsJson = (await friendsRes.json()) as {
        ok?: boolean;
        friends?: FriendRow[];
        data?: { friends?: FriendRow[] };
      };
      const list = friendsJson.friends ?? friendsJson.data?.friends ?? [];
      setFriends(Array.isArray(list) ? list : []);

      const instanceJson = (await instanceRes.json()) as { ok?: boolean; instance?: GiftInstanceDetail };
      setInstance(instanceJson.ok ? instanceJson.instance ?? null : null);
    } catch {
      setFriends([]);
      setInstance(null);
    } finally {
      setReady(true);
    }
  }, [instanceId]);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setSelectedId(null);
    void load();
  }, [open, load]);

  const continueToRoom = async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/community-messenger/rooms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomType: "direct", peerUserId: selectedId }),
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
      setBusy(false);
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={safeT("gift_u3_transfer_title", {
        fallbackKo: "상품권 선물하기",
        fallbackEn: "Send gift certificate",
      })}
    >
      <div className="px-4 pb-4" data-wallet-gift-friend-picker="1">
        {instance ? (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-sam-muted">
              {safeT("gift_u3_transfer_preview_label", {
                fallbackKo: "보낼 상품권",
                fallbackEn: "Gift to send",
              })}
            </p>
            <GiftVisualCard
              visual={{
                giftScope: instance.giftScope,
                imageUrl: instance.imageUrl,
                storeLogoUrl: instance.storeLogoUrl,
                storeName: instance.storeName,
                title: instance.title,
              }}
              surface="transfer"
              compact
              title={instance.title}
              issuerName={instance.storeName}
              faceValue={instance.faceValue}
              remainingBalance={instance.remainingBalance}
              showValidity={false}
              className="border-0 shadow-none"
            />
          </div>
        ) : null}

        <p className="mb-2 text-sm font-semibold text-sam-fg">
          {safeT("gift_u3_friend_pick_recipient", {
            fallbackKo: "받는 사람 선택",
            fallbackEn: "Choose recipient",
          })}
        </p>

        {errorMsg ? <p className="mb-2 text-sm text-sam-danger">{errorMsg}</p> : null}
        {!ready ? (
          <p className="text-sm text-sam-muted">…</p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-sam-muted" data-wallet-gift-friend-empty="1">
            {safeT("gift_u3_friend_pick_empty", {
              fallbackKo: "선물할 수 있는 친구가 없습니다.",
              fallbackEn: "No friends available to gift.",
            })}
          </p>
        ) : (
          <ul className="mb-4 max-h-[40vh] space-y-2 overflow-y-auto">
            {friends.map((f) => {
              const label = String(f.displayName || f.nickname || f.label || f.id).trim();
              const handle = f.nickname?.trim() && f.nickname !== label ? f.nickname : null;
              const selected = selectedId === f.id;
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`flex min-h-[52px] w-full items-center gap-3 rounded-ui-rect border px-3 text-left ${
                      selected ? "border-signature bg-signature/5" : "border-sam-border bg-sam-surface"
                    }`}
                    data-wallet-gift-friend={f.id}
                    aria-pressed={selected}
                    onClick={() => setSelectedId(f.id)}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-signature bg-signature text-white" : "border-sam-border"
                      }`}
                      aria-hidden
                    >
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sam-fg">{label}</span>
                      {handle ? <span className="block truncate text-xs text-sam-muted">@{handle}</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className={`${Sam.btn.primary} min-h-[48px] w-full px-4 text-sm disabled:opacity-50`}
          disabled={!selectedId || busy || friends.length === 0}
          data-wallet-gift-friend-continue="1"
          onClick={() => void continueToRoom()}
        >
          {safeT("gift_u3_friend_pick_continue", {
            fallbackKo: "다음",
            fallbackEn: "Continue",
          })}
        </button>
      </div>
    </DibayBottomSheet>
  );
}
