/**
 * B3 — central legal-consent gate for member API mutations (DIBAY FIRST ENTRY).
 *
 * CONTRACT (docs/auth-account-linking-policy.md §가입 완료): mutation API → 약관 미동의 403.
 * Enforced once in proxy (`enforceApiMemberMutationPolicy`) for PRODUCT_WRITE mutations — not
 * pasted per route. Consent = current required versions (CMS published ko) — `hasStoreTermsConsent`.
 *
 * Exemptions are explicit method + exact path-shape rules (OWNER contract 2026-10-18 §1):
 * - consent action itself, login/logout/session, account deletion, device/notification opt-out
 * - own profile / address correction (1-1)
 * - existing order fulfillment by owner/rider, buyer cancel/refund, settlement withdrawal (1-2, 1-3)
 * - report / block / support, leaving rooms/meetings, deleting own content, mark-read
 * - lifecycle of an already-started call session (accept/signals/end) — not a new interaction
 * - push device registration (delivery plumbing; client registers only after consent — B4)
 * - guest analytics / telemetry / removed (410) endpoints
 * Anything not listed is CONSENT_REQUIRED. Admin / cron / webhook paths never reach here
 * (`resolveMemberActionClassForApiMutation` → NON_MEMBER), nor do lifecycle EXEMPT paths.
 */

import { normalizeApiPath } from "@/lib/auth/member-action-policy";

export type MemberConsentMutationClass = "CONSENT_REQUIRED" | "CONSENT_EXEMPT";

export type MemberConsentExemptReason =
  | "consent_action"
  | "session_identity"
  | "account_deletion"
  | "device_notification"
  | "profile_address_correction"
  | "order_fulfillment"
  | "cancel_refund"
  | "settlement"
  | "report_block_support"
  | "leave"
  | "delete_own_content"
  | "mark_read"
  | "existing_call_session"
  | "guest_analytics"
  | "telemetry_or_removed";

type Rule = {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route shape with `[param]` segments — matched exactly (one segment per param). */
  path: string;
  reason: MemberConsentExemptReason;
};

const R = (method: Rule["method"], path: string, reason: MemberConsentExemptReason): Rule => ({
  method,
  path,
  reason,
});

