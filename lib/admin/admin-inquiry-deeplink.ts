/**
 * Admin / member / owner inquiry exact deeplinks — P0-C awareness CTA SSOT.
 *
 * DO NOT deep-link to list hubs without inquiry/thread identity.
 * Care (member_admin_note_threads) and platform_admin_inquiries share helpers here.
 */

import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildMemberAdminNoteRoute } from "@/lib/notifications/member-admin-notes";

export function resolveAdminMemberCareInquiryHref(threadId: string): string {
  const id = String(threadId ?? "").trim();
  if (!id) return "/admin/member-notes?kind=inquiry";
  return `/admin/member-notes?kind=inquiry&thread=${encodeURIComponent(id)}`;
}

export function parseAdminMemberCareInquiryThreadId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return String(searchParams.get("thread") ?? "").trim();
}

export function resolveAdminPlatformInquiryHref(inquiryId: string): string {
  const id = String(inquiryId ?? "").trim();
  if (!id) return "/admin/platform-inquiries";
  return `/admin/platform-inquiries?request=${encodeURIComponent(id)}`;
}

export function parseAdminPlatformInquiryFocusRequestId(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return String(searchParams.get("request") ?? "").trim();
}

export function resolveMemberCareInquiryHref(threadId: string): string {
  return buildMemberAdminNoteRoute(threadId, "member");
}

/** Owner platform inquiry answer lands on the historical operations record surface. */
export function resolveOwnerPlatformInquiryHref(
  storeId: string,
  inquiryId: string
): string {
  const sid = String(storeId ?? "").trim();
  const id = String(inquiryId ?? "").trim();
  const base = OwnerRoutes.points(sid);
  if (!id) return base;
  return `${base}${base.includes("?") ? "&" : "?"}inquiry=${encodeURIComponent(id)}`;
}
