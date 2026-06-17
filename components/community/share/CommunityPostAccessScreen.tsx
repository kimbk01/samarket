"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityPostAccessReason } from "@/lib/community/share/community-post-access";
import { philifeAppPaths } from "@/lib/philife/paths";
import { CM_CARD_CLASS, CM_CARD_PAD_CLASS } from "@/lib/community/community-ui-classes";

type Props = {
  reason: CommunityPostAccessReason;
  canonicalPath: string;
};

const MESSAGE_KEY: Record<
  Exclude<CommunityPostAccessReason, "ok">,
  "community_share_access_deleted" | "community_share_access_private" | "community_share_access_blocked" | "community_share_access_not_found" | "community_share_access_login"
> = {
  not_found: "community_share_access_not_found",
  deleted: "community_share_access_deleted",
  private: "community_share_access_private",
  blocked: "community_share_access_blocked",
  login_required: "community_share_access_login",
};

export function CommunityPostAccessScreen({ reason, canonicalPath }: Props) {
  const { t } = useI18n();
  if (reason === "ok") return null;

  const key = MESSAGE_KEY[reason];
  const loginHref = `/login?next=${encodeURIComponent(canonicalPath)}`;

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 py-12">
      <div className={`mx-auto w-full max-w-md text-center ${CM_CARD_CLASS} ${CM_CARD_PAD_CLASS}`}>
        <p className="text-[16px] font-semibold text-[var(--cm-text)]">{t(key)}</p>
        {reason === "login_required" ? (
          <Link
            href={loginHref}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--cm-primary)] px-6 text-[14px] font-semibold text-white"
          >
            {t("community_share_access_login_cta")}
          </Link>
        ) : (
          <Link
            href={philifeAppPaths.home}
            className="mt-4 inline-block text-[14px] font-semibold text-[var(--cm-primary)] underline"
          >
            {t("community_back_to_list")}
          </Link>
        )}
      </div>
    </div>
  );
}
