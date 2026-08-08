"use client";

import { LegalDocumentPageClient } from "@/components/legal/LegalDocumentPageClient";
import { getDibayPrivacyPolicyFallback } from "@/lib/legal/dibay-privacy-policy-content";

export type PrivacyInitialDoc = {
  title: string;
  body: string;
  version: string | null;
  source: "cms" | "fallback";
};

type Props = {
  initialByLocale: {
    ko: PrivacyInitialDoc;
    en: PrivacyInitialDoc;
  };
};

export function PrivacyPageClient({ initialByLocale }: Props) {
  const fallbackKo = getDibayPrivacyPolicyFallback("ko");
  const fallbackEn = getDibayPrivacyPolicyFallback("en");

  return (
    <LegalDocumentPageClient
      kind="privacy"
      fallbackTitleKey="ui_finish_privacy_title"
      fallbackBodyKeys={[
        "ui_finish_privacy_p1",
        "ui_finish_privacy_p2",
        "ui_finish_privacy_p3",
        "ui_finish_privacy_p4",
      ]}
      initialByLocale={initialByLocale}
      staticFallbackByLocale={{
        ko: { title: fallbackKo.title, body: fallbackKo.body },
        en: { title: fallbackEn.title, body: fallbackEn.body },
      }}
    />
  );
}
