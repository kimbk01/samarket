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
  const className = `flex w-full min-w-0 items-center gap-3 py-3.5 text-left active:opacity-80 ${
    danger ? "text-red-600" : "text-sam-fg"
  }`;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block truncate sam-text-body font-medium ${danger ? "" : ""}`}>{label}</span>
        {description ? (
          <span className={`mt-0.5 block truncate sam-text-helper ${danger ? "text-red-500" : "text-sam-muted"}`}>
            {description}
          </span>
        ) : null}
      </span>
      {!danger ? <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden /> : null}
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
      title={safeT("mypage_settings_sheet_title", { fallbackKo: "설정", fallbackEn: "Settings" })}
    >
      <div className="divide-y divide-sam-border">
        <SettingsRow
          label={safeT("mypage_settings_profile_edit", {
            fallbackKo: "프로필 수정",
            fallbackEn: "Edit profile",
          })}
          description={safeT("mypage_settings_profile_edit_desc", {
            fallbackKo: "닉네임, 소개, 프로필 사진",
            fallbackEn: "Nickname, bio, photo",
          })}
          onClick={() => openSub("profile-edit")}
        />
        <SettingsRow
          label={safeT("mypage_settings_dibay_id", {
            fallbackKo: "@아이디 관리",
            fallbackEn: "Manage @ ID",
          })}
          onClick={() => openSub("dibay-id")}
        />
        <SettingsRow
          label={safeT("mypage_settings_phone", {
            fallbackKo: "전화번호 인증",
            fallbackEn: "Phone verification",
          })}
          description={
            phoneVerified
              ? safeT("mypage_status_phone_done", { fallbackKo: "인증완료", fallbackEn: "Verified" })
              : safeT("mypage_status_verify_needed", { fallbackKo: "인증필요", fallbackEn: "Verify" })
          }
          onClick={() => openSub("phone")}
        />
        <SettingsRow
          label={safeT("mypage_settings_address", {
            fallbackKo: "주소 관리",
            fallbackEn: "Addresses",
          })}
          onClick={() => {
            onClose();
            router.push(buildMypageAddressesHref("/mypage"));
          }}
        />
        <SettingsRow
          label={safeT("mypage_settings_account", {
            fallbackKo: "계정 관리",
            fallbackEn: "Account",
          })}
          href="/mypage/account"
        />
        <SettingsRow
          label={safeT("mypage_settings_notifications", {
            fallbackKo: "알림 설정",
            fallbackEn: "Notifications",
          })}
          href="/mypage/section/settings/notifications"
        />
      </div>
      <div className="mt-6 border-t border-sam-border pt-4">
        <LogoutActionTrigger variant="danger_button" label={safeT("mypage_hub_logout", {
          fallbackKo: "로그아웃",
          fallbackEn: "Log out",
        })} />
      </div>
    </MypageBottomSheetShell>
  );
}

export function resolveMypagePhoneVerified(profile: ProfileRow): boolean {
  return isProfileContactVerified(profile);
}
