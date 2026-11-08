import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function ProductNotFound() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <p className="sam-text-body font-medium text-sam-fg">{t("trade_073")}</p>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">
        {t("products_not_found_body")}
      </p>
      <Link
        href="/philife"
        className="mt-6 rounded-ui-rect bg-signature px-6 py-2.5 sam-text-body font-medium text-white"
      >
        {t("products_not_found_go_home_btn")}
      </Link>
    </div>
  );
}
