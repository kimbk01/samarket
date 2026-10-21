"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function Step({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 sam-text-body-secondary leading-snug">
      <span
        className={`mt-0.5 shrink-0 font-semibold ${done ? "text-sam-success" : "text-sam-meta"}`}
        aria-hidden
      >
        {done ? "✓" : "○"}
      </span>
      <div className="min-w-0 text-sam-fg">{children}</div>
    </li>
  );
}

/** 심사 중 — 다음에 할 일 안내 */
export function BusinessOperationalChecklistPending({
  storeId,
  shopName,
}: {
  storeId: string;
  shopName: string;
}) {
  const { t } = useI18n();
  return (
    <section
      className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft/80 p-4"
      aria-label={t("business_phase7_077")}
    >
      <h2 className="sam-text-body font-semibold text-sam-fg">{t("business_phase7_216")}</h2>
      <p className="mt-1 sam-text-helper text-sam-fg/90">
        {t("business_phase7_612", { v1: shopName })}
      </p>
      <ol className="mt-3 list-none space-y-2 pl-0">
        <Step done>{t("business_phase7_073")}</Step>
        <Step done={false}>
          <span className="font-medium text-sam-fg">{t("business_phase7_228")}</span>
          <span className="mt-0.5 block sam-text-helper text-sam-fg/85">
            {t("business_phase7_613")}
          </span>
        </Step>
        <Step done={false}>
          <span className="font-medium">{t("business_phase7_280")}</span>
          <Link
            href={`/stores/owner/profile?storeId=${encodeURIComponent(storeId)}`}
            className="mt-1 inline-block font-medium text-signature underline"
          >
            {t("business_phase7_614")}
          </Link>
        </Step>
        <Step done={false}>{t("business_phase7_615", { v1: t("business_phase7_309") })}</Step>
      </ol>
    </section>
  );
}

/** 보완 요청 — 우선순위 한 줄 */
export function BusinessOperationalChecklistRevision({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  return (
    <section className="rounded-ui-rect border border-sam-warning/30 bg-sam-surface p-4 shadow-sm">
      <h2 className="sam-text-body font-semibold text-sam-fg">{t("business_phase7_223")}</h2>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("business_phase7_616")}</p>
      <Link
        href={`/stores/owner/profile?storeId=${encodeURIComponent(storeId)}`}
        className="mt-3 inline-flex rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-sam-on-primary"
      >
        {t("business_phase7_617")}
      </Link>
    </section>
  );
}
