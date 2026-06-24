"use client";

import { tryClaimIosCapacitorWebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-ios-shell-owner-client";
import { tryClaimCallV4PureWebIncomingOwner } from "@/lib/community-messenger/call-v4/call-v4-pure-web-owner";

/** Prime web_in_app owner before discovery — pure Web or iOS Capacitor foreground only. */
export async function tryPrimeCallV4WebIncomingOwner(callId: string, reason: string): Promise<boolean> {
  if (tryClaimCallV4PureWebIncomingOwner(callId, reason)) return true;
  return tryClaimIosCapacitorWebIncomingOwner(callId, reason);
}
