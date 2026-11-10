"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MESSENGER_ROW_BTN_CLASS } from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 연락처 화면 공통 「불러오는 중」 (메신저 목록 로딩과 같은 모양) */
export function MessengerContactsLoading() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-10" role="status" data-cm-contacts-loading="">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--messenger-divider)] border-t-[color:var(--messenger-primary)]"
        aria-hidden
      />
      <span className="text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
        {t("common_loading")}
      </span>
    </div>
  );
}

/** 연락처 화면 공통 「불러오지 못했어요 · 다시 시도」 */
export function MessengerContactsRetry({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-col items-center gap-3 px-4 ${compact ? "py-4" : "py-10"}`} data-cm-contacts-retry="">
      <p className="text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
        {t("cm_contacts_load_failed")}
      </p>
      <button type="button" className={`${Sam.btn.secondaryCombo} ${MESSENGER_ROW_BTN_CLASS}`} onClick={onRetry}>
        {t("cm_contacts_retry")}
      </button>
    </div>
  );
}
