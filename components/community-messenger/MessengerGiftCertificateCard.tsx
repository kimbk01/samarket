"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import {
  parseGiftCertificateMessageMetadata,
  type GiftCertificateMessageMetadata,
} from "@/lib/gift-certificate/gift-certificate-message-metadata";
import {
  giftTransferErrorFallbacks,
  mapGiftTransferErrorKey,
} from "@/lib/gift-certificate/map-gift-transfer-error";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * Chat presentation for gift_certificate messages.
 * Accept/reject/cancel call Gift Transfer APIs — never mutate balance client-side.
 */
export function MessengerGiftCertificateCard(props: {
  metadata: unknown;
  isRecipient: boolean;
  onStatusChange?: (next: GiftCertificateMessageMetadata["transfer_status"]) => void;
}) {
  const { safeT } = useI18n();
  const meta = parseGiftCertificateMessageMetadata(props.metadata);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(meta?.transfer_status ?? "PENDING");
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

  const face = meta.face_value != null ? formatMoneyPhp(meta.face_value) : "—";
  const remaining =
    meta.remaining_balance != null ? meta.remaining_balance.toLocaleString() : null;
  const title = meta.title?.trim() || null;
  const storeName = meta.store_name?.trim() || null;

  async function act(kind: "accept" | "reject" | "cancel") {
    if (busy || status !== "PENDING") return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/me/gift-certificates/transfers/${encodeURIComponent(meta!.gift_transfer_id)}/${kind}`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        const next =
          kind === "accept" ? "ACCEPTED" : kind === "reject" ? "REJECTED" : "CANCELLED";
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
      className="min-w-[220px] max-w-[280px] rounded-ui-rect border border-sam-border bg-sam-surface p-3"
      data-messenger-gift-certificate-card="1"
      data-gift-transfer-id={meta.gift_transfer_id}
      data-transfer-status={status}
    >
      <div className="flex gap-2">
        <GiftArtwork src={meta.image_url} alt={title ?? ""} size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
            {safeT("gift_cert_chat_card_badge", {
              fallbackKo: "상품권",
              fallbackEn: "Gift certificate",
            })}
          </p>
          {title ? <p className="truncate text-sm font-semibold text-sam-fg">{title}</p> : null}
          {storeName ? <p className="truncate text-xs text-sam-muted">{storeName}</p> : null}
          <p className="mt-0.5 text-base font-semibold text-sam-fg">{face}</p>
          {remaining != null ? (
            <p className="text-xs tabular-nums text-sam-muted">{remaining}</p>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-sam-muted">
        {status === "PENDING"
          ? safeT("gift_cert_chat_status_pending", {
              fallbackKo: "수령 대기",
              fallbackEn: "Awaiting accept",
            })
          : status === "ACCEPTED"
            ? safeT("gift_cert_chat_status_accepted", {
                fallbackKo: "수령 완료",
                fallbackEn: "Accepted",
              })
            : status === "REJECTED"
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
      {props.isRecipient && status === "PENDING" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            data-gift-card-accept="1"
            className="flex-1 rounded-ui-rect bg-signature px-2 py-2 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void act("accept")}
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
            onClick={() => setConfirmKind("reject")}
          >
            {safeT("gift_cert_chat_reject", {
              fallbackKo: "거절",
              fallbackEn: "Decline",
            })}
          </button>
        </div>
      ) : null}
      {!props.isRecipient && status === "PENDING" ? (
        <button
          type="button"
          disabled={busy}
          data-gift-card-cancel="1"
          className="mt-3 w-full rounded-ui-rect border border-sam-border px-2 py-2 text-sm font-semibold text-sam-fg disabled:opacity-60"
          onClick={() => setConfirmKind("cancel")}
        >
          {safeT("gift_u3_card_cancel", {
            fallbackKo: "선물 취소",
            fallbackEn: "Cancel gift",
          })}
        </button>
      ) : null}
      {props.isRecipient && status === "ACCEPTED" ? (
        <a
          href="/mypage/gift-certificates"
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
