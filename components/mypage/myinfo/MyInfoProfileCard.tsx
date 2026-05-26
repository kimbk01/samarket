"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Check, MapPin } from "lucide-react";
import { isSamarketDefaultAvatarUrl, withDefaultAvatar } from "@/lib/profile/default-avatar";
import { MYINFO_SURFACE, MYINFO_TYPO } from "./myinfo-theme";

export function MyInfoProfileCard({
  avatarUrl,
  displayName,
  atUsername,
  addressLine,
  addressHref,
  editHref,
  rightMetaSlot,
}: {
  avatarUrl: string | null;
  displayName: string;
  atUsername?: string | null;
  addressLine: string;
  addressHref?: string;
  editHref: string;
  rightMetaSlot?: React.ReactNode;
}) {
  const { t } = useI18n();
  const resolvedAvatar = withDefaultAvatar(avatarUrl);
  const showCheckBadge = !isSamarketDefaultAvatarUrl(resolvedAvatar);

  return (
    <article className={`${MYINFO_SURFACE.card}`}>
      <div className={`${MYINFO_SURFACE.cardPad} flex items-start gap-3`}>
        <Link
          href={editHref}
          className="relative block h-[76px] w-[76px] shrink-0 overflow-hidden rounded-full bg-sam-primary-soft"
          aria-label={t("mypage_comp_profile_image_aria")}
        >
          <Image
            src={resolvedAvatar}
            alt=""
            fill
            className="object-cover"
            sizes="76px"
          />
          {showCheckBadge ? (
            <span
              className="absolute bottom-0 right-0 h-6 w-6 rounded-full border-2 border-sam-surface bg-sam-primary"
              aria-hidden
            >
              <span className="flex h-full w-full items-center justify-center">
                <Check className="h-4 w-4 text-sam-on-primary" strokeWidth={3} />
              </span>
            </span>
          ) : null}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <p className={`${MYINFO_TYPO.profileName} min-w-0 truncate text-sam-fg`}>{displayName}</p>
            {atUsername ? (
              <span className="min-w-0 truncate font-mono text-[12px] text-sam-muted tabular-nums">
                {atUsername}
              </span>
            ) : null}
          </div>
          {addressHref ? (
            <Link
              href={addressHref}
              className="mt-1 flex items-start gap-1.5 rounded-[8px] py-0.5 pr-1 text-[11px] leading-snug text-sam-muted hover:text-signature"
              aria-label={t("mypage_comp_address_manage_aria")}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signature" strokeWidth={2} aria-hidden />
              <span className="min-w-0 whitespace-normal break-words leading-snug">{addressLine}</span>
            </Link>
          ) : (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-sam-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signature" strokeWidth={2} aria-hidden />
              <span className="min-w-0 whitespace-normal break-words leading-snug">{addressLine}</span>
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Link
              href={editHref}
              className="inline-flex min-h-[36px] items-center justify-center rounded-[10px] border border-sam-border bg-sam-surface px-3 text-[13px] font-semibold text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_profile_edit")}
            </Link>
            {rightMetaSlot ? <div className="min-w-0 flex-1">{rightMetaSlot}</div> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

