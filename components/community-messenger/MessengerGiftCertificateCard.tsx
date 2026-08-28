"use client";

import { useState } from "react";
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
import {
  rememberGiftTransferUiStatus,
  resolveGiftTransferUiStatus,
  type GiftTransferUiStatus,
} from "@/lib/gift-certificate/gift-transfer-ui-status";
import { canonicalHubHref } from "@/lib/delivery/customer/commerce-hub-nav";
import { useGiftTransferPresentation } from "@/lib/gift-certificate/use-gift-transfer-presentation-batch";

/**
 * Chat presentation for gift_certificate messages.
 * Accept/reject/cancel call Gift Transfer APIs — never mutate balance client-side.
 * After mutation success, session-local transfer status outranks stale message metadata.
 */
export function MessengerGiftCertificateCard(props: {
  metadata: unknown;
  isRecipient: boolean;
  onStatusChange?: (next: GiftCertificateMessageMetadata["transfer_status"]) => void;
}) {
  const { safeT } = useI18n();
  const meta = parseGiftCertificateMessageMetadata(props.metadata);
  const presentation = useGiftTransferPresentation(meta?.gift_transfer_id);
  const initialStatus: GiftTransferUiStatus = meta
    ? resolveGiftTransferUiStatus(meta.gift_transfer_id, meta.transfer_status)
    : "PENDING";
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<GiftTransferUiStatus>(initialStatus);
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

  // Remount-safe: prefer remembered success over stale PENDING snapshot on this render.
  const displayStatus = resolveGiftTransferUiStatus(meta.gift_transfer_id, status);

  const giftScope = presentation?.giftScope ?? "STORE";
  const resolvedScope = giftScope === "PLATFORM" ? "PLATFORM" : "STORE";
  const title = presentation?.title?.trim() || meta.title?.trim() || null;
  const storeName =
    resolvedScope === "PLATFORM" ? "DIBAY" : presentation?.storeName?.trim() || meta.store_name?.trim() || null;
  const imageUrl = presentation?.imageUrl ?? meta.image_url;
  const storeLogoUrl = presentation?.storeLogoUrl ?? null;
  const faceValue = presentation?.faceValue ?? meta.face_value ?? null;
  const remainingBalance = presentation?.remainingBalance ?? meta.remaining_balance ?? null;
  const senderName = presentation?.senderDisplayName ?? null;

  async function act(kind: "accept" | "reject" | "cancel") {
    if (busy || displayStatus !== "PENDING") return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/me/gift-certificates/transfers/${encodeURIComponent(meta!.gift_transfer_id)}/${kind}`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        const next: GiftTransferUiStatus =
          kind === "accept" ? "ACCEPTED" : kind === "reject" ? "REJECTED" : "CANCELLED";
        rememberGiftTransferUiStatus(meta!.gift_transfer_id, next);
        setStatus(next);
        props.onStatusChange?.(next);
        setConfirmKind(null);
      } else {
        const key = mapGiftTransferErrorKey(json?.error);
        setErrorMsg(safeT(key, giftTransferErrorFallbacks(key)));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-w-[220px] max-w-[320px]"
      data-messenger-gift-certificate-card="1"
      data-gift-transfer-id={meta.gift_transfer_id}
      data-transfer-status={displayStatus}
      data-gift-scope={resolvedScope}
    >
      <GiftVisualCard
        visual={{
          giftScope: resolvedScope,
          imageUrl,
          storeLogoUrl,
          storeName,
          title,
        }}
        surface="chat"
        title={title}
        issuerName={storeName}
        faceValue={faceValue}
        remainingBalance={remainingBalance}
        className="shadow-sm"
      />
      {senderName ? (
        <p className="mt-1 px-1 text-xs text-sam-muted">
          {safeT("commerce_hub_transfer_from_sender", {
            fallbackKo: "보낸 사람",
            fallbackEn: "From",
          })}
          : {senderName}
        </p>
      ) : null}
      <p className="mt-2 px-1 text-xs text-sam-muted">
        {displayStatus === "PENDING"
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
                })}
      </p>
      {errorMsg ? <p className="mt-1 text-xs text-sam-danger">{errorMsg}</p> : null}
      {props.isRecipient && displayStatus === "PENDING" ? (
        <div
          className="mt-3 flex gap-2"
          // Timeline bubble long-press uses setPointerCapture on the parent; stop here so CTA taps work.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={busy}
            data-gift-card-accept="1"
            className="flex-1 rounded-ui-rect bg-signature px-2 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={(e) => {
              e.stopPropagation();
              void act("accept");
            }}
          >
            {safeT("gift_cert_chat_accept", {
              fallbackKo: "상품권 수령하기",
              fallbackEn: "Accept gift",
            })}
          </button>
          <button
            type="button"
            disabled={busy}
            data-gift-card-reject="1"
            className="flex-1 rounded-ui-rect border border-sam-border px-2 py-2 text-sm font-semibold text-sam-fg disabled:opacity-60"
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
          className="mt-3 w-full rounded-ui-rect border border-sam-border px-2 py-2 text-sm font-semibold text-sam-fg disabled:opacity-60"
          onPointerDown={(e) => e.stopPropagation()}
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
        <a
          href={canonicalHubHref("gifts", { giftTab: "owned" })}
          className="mt-3 block text-center text-sm font-semibold text-signature underline"
          data-gift-card-wallet-cta="1"
        >
          {safeT("gift_cert_chat_view_wallet", {
            fallbackKo: "내 상품권 보기",
            fallbackEn: "View my gifts",
          })}
        </a>
      ) : null}

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
