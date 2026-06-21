"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";

const AddressManagementClient = dynamic(
  () =>
    import("@/components/addresses/AddressManagementClient").then((m) => m.AddressManagementClient),
  { ssr: false, loading: () => null },
);

export function MypageAddressSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { safeT } = useI18n();

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={safeT("mypage_settings_address", {
        fallbackKo: "주소 관리",
        fallbackEn: "Addresses",
      })}
    >
      <div className="min-h-[50vh]">
        <AddressManagementClient embedded />
      </div>
    </MypageBottomSheetShell>
  );
}
