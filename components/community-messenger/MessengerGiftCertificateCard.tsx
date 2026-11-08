"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftVisualCard } from "@/components/gift-certificate/GiftVisualCard";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import {
  parseGiftCertificateMessageMetadata,
  type GiftCertificateMessageMetadata,
} from "@/lib/gift-certificate/gift-certificate-message-metadata";
import {
  giftTransferErrorFallbacks,
  mapGiftTransferErrorKey,
} from "@/lib/gift-certificate/map-gift-transfer-error";
import { parseGiftTransferMutationResponse } from "@/lib/gift-certificate/gift-transfer-mutation-response";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { canonicalHubHref } from "@/lib/delivery/customer/commerce-hub-nav";
import { useGiftTransferPresentation } from "@/lib/gift-certificate/use-gift-transfer-presentation-batch";
import { formatGiftInstanceExpirationDisplay } from "@/lib/gift-certificate/format-gift-certificate-expiration";
import { resolveMessengerGiftCertificateCardFraming } from "@/lib/gift-certificate/messenger-gift-certificate-card-framing";
import { COMMERCE_PRIMARY_BTN_CLASS } from "@/components/orders/customer-commerce/CommerceHubSegmentTabs";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * Chat presentation for gift_certificate messages — one system gift event per transfer.
 * Status SSOT = message.metadata.transfer_status (projection of gift_certificate_transfers).
 */
