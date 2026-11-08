"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_HOME_ACCOUNT_LEAVE_HREF } from "@/lib/mypage/mypage-home-hub-links";

/**
 * Google Play web account-deletion resource (guest-accessible).
 * Does not delete without auth — explains path + email request.
 */
export function AccountDeletePublicPageClient() {
  const { safeT } = useI18n();

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-8" data-account-delete-public="1">
      <h1 className="text-2xl font-semibold text-sam-fg">
        {safeT("ui_finish_account_delete_title")}
      </h1>
      <p className="mt-3 sam-text-body leading-relaxed text-sam-fg">
        {safeT("account_delete_public_intro")}
      </p>

      <h2 className="mt-8 text-lg font-semibold text-sam-fg">
        {safeT("account_delete_public_how_title")}
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 sam-text-body text-sam-fg">
        <li>
          {safeT("account_delete_public_how_1")}
        </li>
        <li>
          {safeT("account_delete_public_how_2")}
        </li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/login?next=${encodeURIComponent(MYPAGE_HOME_ACCOUNT_LEAVE_HREF)}`}
          className="inline-flex items-center justify-center rounded-ui-rect bg-signature px-4 py-2.5 text-sm font-medium text-white"
        >
          {safeT("account_delete_public_cta_login")}
        </Link>
        <a
          href="mailto:im2pact@gmail.com?subject=DIBAY%20account%20deletion%20request"
          className="inline-flex items-center justify-center rounded-ui-rect border border-sam-border px-4 py-2.5 text-sm font-medium text-sam-fg"
        >
          {safeT("account_delete_public_cta_email")}
        </a>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-sam-fg">
        {safeT("ui_account_delete_data_title")}
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 sam-text-body text-sam-fg">
        <li>
          {safeT("ui_account_delete_data_1")}
        </li>
        <li>
          {safeT("ui_account_delete_data_2")}
        </li>
        <li>
          {safeT("ui_account_delete_data_3")}
        </li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-sam-fg">
        {safeT("account_delete_public_retain_title")}
      </h2>
      <p className="mt-3 sam-text-body leading-relaxed text-sam-fg">
        {safeT("account_delete_public_retain_body")}{" "}
        <Link href="/privacy" className="text-signature underline">
          {safeT("mypage_comp_settings_privacy_link")}
        </Link>
      </p>

      <p className="mt-8 text-xs text-sam-meta">
        {safeT("account_delete_public_in_app")}
      </p>
    </div>
  );
}
