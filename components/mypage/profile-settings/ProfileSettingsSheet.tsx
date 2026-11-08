"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import { isProfileContactVerified } from "@/lib/profile/profile-contact-verification-ui";
import type { ProfileRow } from "@/lib/profile/types";
import { buildMypageAddressesHref } from "@/lib/addresses/mypage-addresses-return-to";

function SettingsRow({
  label,
  description,
  danger,
  onClick,
  href,
}: {
  label: string;
  description?: string;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  /** 팝업 SSOT T3 — 목록 행 눌림 = 배경만 (투명도 금지) */
  const className = `flex w-full min-w-0 items-center gap-3 py-3.5 text-left transition-colors active:bg-[color:var(--overlay-secondary)] ${
    danger ? "text-[color:var(--overlay-danger)]" : "text-[color:var(--overlay-text-primary)]"
  }`;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[length:var(--overlay-body-1-size)] font-medium leading-[1.4]">{label}</span>
        {description ? (
          <span
            className={`mt-0.5 block truncate text-[length:var(--overlay-body-2-size)] leading-[1.4] ${
              danger ? "text-[color:var(--overlay-danger)]" : "text-[color:var(--overlay-text-secondary)]"
            }`}
          >
            {description}
          </span>
        ) : null}
      </span>
      {!danger ? <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--overlay-text-secondary)]" aria-hidden /> : null}
    </>
  );
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export function ProfileSettingsSheet({
  open,
  onClose,
  profile,
  phoneVerified,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileRow;
  phoneVerified: boolean;
}) {
  const { safeT } = useI18n();
  const router = useRouter();
  const { openSheet } = useMypageProfileSheets();

  const openSub = (id: "profile-edit" | "dibay-id" | "phone") => {
    onClose();
    openSheet(id);
  };

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={safeT("mypage_settings_sheet_title")}
    >
      <div className="divide-y divide-[color:var(--overlay-border)]">
        <SettingsRow
          label={safeT("mypage_settings_profile_edit")}
          description={safeT("mypage_settings_profile_edit_desc")}
          onClick={() => openSub("profile-edit")}
        />
        <SettingsRow
          label={safeT("mypage_settings_dibay_id")}
          onClick={() => openSub("dibay-id")}
        />
        <SettingsRow
          label={safeT("mypage_settings_phone")}
          description={
            phoneVerified
              ? safeT("mypage_status_phone_done")
              : safeT("mypage_status_verify_needed")
          }
          onClick={() => openSub("phone")}
        />
        <SettingsRow
          label={safeT("mypage_settings_address")}
          onClick={() => {
            onClose();
            router.push(buildMypageAddressesHref("/mypage"));
          }}
        />
        <SettingsRow
          label={safeT("mypage_settings_account")}
          href="/mypage/account"
        />
        <SettingsRow
          label={safeT("mypage_settings_notifications")}
          href="/mypage/section/settings/notifications"
        />
      </div>
      <div className="mt-6 border-t border-[color:var(--overlay-border)] pt-4">
        <LogoutActionTrigger variant="danger_button" label={safeT("mypage_hub_logout")} />
      </div>
    </MypageBottomSheetShell>
  );
}

export function resolveMypagePhoneVerified(profile: ProfileRow): boolean {
  return isProfileContactVerified(profile);
}
