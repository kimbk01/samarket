/**
 * Pure Web / Windows / PWA — incoming owner contract.
 *
 * CONTRACT:
 * - No native shell → explicit `web_in_app` owner claim via `tryClaimCallV4PureWebIncomingOwner`.
 * - Sheet render uses `canRenderWebIncomingSheet` only (owner SSOT). Never `document.visibilityState`.
 * - Do not import Android/iOS native owner modules here.
 * - Discovery poll + FCM wake prime owner before sheet discover.
 */

export { tryClaimCallV4PureWebIncomingOwner, isCallV4PureWebOwnerEligible } from "@/lib/community-messenger/call-v4/call-v4-pure-web-owner";
