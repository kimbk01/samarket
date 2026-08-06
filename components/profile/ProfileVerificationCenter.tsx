"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";

type Props = {
  profile: ProfileRow;
};

/**
 * OS device permissions are requested by the OS when features need them.
 * This card only deep-links to the settings screen — no inline permission rows.
 */
export function ProfileVerificationCenter({ profile: _profile }: Props) {
  const { t } = useI18n();
  void _profile;

  return (
    <section className="rounded-[20px] border border-[#d9e5df] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="sam-text-section-title font-semibold text-[#1e3932]">
            {t("profile_verification_center_title")}
          </h2>
          <p className="mt-1 sam-text-body-secondary text-[#1e3932]/70">
            {t("profile_verification_center_desc_os")}
          </p>
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006241]/10 text-[#006241]"
          aria-hidden
        >
          D
        </span>
      </div>
      <Link
        href="/mypage/section/settings/device-permissions"
        className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-ui-rect border border-[#d9e5df] bg-white px-4 text-center sam-text-body font-semibold text-[#1e3932] active:bg-[#f2f0eb]"
      >
        {t("account_to_settings")}
      </Link>
    </section>
  );
}
