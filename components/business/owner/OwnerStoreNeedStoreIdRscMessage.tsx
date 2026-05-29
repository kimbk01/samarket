import Link from "next/link";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate, type MessageKey } from "@/lib/i18n/messages";

type OwnerStoreNeedStoreIdHintKey =
  | "owner_store_need_store_id_suffix_products"
  | "owner_store_need_store_id_suffix_menu_categories";

export function OwnerStoreNeedStoreIdRscMessage({
  hintKey,
  useScrollShell = true,
}: {
  hintKey: OwnerStoreNeedStoreIdHintKey;
  useScrollShell?: boolean;
}) {
  const lang = resolveServerInitialLanguage({});
  const body = (
    <div className="px-4 py-8 sam-text-body text-sam-fg">
      <p>
        {translate(lang, "owner_store_need_store_id")}{" "}
        <Link href="/stores/owner" className="font-medium text-signature underline">
          {translate(lang, "owner_store_dashboard_link")}
        </Link>
        {translate(lang, hintKey as MessageKey)}
      </p>
    </div>
  );
  if (useScrollShell) {
    return <OwnerAdminPageScrollShell>{body}</OwnerAdminPageScrollShell>;
  }
  return body;
}
