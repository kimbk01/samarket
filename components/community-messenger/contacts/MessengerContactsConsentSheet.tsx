"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { MessageKey } from "@/lib/i18n/messages";

/** 동의 화면 (기존·신규 회원 공통 · SSOT v5 §4 S2) — 동의 → OS 권한 → 불러오기 */
const ITEMS: { title: MessageKey; sub?: MessageKey }[] = [
  { title: "cm_contacts_consent_1", sub: "cm_contacts_consent_1_sub" },
  { title: "cm_contacts_consent_2", sub: "cm_contacts_consent_2_sub" },
  { title: "cm_contacts_consent_3" },
  { title: "cm_contacts_consent_4", sub: "cm_contacts_consent_4_sub" },
  { title: "cm_contacts_consent_5" },
  { title: "cm_contacts_consent_6" },
];

export function MessengerContactsConsentSheet({ onClose, onAgree }: { onClose: () => void; onAgree: () => Promise<boolean> }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <MessengerHomeBottomSheetShell onClose={onClose} closeAriaLabel={t("cm_contacts_later")} anchor="fit-content" dialogAriaLabel={t("cm_contacts_consent_title")}>
      <div className="px-5 pb-[max(1rem,var(--safe-bottom))] pt-5" data-cm-contacts-consent="">
        <h2 className="text-center text-[20px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
          {t("cm_contacts_consent_title")}
        </h2>
        <p className="mb-4 mt-1 text-center text-[13px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_contacts_consent_lead")}
        </p>
        <ul className="mb-5 space-y-2.5">
          {ITEMS.map((it) => (
            <li key={it.title} className="flex gap-2.5 text-[14px]" style={{ color: "var(--cm-chat-fg)" }}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-primary text-white">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
              </span>
              <span>
                {t(it.title)}
                {it.sub ? (
                  <span className="block text-[12px]" style={{ color: "var(--cm-chat-sub)" }}>
                    {t(it.sub)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          className={`${Sam.btn.primaryCombo} w-full`}
          onClick={async () => {
            setBusy(true);
            const ok = await onAgree();
            setBusy(false);
            if (ok) onClose();
          }}
        >
          {t("cm_contacts_consent_agree")}
        </button>
        <button type="button" className={`${Sam.btn.ghostCombo} mt-2 w-full`} onClick={onClose}>
          {t("cm_contacts_later")}
        </button>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
