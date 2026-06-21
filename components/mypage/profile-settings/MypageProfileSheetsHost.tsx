"use client";

import { ProfileSettingsSheet, resolveMypagePhoneVerified } from "./ProfileSettingsSheet";
import { EditPublicProfileSheet } from "./EditPublicProfileSheet";
import { EditDibayIdSheet } from "./EditDibayIdSheet";
import { PhoneVerificationSheet } from "./PhoneVerificationSheet";
import { MypageAddressSheet } from "./MypageAddressSheet";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";
import type { ProfileRow } from "@/lib/profile/types";

export function MypageProfileSheetsHost({ profile }: { profile: ProfileRow }) {
  const { activeSheet, closeSheet } = useMypageProfileSheets();
  const phoneVerified = resolveMypagePhoneVerified(profile);

  return (
    <>
      <ProfileSettingsSheet
        open={activeSheet === "settings"}
        onClose={closeSheet}
        profile={profile}
        phoneVerified={phoneVerified}
      />
      <EditPublicProfileSheet open={activeSheet === "profile-edit"} onClose={closeSheet} />
      <EditDibayIdSheet open={activeSheet === "dibay-id"} onClose={closeSheet} />
      <PhoneVerificationSheet open={activeSheet === "phone"} onClose={closeSheet} />
      <MypageAddressSheet open={activeSheet === "address"} onClose={closeSheet} />
    </>
  );
}
