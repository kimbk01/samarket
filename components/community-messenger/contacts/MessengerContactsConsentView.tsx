"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 동의 화면 (통합 시안 「연락처로 친구 찾기」 전체 화면 · SSOT v5 §4 S2 · 기존·신규 회원 공통).
 * 「동의하고 시작」 → OS 권한 → 불러오기 → 같은 화면이 연락처 목록으로 바뀐다. 「나중에」 = 뒤로.
 * 실패하면 안내만 하고 이 화면에 머문다.
 */
const ITEMS: { title: MessageKey; sub?: MessageKey }[] = [
  { title: "cm_contacts_consent_1", sub: "cm_contacts_consent_1_sub" },
  { title: "cm_contacts_consent_2", sub: "cm_contacts_consent_2_sub" },
  { title: "cm_contacts_consent_3" },
  { title: "cm_contacts_consent_4", sub: "cm_contacts_consent_4_sub" },
  { title: "cm_contacts_consent_5" },
  { title: "cm_contacts_consent_6" },
];

export function MessengerContactsConsentView({ onAgree, onLater }: { onAgree: () => Promise<boolean>; onLater: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div className="px-5 pb-[max(1.25rem,var(--safe-bottom))] pt-6" data-cm-contacts-consent="">
      <h2 className="text-center text-[20px] font-semibold" style={{ color: "var(--cm-chat-fg)" }}>
        {t("cm_contacts_consent_title")}
      </h2>
      <p className="mb-5 mt-1 text-center text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
        {t("cm_contacts_consent_lead")}
      </p>
      <ul className="mb-6 space-y-3">
        {ITEMS.map((it) => (
          <li key={it.title} className="flex gap-2.5 text-[14px]" style={{ color: "var(--cm-chat-fg)" }}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sam-primary text-white">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
            </span>
            <span>
              {t(it.title)}
              {it.sub ? (
                <span className="block text-[12.5px]" style={{ color: "var(--cm-chat-sub)" }}>
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
          const ok = await onAgree().catch(() => false);
          setBusy(false);
          if (!ok) showMessengerSnackbar(t("cm_contacts_action_failed"), { variant: "error" });
        }}
      >
        {t("cm_contacts_consent_agree")}
      </button>
      <button type="button" disabled={busy} className={`${Sam.btn.ghostCombo} mt-2 w-full`} onClick={onLater}>
        {t("cm_contacts_later")}
      </button>
    </div>
  );
}
