"use client";

import { LegalDocumentPageClient } from "@/components/legal/LegalDocumentPageClient";

export function PrivacyPageClient() {
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
    />
  );
}
