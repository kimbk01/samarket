"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  parseGiftCertificateMessageMetadata,
  type GiftCertificateMessageMetadata,
} from "@/lib/gift-certificate/gift-certificate-message-metadata";
import { formatMoneyPhp } from "@/lib/utils/format";

/**
 * Chat presentation for gift_certificate messages.
 * Accept/reject call Gift Transfer APIs — never mutate balance client-side.
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

  async function act(kind: "accept" | "reject") {
    if (busy || status !== "PENDING") return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/me/gift-certificates/transfers/${encodeURIComponent(meta!.gift_transfer_id)}/${kind}`,
        { method: "POST", credentials: "include" }
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && json?.ok) {
        const next = kind === "accept" ? "ACCEPTED" : "REJECTED";
        setStatus(next);
        props.onStatusChange?.(next);
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
      <p className="text-xs font-semibold uppercase tracking-wide text-sam-muted">
        {safeT("gift_cert_chat_card_badge", {
          fallbackKo: "상품권",
          fallbackEn: "Gift certificate",
        })}
      </p>
      <p className="mt-1 text-base font-semibold text-sam-fg">{face}</p>
      <p className="mt-1 text-xs text-sam-muted">
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
              : safeT("gift_cert_chat_status_cancelled", {
                  fallbackKo: "취소됨",
                  fallbackEn: "Cancelled",
                })}
      </p>
      {props.isRecipient && status === "PENDING" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
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
            className="flex-1 rounded-ui-rect border border-sam-border px-2 py-2 text-sm font-semibold text-sam-fg disabled:opacity-60"
            onClick={() => void act("reject")}
          >
            {safeT("gift_cert_chat_reject", {
              fallbackKo: "거절",
              fallbackEn: "Decline",
            })}
          </button>
        </div>
      ) : null}
      {props.isRecipient && status === "ACCEPTED" ? (
        <a
          href="/mypage/gift-certificates"
          className="mt-3 block text-center text-sm font-semibold text-signature underline"
        >
          {safeT("gift_cert_chat_view_wallet", {
            fallbackKo: "내 상품권 보기",
            fallbackEn: "View my gifts",
          })}
        </a>
      ) : null}
    </div>
  );
}
