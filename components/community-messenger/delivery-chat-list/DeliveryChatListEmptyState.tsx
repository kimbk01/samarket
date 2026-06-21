"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

function DeliveryChatEmptyIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 10h8M8 14h5M6 4h12a2 2 0 0 1 2 2v12l-3-2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        stroke="#006241"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeliveryChatListEmptyState({ filterSummary }: { filterSummary?: string | null }) {
  const { safeT } = useI18n();
  const message = filterSummary
    ? safeT("cm_delivery_chat_list_empty_filtered", {
        fallbackKo: `${filterSummary} 주문 채팅이 없습니다.`,
        fallbackEn: `No ${filterSummary} order chats yet.`,
        vars: { filterLabel: filterSummary },
      })
    : safeT("cm_delivery_chat_list_empty", {
        fallbackKo: "해당 주문 채팅이 없습니다.",
        fallbackEn: "No order chats yet.",
      });

  return (
    <div
      data-cm-home-empty-state="true"
      className="mx-3 rounded-xl border border-[#D7E5DE] bg-white px-4 py-10 text-center shadow-sm"
    >
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF4EF]">
        <DeliveryChatEmptyIcon />
      </div>
      <p className="sam-text-body-secondary leading-snug text-[#6B7280]">{message}</p>
    </div>
  );
}
