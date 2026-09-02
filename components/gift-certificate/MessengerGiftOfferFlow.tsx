"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { GiftWalletInstance, GiftWalletPayload } from "@/lib/gift-certificate/load-gift-wallet";
import {
  giftTransferErrorFallbacks,
  mapGiftTransferErrorKey,
} from "@/lib/gift-certificate/map-gift-transfer-error";
import { Sam } from "@/lib/ui/sam-component-classes";

type Phase = "select" | "confirm";

function isOfferable(row: GiftWalletInstance, pendingInstanceIds: Set<string>): boolean {
  if (!row.transferable) return false;
  if (row.remainingBalance <= 0) return false;
  if (row.status === "GIFT_LOCKED") return false;
  if (pendingInstanceIds.has(row.id)) return false;
  if (row.status !== "ACTIVE" && row.status !== "PARTIALLY_REDEEMED") return false;
  return true;
}

/**
 * Chat / Wallet shared offer flow — calls existing transfer offer API only.
 */
export function MessengerGiftOfferFlow({
  open,
  onClose,
  roomId,
  recipientUserId,
  recipientLabel,
  preselectedInstanceId,
  onOffered,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  recipientUserId: string;
  recipientLabel?: string;
  preselectedInstanceId?: string | null;
  onOffered?: (result: { transferId: string; message: CommunityMessengerMessage }) => void;
}) {
  const { safeT } = useI18n();
  const [phase, setPhase] = useState<Phase>("select");
  const [wallet, setWallet] = useState<GiftWalletPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<GiftWalletInstance | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReady(false);
    try {
      const res = await fetch("/api/me/gift-certificates/wallet", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as { ok?: boolean; wallet?: GiftWalletPayload };
      setWallet(json.ok ? json.wallet ?? null : null);
    } catch {
      setWallet(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setPhase("select");
    setSelected(null);
    setErrorMsg(null);
    void load();
  }, [open, load]);

  const pendingInstanceIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of wallet?.sentTransfers ?? []) {
      if (String(t.status).toUpperCase() === "PENDING") set.add(t.instanceId);
    }
    return set;
  }, [wallet]);

  const offerable = useMemo(() => {
    if (!wallet) return [];
    return wallet.available.filter((row) => isOfferable(row, pendingInstanceIds));
  }, [wallet, pendingInstanceIds]);

  useEffect(() => {
    if (!open || !ready || !preselectedInstanceId) return;
    const hit = offerable.find((r) => r.id === preselectedInstanceId);
    if (hit) {
      setSelected(hit);
      setPhase("confirm");
    }
  }, [open, ready, preselectedInstanceId, offerable]);

  const send = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setErrorMsg(null);
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `gift-offer-${Date.now()}`;
    try {
      const res = await fetch("/api/me/gift-certificates/transfers/offer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selected.id,
          recipientUserId,
          roomId,
          idempotencyKey,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        transfer_id?: string;
        id?: string;
        message?: CommunityMessengerMessage;
      };
      if (!json.ok) {
        const key = mapGiftTransferErrorKey(json.error);
        setErrorMsg(safeT(key, giftTransferErrorFallbacks(key)));
        return;
      }
      const transferId = String(json.transfer_id ?? json.id ?? "").trim();
      const message = json.message;
      if (!transferId || !message?.id) {
        setErrorMsg(
          safeT("gift_u3_err_generic", {
            fallbackKo: "상품권을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
            fallbackEn: "Could not send the gift certificate. Please try again.",
          })
        );
        return;
      }
      onOffered?.({ transferId, message });
      onClose();
    } catch {
      const key = mapGiftTransferErrorKey("generic");
      setErrorMsg(safeT(key, giftTransferErrorFallbacks(key)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      // Room/gift surfaces suppress main bottom nav; avoid phantom above-nav lift.
      anchor="device-bottom"
      title={
        phase === "confirm"
          ? safeT("gift_u3_confirm_title", {
              fallbackKo: "선물 확인",
              fallbackEn: "Confirm gift",
            })
          : safeT("gift_u3_selector_title", {
              fallbackKo: "선물할 상품권",
              fallbackEn: "Choose a gift",
            })
      }
      footer={
        phase === "confirm" && selected ? (
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className={`${Sam.btn.secondary} min-h-[48px] flex-1`}
              disabled={busy}
              onClick={() => {
                setPhase("select");
                setErrorMsg(null);
              }}
            >
              {safeT("gift_u3_confirm_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
            </button>
            <button
              type="button"
              className={`${Sam.btn.primary} min-h-[48px] flex-1`}
              disabled={busy}
              data-gift-offer-submit="1"
              onClick={() => void send()}
            >
              {busy
                ? safeT("gift_u3_confirm_pending", {
                    fallbackKo: "보내는 중…",
                    fallbackEn: "Sending…",
                  })
                : safeT("gift_u3_confirm_send", {
                    fallbackKo: "선물 보내기",
                    fallbackEn: "Send gift",
                  })}
            </button>
          </div>
        ) : null
      }
    >
      <div className="px-4 pb-3" data-gift-offer-phase={phase}>
        {errorMsg ? <p className="mb-2 text-sm text-sam-danger">{errorMsg}</p> : null}
        {!ready ? (
          <p className="text-sm text-sam-muted" data-gift-offer-loading="1">
            …
          </p>
        ) : phase === "select" ? (
          offerable.length === 0 ? (
            <div className="space-y-3" data-gift-offer-empty="1">
              <p className="text-sm text-sam-muted">
                {safeT("gift_u3_selector_empty", {
                  fallbackKo: "선물할 수 있는 상품권이 없습니다.",
                  fallbackEn: "No gift certificates available to send.",
                })}
              </p>
              <Link
                href="/stores/gift-mall"
                className={`${Sam.btn.primary} inline-flex min-h-[48px] items-center justify-center px-4`}
                onClick={onClose}
              >
                {safeT("gift_u3_selector_browse", {
                  fallbackKo: "상품권 둘러보기",
                  fallbackEn: "Browse gift mall",
                })}
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {offerable.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left"
                    data-gift-offer-pick={row.id}
                    onClick={() => {
                      setSelected(row);
                      setPhase("confirm");
                      setErrorMsg(null);
                    }}
                  >
                    <GiftArtwork src={row.imageUrl} alt={row.title} size={56} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-sam-fg">
                        {row.title || "Gift"}
                      </p>
                      <p className="truncate text-xs text-sam-muted">{row.storeName}</p>
                      <p className="text-sm tabular-nums text-sam-fg">
                        {row.remainingBalance.toLocaleString()}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-signature">
                      {safeT("gift_u3_selector_pick", {
                        fallbackKo: "선택",
                        fallbackEn: "Select",
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : selected ? (
          <div className="space-y-3" data-gift-offer-confirm="1">
            {recipientLabel ? (
              <p className="text-sm text-sam-muted">{recipientLabel}</p>
            ) : null}
            <div className="flex gap-3">
              <GiftArtwork src={selected.imageUrl} alt={selected.title} size={72} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sam-fg">
                  {selected.title || "Gift"}
                </p>
                <p className="text-xs text-sam-muted">{selected.storeName}</p>
                <p className="text-sm tabular-nums text-sam-fg">
                  {selected.remainingBalance.toLocaleString()}
                </p>
              </div>
            </div>
            <p className="text-sm text-sam-fg">
              {safeT("gift_u3_confirm_lock_hint", {
                fallbackKo:
                  "상대방이 수령하거나 거절할 때까지 이 상품권은 사용할 수 없습니다.",
                fallbackEn:
                  "This gift can’t be used until the recipient accepts or declines.",
              })}
            </p>
          </div>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
