"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/lib/addresses/addresses-updated-event";
import {
  invalidateMandatoryAddressGateClientCache,
  readMandatoryAddressGateNeedsBlock,
} from "@/lib/addresses/mandatory-address-gate-client";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";

const AddressManagementClient = dynamic(
  () =>
    import("@/components/addresses/AddressManagementClient").then((m) => m.AddressManagementClient),
  { ssr: false, loading: () => null },
);

export function MypageAddressSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { safeT } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handleAddressesUpdated = async () => {
      invalidateMandatoryAddressGateClientCache();
      const needsBlock = await readMandatoryAddressGateNeedsBlock();
      if (!needsBlock) onClose();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, handleAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, handleAddressesUpdated);
  }, [open, onClose]);

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