export function MessengerGiftCertificateCard(props: {
  metadata: unknown;
  isRecipient: boolean;
  onMessageMerge?: (message: CommunityMessengerMessage) => void;
}) {
  const { safeT } = useI18n();
  const meta = parseGiftCertificateMessageMetadata(props.metadata);
  const presentation = useGiftTransferPresentation(meta?.gift_transfer_id);
  const [busy, setBusy] = useState(false);
  const [confirmKind, setConfirmKind] = useState<null | "reject" | "cancel">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!meta) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("gift_cert_chat_card_invalid")}
      </p>
    );
  }

  const displayStatus = meta.transfer_status ?? "PENDING";

  const giftScope = presentation?.giftScope ?? "STORE";
  const resolvedScope = giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const title = presentation?.title?.trim() || meta.title?.trim() || null;
  const storeName =
    resolvedScope === "PLATFORM" ? "DIBAY" : presentation?.storeName?.trim() || meta.store_name?.trim() || null;
  const imageUrl = presentation?.imageUrl ?? meta.image_url;
  const storeLogoUrl = presentation?.storeLogoUrl ?? null;
  const faceValue = presentation?.faceValue ?? meta.face_value ?? null;
  const remainingBalance = presentation?.remainingBalance ?? meta.remaining_balance ?? null;
  const expirationDisplay = presentation
    ? formatGiftInstanceExpirationDisplay({
        validUntil: presentation.validUntil,
        noExpiryLabel: safeT("gift_portrait_expiry_none"),
      })
    : null;
  const publicGiftNumber =
    presentation?.publicGiftNumber ??
    meta.public_gift_number?.trim() ??
    null;
  const peerFallback = safeT("commerce_hub_gift_chat_sender_fallback");
  const senderName = presentation?.senderDisplayName?.trim() || peerFallback;
  /** Presentation batch currently exposes sender nick only; peer fallback keeps body role-correct. */
  const recipientName = peerFallback;
  const framing = resolveMessengerGiftCertificateCardFraming(props.isRecipient);
  const framingPeerName = framing.role === "recipient" ? senderName : recipientName;

  async function act(kind: "accept" | "reject" | "cancel") {
    if (busy || displayStatus !== "PENDING") return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/me/gift-certificates/transfers/${encodeURIComponent(meta!.gift_transfer_id)}/${kind}`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as unknown;
      const parsed = parseGiftTransferMutationResponse(json);
      if (res.ok && parsed.ok) {
        props.onMessageMerge?.(parsed.message);
        setConfirmKind(null);
      } else {
        const err =
          !parsed.ok
            ? parsed.error
            : typeof (json as { error?: string } | null)?.error === "string"
              ? (json as { error: string }).error
              : "generic";
        const key = mapGiftTransferErrorKey(err);
        setErrorMsg(safeT(key, giftTransferErrorFallbacks(key)));
      }
    } finally {
      setBusy(false);
    }
  }

  const statusHuman =
    displayStatus === "PENDING"
      ? safeT("gift_cert_chat_status_pending")
      : displayStatus === "ACCEPTED"
        ? safeT("gift_cert_chat_status_accepted")
        : displayStatus === "REJECTED"
          ? safeT("gift_cert_chat_status_rejected")
          : safeT("gift_u3_card_cancelled");

  return (
    <div
      className="min-w-[240px] max-w-[340px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
      data-messenger-gift-certificate-card="1"
      data-messenger-gift-system-event="1"
      data-gift-transfer-id={meta.gift_transfer_id}
      data-transfer-status={displayStatus}
      data-gift-scope={resolvedScope}
      data-gift-card-framing={framing.role}
    >
      <div className="border-b border-sam-border/70 bg-[#F0FAF5] px-3 py-2.5">
        <p className="text-sm font-bold text-[#045E3A]" data-gift-card-framing-title="1">
          🎁{" "}
          {safeT(framing.titleKey, {
            fallbackKo:
              framing.role === "sender" ? "상품권을 보냈어요" : "상품권이 도착했어요",
            fallbackEn:
              framing.role === "sender"
                ? "You sent a gift certificate"
                : "A gift certificate arrived",
          })}
        </p>
        <p className="mt-0.5 text-xs text-sam-muted" data-gift-card-framing-body="1">
          {safeT(framing.bodyKey, {
            vars: { name: framingPeerName },
            fallbackKo:
              framing.role === "sender"
                ? `${framingPeerName}님에게 선물했습니다.`
                : `${framingPeerName}님이 선물했습니다.`,
            fallbackEn:
              framing.role === "sender"
                ? `You sent this gift to ${framingPeerName}.`
                : `${framingPeerName} sent you a gift.`,
          })}
        </p>
      </div>

      <div className="p-2">
        <GiftVisualCard
          visual={{
            giftScope: resolvedScope,
            imageUrl,
            storeLogoUrl,
            storeName,
            title,
          }}
          surface="chat"
          size="sm"
          title={title}
          issuerName={storeName}
          faceValue={faceValue}
          remainingBalance={remainingBalance}
          purchasePrice={presentation?.purchasePrice ?? null}
          expirationDisplay={expirationDisplay}
          showValidity={Boolean(expirationDisplay)}
          publicGiftNumber={publicGiftNumber}
          showGiftNumber={Boolean(publicGiftNumber)}
          className="border-0 shadow-none"
        />
        <p className="mt-1 text-center text-xs text-sam-muted">{statusHuman}</p>
        {errorMsg ? <p className="mt-1 text-center text-xs text-sam-danger">{errorMsg}</p> : null}
      </div>

      <div
        className="space-y-2 border-t border-sam-border/70 px-3 py-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {props.isRecipient && displayStatus === "PENDING" ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              data-gift-card-accept="1"
              className={`${COMMERCE_PRIMARY_BTN_CLASS} min-h-[44px] flex-1 px-2 text-sm disabled:opacity-60`}
              onClick={(e) => {
                e.stopPropagation();
                void act("accept");
              }}
            >
              {safeT("gift_cert_chat_accept")}
            </button>
            <button
              type="button"
              disabled={busy}
              data-gift-card-reject="1"
              className={`${Sam.btn.secondary} min-h-[44px] flex-1 px-2 text-sm disabled:opacity-60`}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmKind("reject");
              }}
            >
              {safeT("gift_cert_chat_reject")}
            </button>
          </div>
        ) : null}
        {!props.isRecipient && displayStatus === "PENDING" ? (
          <button
            type="button"
            disabled={busy}
            data-gift-card-cancel="1"
            className={`${Sam.btn.secondary} min-h-[44px] w-full px-3 text-sm disabled:opacity-60`}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmKind("cancel");
            }}
          >
            {safeT("gift_u3_card_cancel")}
          </button>
        ) : null}
        {props.isRecipient && displayStatus === "ACCEPTED" ? (
          <Link
            href={canonicalHubHref("gifts", { giftTab: "owned" })}
            className={`${COMMERCE_PRIMARY_BTN_CLASS} inline-flex min-h-[44px] w-full items-center justify-center px-3 text-sm`}
            data-gift-card-wallet-cta="1"
          >
            {safeT("commerce_hub_gift_my_wallet_cta")}
          </Link>
        ) : null}
      </div>

      <DibayConfirmDialog
        open={confirmKind != null}
        title={
          confirmKind === "cancel"
            ? safeT("popup_q_cancel_gift")
            : safeT("popup_q_reject_gift")
        }
        cancelLabel={safeT("common_cancel")}
        confirmLabel={
          confirmKind === "cancel"
            ? safeT("popup_btn_cancel_gift")
            : safeT("common_reject")
        }
        confirmTone="destructive"
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === "cancel") void act("cancel");
          else if (confirmKind === "reject") void act("reject");
        }}
      />
    </div>
  );
}
