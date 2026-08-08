import { AccountDeletePublicPageClient } from "./AccountDeletePublicPageClient";

export const dynamic = "force-dynamic";

/** Play Console Account Deletion web resource — guest accessible. */
export default function AccountDeletePublicPage() {
  return <AccountDeletePublicPageClient />;
}
