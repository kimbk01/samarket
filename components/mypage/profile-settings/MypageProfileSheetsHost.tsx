"use client";

import dynamic from "next/dynamic";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import type { ProfileRow } from "@/lib/profile/types";

const ProfileSettingsSheet = dynamic(
  () => import("./ProfileSettingsSheet").then((m) => m.ProfileSettingsSheet),
  { ssr: false },
);
const EditPublicProfileSheet = dynamic(
  () => import("./EditPublicProfileSheet").then((m) => m.EditPublicProfileSheet),
  { ssr: false },
);
const EditDibayIdSheet = dynamic(
  () => import("./EditDibayIdSheet").then((m) => m.EditDibayIdSheet),
  { ssr: false },
);
const PhoneVerificationSheet = dynamic(
  () => import("./PhoneVerificationSheet").then((m) => m.PhoneVerificationSheet),
  { ssr: false },
);

function resolveMypagePhoneVerified(profile: ProfileRow | null): boolean {
  return hasVerifiedPhone(profile);
}

/** Mount only the active sheet — closed sheets return null and stay unmounted. */
export function MypageProfileSheetsHost({ profile }: { profile: ProfileRow | null }) {
  const { activeSheet, closeSheet } = useMypageProfileSheets();
  if (!activeSheet) return null;

  const phoneVerified = resolveMypagePhoneVerified(profile);

  switch (activeSheet) {
    case "settings":
      return profile ? (
        <ProfileSettingsSheet open onClose={closeSheet} profile={profile} phoneVerified={phoneVerified} />
      ) : null;
    case "profile-edit":
      return <EditPublicProfileSheet open onClose={closeSheet} />;
    case "dibay-id":
      return <EditDibayIdSheet open onClose={closeSheet} />;
    case "phone":
      return <PhoneVerificationSheet open onClose={closeSheet} />;
    default:
      return null;
  }
}
