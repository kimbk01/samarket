import { TermsPageClient, type TermsInitialDoc } from "./TermsPageClient";
import { loadPublishedAppLegalDocument } from "@/lib/legal/load-published-legal-document";
import { STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export const dynamic = "force-dynamic";

function toInitial(
  row: Awaited<ReturnType<typeof loadPublishedAppLegalDocument>>,
  locale: "ko" | "en",
): TermsInitialDoc {
  if (row?.title && row?.body) {
    return {
      title: row.title,
      body: row.body,
      version: row.version || STORE_TERMS_VERSION,
      source: "cms",
    };
  }
  return {
    title: locale === "en" ? "Terms of service" : "이용약관",
    body: "",
    version: STORE_TERMS_VERSION,
    source: "fallback",
  };
}

export default async function TermsPage() {
  const [koRow, enRow] = await Promise.all([
    loadPublishedAppLegalDocument("terms", "ko"),
    loadPublishedAppLegalDocument("terms", "en"),
  ]);

  return (
    <TermsPageClient
      initialByLocale={{
        ko: toInitial(koRow, "ko"),
        en: toInitial(enRow, "en"),
      }}
    />
  );
}
