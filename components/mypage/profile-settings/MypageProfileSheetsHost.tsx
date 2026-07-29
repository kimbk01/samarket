"use client";

import dynamic from "next/dynamic";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
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
const MypageAddressSheet = dynamic(
  () => import("./MypageAddressSheet").then((m) => m.MypageAddressSheet),
  { ssr: false },
);

function resolveMypagePhoneVerified(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  return (
    profile.phone_verified === true ||
    Boolean(String(profile.phone ?? "").trim()) ||
    Boolean(String(profile.phone_number ?? "").trim())
  );
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
    case "address":
      return <MypageAddressSheet open onClose={closeSheet} />;
    default:
      return null;
  }
}