export const MEMBER_CONSENT_EXEMPT_RULES: readonly Rule[] = [
  // consent action itself
  R("PATCH", "/api/me/legal-consent", "consent_action"),
  // session / identity / onboarding id
  R("POST", "/api/auth/logout", "session_identity"),
  R("POST", "/api/auth/logout-all", "session_identity"),
  R("POST", "/api/auth/native/exchange", "session_identity"),
  R("POST", "/api/auth/password-login/resolve-identifier", "session_identity"),
  R("POST", "/api/auth/profile/ensure", "session_identity"),
  R("POST", "/api/auth/provider/conflict-check", "session_identity"),
  R("POST", "/api/auth/provider/link/complete", "session_identity"),
  R("POST", "/api/auth/provider/link/start", "session_identity"),
  R("DELETE", "/api/me/auth-providers/[provider]", "session_identity"),
  R("POST", "/api/account/phone/send-otp", "session_identity"),
  R("POST", "/api/account/phone/verify-otp", "session_identity"),
  R("POST", "/api/me/phone-verification/send", "session_identity"),
  R("POST", "/api/me/phone-verification/verify", "session_identity"),
  R("POST", "/api/me/dibay-id/assign-auto", "session_identity"),
  R("POST", "/api/me/dibay-id/reserve", "session_identity"),
  R("POST", "/api/me/username/reserve", "session_identity"),
  // account deletion
  R("POST", "/api/me/leave-request", "account_deletion"),
  // device / notification opt-out & delivery plumbing
  R("POST", "/api/me/devices/deactivate", "device_notification"),
  R("POST", "/api/me/devices/register", "device_notification"),
  R("POST", "/api/me/push/subscribe", "device_notification"),
  R("DELETE", "/api/me/push/unsubscribe", "device_notification"),
  R("PATCH", "/api/me/notification-settings", "device_notification"),
  R("PATCH", "/api/me/owner-notification-settings", "device_notification"),
  R("POST", "/api/me/notification-targets/clear", "device_notification"),
  R("PATCH", "/api/me/settings", "device_notification"),
  // own profile / address correction (OWNER 1-1)
  R("PATCH", "/api/me/profile", "profile_address_correction"),
  R("POST", "/api/me/profile/avatar", "profile_address_correction"),
  R("PATCH", "/api/me/profile/notification-email", "profile_address_correction"),
  R("POST", "/api/me/addresses", "profile_address_correction"),
  R("PATCH", "/api/me/addresses/[id]", "profile_address_correction"),
  R("POST", "/api/me/addresses/[id]/mark-used", "profile_address_correction"),
  R("POST", "/api/me/addresses/[id]/set-default", "profile_address_correction"),
  R("DELETE", "/api/me/addresses/[id]", "profile_address_correction"),
  // existing order fulfillment (OWNER 1-3) — owner / rider / buyer side of an existing order
  R("PATCH", "/api/me/stores/[storeId]/orders/[orderId]", "order_fulfillment"),
  R("POST", "/api/me/stores/[storeId]/orders/[orderId]/cancel-request", "order_fulfillment"),
  R("PATCH", "/api/me/stores/[storeId]/orders/[orderId]/delivery", "order_fulfillment"),
  R("POST", "/api/me/stores/[storeId]/orders/[orderId]/ensure-chat", "order_fulfillment"),
  R("POST", "/api/me/store-orders/[orderId]/ensure-chat", "order_fulfillment"),
  R("POST", "/api/me/rider/location", "order_fulfillment"),
  R("PATCH", "/api/me/rider/status", "order_fulfillment"),
  R("PATCH", "/api/me/rider/orders/[orderId]", "order_fulfillment"),
  R("POST", "/api/me/rider/orders/[orderId]/pod-upload", "order_fulfillment"),
  // cancel / refund / settlement rights
  R("PATCH", "/api/me/store-orders/[orderId]", "cancel_refund"),
  R("DELETE", "/api/me/store-orders/[orderId]", "cancel_refund"),
  R("POST", "/api/me/points/charge/[id]/cancel", "cancel_refund"),
  R("POST", "/api/me/post-ads/[adId]/cancel", "cancel_refund"),
  R("POST", "/api/me/gift-certificates/transfers/[transferId]/cancel", "cancel_refund"),
  R("POST", "/api/me/gift-certificates/transfers/[transferId]/reject", "cancel_refund"),
  R("POST", "/api/me/stores/[storeId]/finance/withdrawals", "settlement"),
  // report / block / support
  R("POST", "/api/reports", "report_block_support"),
  R("POST", "/api/chat/reports", "report_block_support"),
  R("POST", "/api/community/reports", "report_block_support"),
  R("POST", "/api/community-messenger/reports", "report_block_support"),
  R("POST", "/api/me/store-reports", "report_block_support"),
  R("POST", "/api/philife/meetings/[meetingId]/report", "report_block_support"),
  R("POST", "/api/chat/rooms/[roomId]/block", "report_block_support"),
  R("POST", "/api/chat/rooms/[roomId]/unblock", "report_block_support"),
  R("POST", "/api/community-messenger/relations/block", "report_block_support"),
  R("DELETE", "/api/community-messenger/relations/block", "report_block_support"),
  R("POST", "/api/community/block-relations", "report_block_support"),
  R("POST", "/api/support/cases/open", "report_block_support"),
  R("POST", "/api/support/cases/[caseId]", "report_block_support"),
  R("PATCH", "/api/me/admin-notes/[threadId]", "report_block_support"),
  R("DELETE", "/api/me/admin-notes/[threadId]", "report_block_support"),
  // leave / hide / remove relation (self)
  R("POST", "/api/chat/room/[roomId]/leave", "leave"),
  R("POST", "/api/chat/rooms/[roomId]/leave", "leave"),
  R("POST", "/api/chat/rooms/[roomId]/hide", "leave"),
  R("POST", "/api/community-messenger/rooms/[roomId]/leave", "leave"),
  R("POST", "/api/community/meetings/[meetingId]/leave", "leave"),
  R("POST", "/api/philife/meetings/[meetingId]/leave", "leave"),
  R("DELETE", "/api/community-messenger/friends/[friendUserId]", "leave"),
  R("POST", "/api/community-messenger/friends/[friendUserId]/hidden", "leave"),
  R("DELETE", "/api/community-messenger/relations/friend", "leave"),
  R("DELETE", "/api/me/relations/[type]", "leave"),
  R("POST", "/api/community-messenger/peer-notices/dismiss", "leave"),
  R("POST", "/api/community/posts/[postId]/hide", "leave"),
  // delete own content
  R("DELETE", "/api/community-messenger/calls/logs/[callLogId]", "delete_own_content"),
  R("DELETE", "/api/community-messenger/group-rooms/[roomId]", "delete_own_content"),
  R("DELETE", "/api/community-messenger/rooms/[roomId]/messages/[messageId]", "delete_own_content"),
  R("DELETE", "/api/community/meetings/[meetingId]/notices/[noticeId]", "delete_own_content"),
  R("DELETE", "/api/community/neighborhood-posts/[postId]", "delete_own_content"),
  R("DELETE", "/api/community/posts/[postId]/comments/[commentId]", "delete_own_content"),
  R("DELETE", "/api/me/stores/[storeId]/notices/[noticeId]", "delete_own_content"),
  R("DELETE", "/api/philife/meetings/[meetingId]/album/[itemId]", "delete_own_content"),
  R("DELETE", "/api/philife/meetings/[meetingId]/feed/[postId]", "delete_own_content"),
  R("DELETE", "/api/philife/meetings/[meetingId]/notices/[noticeId]", "delete_own_content"),
  R("DELETE", "/api/philife/neighborhood-posts/[postId]", "delete_own_content"),
  R("DELETE", "/api/philife/posts/[postId]/comments/[commentId]", "delete_own_content"),
  R("POST", "/api/posts/[postId]/owner-delete", "delete_own_content"),
  // mark read
  R("POST", "/api/chat/room/[roomId]/read", "mark_read"),
  R("POST", "/api/chat/rooms/[roomId]/read", "mark_read"),
  R("POST", "/api/domains/order/read-order-chat", "mark_read"),
  R("POST", "/api/group-chat/rooms/[roomId]/read", "mark_read"),
  R("POST", "/api/me/chats/mark-all-read", "mark_read"),
  R("POST", "/api/me/chats/mark-trade-read", "mark_read"),
  R("PATCH", "/api/me/notifications", "mark_read"),
  R("POST", "/api/me/notifications/missed-call-read", "mark_read"),
  R("POST", "/api/me/notifications/read", "mark_read"),
  R("POST", "/api/me/notifications/read-category", "mark_read"),
  R("POST", "/api/me/notifications/read-thread", "mark_read"),
  R("POST", "/api/me/notifications/room-read", "mark_read"),
  R("POST", "/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/read", "mark_read"),
  // already-started call session lifecycle (starting a call stays CONSENT_REQUIRED)
  R("POST", "/api/community-messenger/calls/[sessionId]/accept", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/[sessionId]/end", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/[sessionId]/missed", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/[sessionId]/reject", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/[sessionId]/push-ack", "existing_call_session"),
  R("PATCH", "/api/community-messenger/calls/sessions/[sessionId]", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/sessions/[sessionId]/signals", "existing_call_session"),
  R("POST", "/api/community-messenger/calls/stub-message", "existing_call_session"),
  // guest analytics
  R("POST", "/api/community/posts/[postId]/view", "guest_analytics"),
  R("POST", "/api/philife/posts/[postId]/view", "guest_analytics"),
  R("POST", "/api/me/settings/notices/[noticeId]/view", "guest_analytics"),
  R("POST", "/api/platform-promotion/reconcile-guest", "guest_analytics"),
  R("POST", "/api/stores/ads/click", "guest_analytics"),
  R("POST", "/api/stores/ads/impression", "guest_analytics"),
  // telemetry / presence / removed (410)
  R("POST", "/api/app/notification-sound-resolve", "telemetry_or_removed"),
  R("POST", "/api/community-messenger/monitoring/events", "telemetry_or_removed"),
  R("POST", "/api/community-messenger/presence", "telemetry_or_removed"),
  R("POST", "/api/community-messenger/trade-chat-list-meta", "telemetry_or_removed"),
  R("POST", "/api/community/article-og-image", "telemetry_or_removed"),
  R("POST", "/api/philife/article-og-image", "telemetry_or_removed"),
  R("PATCH", "/api/me/trade-presence", "telemetry_or_removed"),
  R("POST", "/api/me/trade-presence/beacon", "telemetry_or_removed"),
  R("POST", "/api/me/trade-presence/heartbeat", "telemetry_or_removed"),
];

function shapeToRegExp(shape: string): RegExp {
  const escaped = shape
    .split("/")
    .map((seg) => (/^\[[^\]]+\]$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${escaped}$`);
}

const COMPILED = MEMBER_CONSENT_EXEMPT_RULES.map((r) => ({ ...r, re: shapeToRegExp(r.path) }));

export function findMemberConsentExemptRule(
  method: string,
  pathname: string,
): (Rule & { re: RegExp }) | null {
  const m = String(method ?? "").toUpperCase();
  const p = normalizeApiPath(pathname);
  return COMPILED.find((r) => r.method === m && r.re.test(p)) ?? null;
}

export function resolveMemberConsentClassForApiMutation(
  method: string,
  pathname: string,
): MemberConsentMutationClass {
  return findMemberConsentExemptRule(method, pathname) ? "CONSENT_EXEMPT" : "CONSENT_REQUIRED";
}
