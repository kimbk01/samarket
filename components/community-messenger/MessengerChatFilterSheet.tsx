"use client";

import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerChatListChipLabel, type MessengerChatListChip } from "@/lib/community-messenger/messenger-ia";
import { DibayBottomSheet, DibayMenuList, DibaySheetHeader } from "@/components/ui/dibay-overlay";

const FILTER_CHIPS: readonly MessengerChatListChip[] = ["all", "direct", "private_group", "trade", "delivery"] as const;

/** 대화 필터 — 목록 선택은 S1 하단 시트 + S3 메뉴(1단계 문서 §13-2, 중앙 팝업 금지) */
export function MessengerChatFilterSheet({
  open,
  value,
  onClose,
  onSelect,
}: {
  open: boolean;
  value: MessengerChatListChip;
  onClose: () => void;
  onSelect: (next: MessengerChatListChip) => void;
}) {
  const { t } = useI18n();

  return (
    <DibayBottomSheet open={open} onClose={onClose} ariaLabel={t("cm_ui_select_conversation_type")}>
      <DibaySheetHeader title={t("cm_ui_conversation_filter")} onClose={onClose} closeLabel={t("nav_close")} />
      <DibayMenuList
        groups={[
          FILTER_CHIPS.map((chip) => ({
            key: chip,
            icon: value === chip ? <Check className="text-[color:var(--overlay-primary)]" /> : <span />,
            label: messengerChatListChipLabel(chip),
            onClick: () => onSelect(chip),
          })),
        ]}
      />
    </DibayBottomSheet>
  );
}
