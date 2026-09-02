"use client";

import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { OwnedGiftInstanceDetailView } from "@/components/gift-certificate/OwnedGiftInstanceDetailView";
import { buildMemberSupportContext } from "@/lib/support/support-context";

export function OwnedGiftInstanceSupportShell({ instanceId }: { instanceId: string }) {
  return (
    <SupportContextProvider
      value={buildMemberSupportContext({
        enabled: true,
        category: "GIFT_CERTIFICATE",
        sourceSurface: "mypage_gift_instance",
        referenceType: "GIFT_INSTANCE",
        referenceId: instanceId,
      })}
    >
      <OwnedGiftInstanceDetailView instanceId={instanceId} />
    </SupportContextProvider>
  );
}
