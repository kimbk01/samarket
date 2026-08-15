"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerChatListChipLabel, type MessengerChatListChip } from "@/lib/community-messenger/messenger-ia";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";

const FILTER_CHIPS: readonly MessengerChatListChip[] = ["all", "direct", "private_group", "trade", "delivery"] as const;

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
    <DibayDialog
      open={open}
      onClose={onClose}
      title={t("cm_ui_conversation_filter")}
      description={t("cm_ui_quick_switch_by_type")}
      ariaLabel={t("cm_ui_select_conversation_type")}
    >
      <nav className="mt-4" aria-label={t("cm_ui_select_conversation_type")}>
        <ul className="flex flex-col gap-2">
          {FILTER_CHIPS.map((chip) => {
            const selected = value === chip;
            return (
              <li key={chip}>
                <DibayOverlayButton
                  roleTone={selected ? "primary" : "secondary"}
                  onClick={() => onSelect(chip)}
                  className="!justify-start !flex-none w-full"
                >
                  {messengerChatListChipLabel(chip)}
                </DibayOverlayButton>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-3">
        <DibayOverlayButton roleTone="text" onClick={onClose}>
          {t("nav_close")}
        </DibayOverlayButton>
      </div>
    </DibayDialog>
  );
}
