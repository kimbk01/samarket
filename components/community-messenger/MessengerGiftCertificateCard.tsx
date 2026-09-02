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
        {safeT("gift_cert_chat_card_invalid", {
          fallbackKo: "상품권 정보를 불러올 수 없습니다",
          fallbackEn: "Gift certificate details unavailable",
        })}
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
        noExpiryLabel: safeT("gift_portrait_expiry_none", {
          fallbackKo: "만료 없음",
          fallbackEn: "No expiry",
        }),
      })
    : null;
  const publicGiftNumber =
    presentation?.publicGiftNumber ??
    meta.public_gift_number?.trim() ??
    null;
  const senderName =
    presentation?.senderDisplayName?.trim() ||
    safeT("commerce_hub_gift_chat_sender_fallback", {
      fallbackKo: "친구",
      fallbackEn: "Friend",
    });

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
      ? safeT("gift_cert_chat_status_pending", {
          fallbackKo: "수령 대기",
          fallbackEn: "Awaiting accept",
        })
      : displayStatus === "ACCEPTED"
        ? safeT("gift_cert_chat_status_accepted", {
            fallbackKo: "수령 완료",
            fallbackEn: "Accepted",
          })
        : displayStatus === "REJECTED"
          ? safeT("gift_cert_chat_status_rejected", {
              fallbackKo: "거절됨",
              fallbackEn: "Rejected",
            })
          : safeT("gift_u3_card_cancelled", {
              fallbackKo: "선물 취소됨",
              fallbackEn: "Gift cancelled",
            });

  return (
    <div
      className="min-w-[240px] max-w-[340px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
      data-messenger-gift-certificate-card="1"
      data-messenger-gift-system-event="1"
      data-gift-transfer-id={meta.gift_transfer_id}
      data-transfer-status={displayStatus}
      data-gift-scope={resolvedScope}
    >
      <div className="border-b border-sam-border/70 bg-[#F0FAF5] px-3 py-2.5">
        <p className="text-sm font-bold text-[#045E3A]">
          🎁{" "}
          {safeT("commerce_hub_gift_chat_arrival", {
            fallbackKo: "상품권 선물이 도착했어요!",
            fallbackEn: "A gift certificate has arrived!",
          })}
        </p>
        <p className="mt-0.5 text-xs text-sam-muted">
          {safeT("commerce_hub_gift_chat_from", {
            vars: { name: senderName ?? "" },
            fallbackKo: `${senderName}님이 상품권을 선물했습니다.`,
            fallbackEn: `${senderName} sent you a gift certificate.`,
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
              {safeT("gift_cert_chat_accept", {
                fallbackKo: "선물 받기",
                fallbackEn: "Accept gift",
              })}
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
              {safeT("gift_cert_chat_reject", {
                fallbackKo: "거절",
                fallbackEn: "Decline",
              })}
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
            {safeT("gift_u3_card_cancel", {
              fallbackKo: "선물 취소",
              fallbackEn: "Cancel gift",
            })}
          </button>
        ) : null}
        {props.isRecipient && displayStatus === "ACCEPTED" ? (
          <Link
            href={canonicalHubHref("gifts", { giftTab: "owned" })}
            className={`${COMMERCE_PRIMARY_BTN_CLASS} inline-flex min-h-[44px] w-full items-center justify-center px-3 text-sm`}
            data-gift-card-wallet-cta="1"
          >
            {safeT("commerce_hub_gift_my_wallet_cta", {
              fallbackKo: "내 상품권",
              fallbackEn: "My gifts",
            })}
          </Link>
        ) : null}
      </div>

      <DibayConfirmDialog
        open={confirmKind != null}
        title={
          confirmKind === "cancel"
            ? safeT("gift_u3_card_cancel_confirm", {
                fallbackKo: "상품권 선물을 취소할까요?",
                fallbackEn: "Cancel this gift offer?",
              })
            : safeT("gift_u3_card_reject_confirm", {
                fallbackKo: "상품권을 거절할까요?",
                fallbackEn: "Decline this gift certificate?",
              })
        }
        cancelLabel={safeT("gift_u3_confirm_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
        confirmLabel={
          confirmKind === "cancel"
            ? safeT("gift_u3_card_cancel", {
                fallbackKo: "선물 취소",
                fallbackEn: "Cancel gift",
              })
            : safeT("gift_cert_chat_reject", {
                fallbackKo: "거절",
                fallbackEn: "Decline",
              })
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
