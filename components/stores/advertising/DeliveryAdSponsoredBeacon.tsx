"use client";

import { useRef } from "react";
import {
  reportDeliveryAdClick,
  useDeliveryAdImpressionObserver,
} from "@/components/stores/advertising/useDeliveryAdEvents";

/**
 * CUT G — wrap sponsored store card for customer impression/click (server token required).
 * Organic cards must not mount this.
 */
export function DeliveryAdSponsoredBeacon(props: {
  exposureToken: string;
  campaignId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const token = String(props.exposureToken ?? "").trim();
  const sessionSeed = `sponsored:${props.campaignId}:${token.slice(0, 12)}`;

  useDeliveryAdImpressionObserver(ref, {
    enabled: Boolean(token),
    exposureToken: token || null,
    sessionSeed,
  });

  return (
    <div
      ref={ref}
      className={props.className}
      data-delivery-ad-sponsored="1"
      data-has-exposure-token={token ? "1" : "0"}
      onClickCapture={() => {
        if (!token) return;
        reportDeliveryAdClick({ exposureToken: token, sessionSeed });
      }}
    >
      {props.children}
    </div>
  );
}
