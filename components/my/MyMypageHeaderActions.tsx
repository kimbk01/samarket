"use client";

import { Suspense } from "react";
import { MyHeaderNotificationInbox } from "@/components/my/MyHeaderNotificationInbox";
import {
  samTier1HeaderIconCluster,
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
} from "@/lib/ui/tier1-header-icon";

export function MyMypageHeaderActions() {
  return (
    <Suspense
      fallback={
        <div className={samTier1HeaderIconCluster}>
          <span className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} opacity-70`} aria-hidden />
        </div>
      }
    >
      <div className={samTier1HeaderIconCluster}>
        <MyHeaderNotificationInbox />
      </div>
    </Suspense>
  );
}
