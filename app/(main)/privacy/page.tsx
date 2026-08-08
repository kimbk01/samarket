import { PrivacyPageClient, type PrivacyInitialDoc } from "./PrivacyPageClient";
import { loadPublishedAppLegalDocument } from "@/lib/legal/load-published-legal-document";
import {
  DIBAY_PRIVACY_POLICY_VERSION,
  getDibayPrivacyPolicyFallback,
} from "@/lib/legal/dibay-privacy-policy-content";

export const dynamic = "force-dynamic";

function toInitial(
  row: Awaited<ReturnType<typeof loadPublishedAppLegalDocument>>,
  locale: "ko" | "en",
): PrivacyInitialDoc {
  if (row?.title && row?.body) {
    return {
      title: row.title,
      body: row.body,
      version: row.version || DIBAY_PRIVACY_POLICY_VERSION,
      source: "cms",
    };
  }
  const fb = getDibayPrivacyPolicyFallback(locale);
  return {
    title: fb.title,
    body: fb.body,
    version: DIBAY_PRIVACY_POLICY_VERSION,
    source: "fallback",
  };
}

export default async function PrivacyPage() {
  const [koRow, enRow] = await Promise.all([
    loadPublishedAppLegalDocument("privacy", "ko"),
    loadPublishedAppLegalDocument("privacy", "en"),
  ]);

  return (
    <PrivacyPageClient
      initialByLocale={{
        ko: toInitial(koRow, "ko"),
        en: toInitial(enRow, "en"),
      }}
    />
  );
}
