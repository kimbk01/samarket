"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { formatGiftInstanceExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import type { GiftWalletInstance, GiftWalletPayload } from "@/lib/gift-certificate/load-gift-wallet";
import {
  giftTransferErrorFallbacks,
  mapGiftTransferErrorKey,
} from "@/lib/gift-certificate/map-gift-transfer-error";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/** 시트 안 글자 — 팝업 글자 5단계 (14 보조) */
const TEXT_BODY2 = "text-[length:var(--overlay-body-2-size)] leading-[1.6]";

type Phase = "select" | "confirm";

function isOfferable(row: GiftWalletInstance, pendingInstanceIds: Set<string>): boolean {
  if (!row.transferable) return false;
  if (row.remainingBalance <= 0) return false;
  if (row.status === "GIFT_LOCKED") return false;
  if (pendingInstanceIds.has(row.id)) return false;
  // One-time: only unused ACTIVE certificates may be gifted.
  if (row.status !== "ACTIVE") return false;
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
      const json = (await res.json().catch(() => null)) as unknown;
      const { parseGiftTransferMutationResponse } = await import(
        "@/lib/gift-certificate/gift-transfer-mutation-response"
      );
      const parsed = parseGiftTransferMutationResponse(json);
      if (!parsed.ok) {
        const key = mapGiftTransferErrorKey(
          typeof (json as { error?: string } | null)?.error === "string"
            ? (json as { error: string }).error
            : parsed.error
        );
        setErrorMsg(safeT(key, giftTransferErrorFallbacks(key)));
        return;
      }
      onOffered?.({ transferId: parsed.transfer.id, message: parsed.message });
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
      title={
        phase === "confirm"
          ? safeT("gift_u3_confirm_title")
          : safeT("gift_u3_selector_title")
      }
      footer={
        phase === "confirm" && selected ? (
          <div className={`${OverlayUi.actionsRow} !mt-3`}>
            <button
              type="button"
              className={OverlayUi.btn.secondary}
              disabled={busy}
              onClick={() => {
                setPhase("select");
                setErrorMsg(null);
              }}
            >
              {safeT("gift_u3_confirm_cancel")}
            </button>
            <button
              type="button"
              className={OverlayUi.btn.primary}
              disabled={busy}
              data-gift-offer-submit="1"
              onClick={() => void send()}
            >
              {busy
                ? safeT("gift_u3_confirm_pending")
                : safeT("gift_u3_confirm_send")}
            </button>
          </div>
        ) : null
      }
    >
      <div className="pb-3" data-gift-offer-phase={phase}>
        {errorMsg ? <p className={`mb-2 ${TEXT_BODY2} text-[color:var(--overlay-danger)]`}>{errorMsg}</p> : null}
        {!ready ? (
          <p className={`${TEXT_BODY2} text-[color:var(--overlay-text-secondary)]`} data-gift-offer-loading="1">
            …
          </p>
        ) : phase === "select" ? (
          offerable.length === 0 ? (
            <div className="space-y-3" data-gift-offer-empty="1">
              <p className={`${TEXT_BODY2} text-[color:var(--overlay-text-secondary)]`}>
                {safeT("gift_u3_selector_empty")}
              </p>
              <Link
                href="/stores/gift-mall"
                className={OverlayUi.btn.primary}
                onClick={onClose}
              >
                {safeT("gift_u3_selector_browse")}
              </Link>
            </div>
          ) : (
            <ul className="space-y-3" data-gift-offer-select-list="1">
              {offerable.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`${OverlayUi.selectCard} min-w-0 flex-col !items-stretch focus-visible:border-[color:var(--overlay-primary)]`}
                    data-gift-offer-pick={row.id}
                    onClick={() => {
                      setSelected(row);
                      setPhase("confirm");
                      setErrorMsg(null);
                    }}
                  >
                    <GiftVisualCard
                      visual={{
                        giftScope: row.giftScope,
                        imageUrl: row.imageUrl,
                        storeLogoUrl: row.storeLogoUrl,
                        storeName: row.storeName,
                        title: row.title,
                      }}
                      surface="wallet"
                      size="sm"
                      title={row.title}
                      issuerName={row.storeName}
                      faceValue={row.faceValue}
                      purchasePrice={row.purchasePrice}
                      publicGiftNumber={row.publicGiftNumber}
                      showGiftNumber={Boolean(row.publicGiftNumber?.trim())}
                      expirationDisplay={formatGiftInstanceExpirationDisplay({
                        validUntil: row.validUntil,
                        noExpiryLabel: safeT("gift_portrait_expiry_none"),
                      })}
                      showValidity
                      className="pointer-events-none"
                    />
                    <span className={`mt-2 block text-center ${TEXT_BODY2} font-semibold text-[color:var(--overlay-primary)]`}>
                      {safeT("gift_u3_selector_pick")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : selected ? (
          <div className="space-y-3" data-gift-offer-confirm="1">
            {recipientLabel ? (
              <p className={`${TEXT_BODY2} text-[color:var(--overlay-text-secondary)]`}>{recipientLabel}</p>
            ) : null}
            <GiftVisualCard
              visual={{
                giftScope: selected.giftScope,
                imageUrl: selected.imageUrl,
                storeLogoUrl: selected.storeLogoUrl,
                storeName: selected.storeName,
                title: selected.title,
              }}
              surface="transfer"
              size="sm"
              title={selected.title}
              issuerName={selected.storeName}
              faceValue={selected.faceValue}
              purchasePrice={selected.purchasePrice}
              publicGiftNumber={selected.publicGiftNumber}
              showGiftNumber={Boolean(selected.publicGiftNumber?.trim())}
              expirationDisplay={formatGiftInstanceExpirationDisplay({
                validUntil: selected.validUntil,
                noExpiryLabel: safeT("gift_portrait_expiry_none"),
              })}
              showValidity
            />
            <p className={`${TEXT_BODY2} text-[color:var(--overlay-text-primary)]`}>
              {safeT("gift_u3_confirm_lock_hint")}
            </p>
          </div>
        ) : null}
      </div>
    </DibayBottomSheet>
  );
}
