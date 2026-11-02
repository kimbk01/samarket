"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import type { MessengerRoomChatUnavailable } from "@/lib/community-messenger/room/messenger-room-chat-unavailable";
import { Sam } from "@/lib/ui/sam-component-classes";

export type MessengerRoomChatUnavailableProductAction =
  | { kind: "slide"; onOpen: () => void }
  | { kind: "link"; href: string };

/**
 * 막힌 메신저 방(일반·거래·주문 공통) — 입력창 대신 표시하는 유일한 안내 줄 (S-1 §4 UI·UX·CTA SSOT).
 * 1행 제목(상태 이름 · 마침표 없음) + 2행 사유(서버 발송 거부 문구와 같은 문장) + 거래면 「상품 보기」 보조 버튼.
 * 높이는 입력 줄(44px)보다 낮아지지 않게 해 타임라인 하단 여백을 유지한다.
 */
export function MessengerRoomChatUnavailableBar({
  unavailable,
  productAction,
}: {
  unavailable: MessengerRoomChatUnavailable;
  productAction?: MessengerRoomChatUnavailableProductAction | null;
}) {
  const { t } = useI18n();
  const reason = unavailable.hideReason
    ? null
    : unavailable.code && unavailable.code !== "unknown"
      ? getMessengerRoomActionErrorMessage(unavailable.code, t)
      : unavailable.fallbackMessage?.trim() || null;
  const action = unavailable.isTrade ? productAction ?? null : null;
  const actionLabel = t("cm_ui_view_product_detail");
  return (
    <div
      data-cm-room-chat-unavailable={unavailable.code ?? "unknown"}
      role="status"
      className="flex min-h-[44px] w-full flex-col items-center justify-center px-4 py-2 text-center"
    >
      <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_chat_unavailable_title")}</p>
      {reason ? <p className="mt-0.5 sam-text-helper break-words text-sam-muted">{reason}</p> : null}
      {action ? (
        <div className="mt-2 flex justify-center">
          {action.kind === "slide" ? (
            <button type="button" className={Sam.btn.outlinePrimaryCombo} onClick={action.onOpen}>
              {actionLabel}
            </button>
          ) : (
            <Link href={action.href} className={Sam.btn.outlinePrimaryCombo}>
              {actionLabel}
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
