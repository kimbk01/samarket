"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  titleKey: MessageKey;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function CommunityMessengerFriendSection({ titleKey, children, defaultOpen = true }: Props) {
  const { t } = useI18n();
  if (!defaultOpen) return null;
  return (
    <section className="border-b border-sam-border">
      <header className="sticky top-0 z-10 bg-sam-app px-3 py-2">
        <h3 className="sam-text-helper font-semibold text-sam-fg-muted">{t(titleKey)}</h3>
      </header>
      <div>{children}</div>
    </section>
  );
}
