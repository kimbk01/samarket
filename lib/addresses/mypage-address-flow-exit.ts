import { parseSafeInternalReturnTo } from "@/lib/addresses/mypage-addresses-return-to";
import {
  buildLegacyUnknownCallerContext,
  clearMemberAddressCallerContext,
  commitMemberAddressExit,
  peekMemberAddressCallerContext,
  resolveMemberAddressExitHrefFromContext,
  writeMemberAddressCallerContext,
  type MemberAddressCallerContextV1,
} from "@/lib/addresses/member-address-caller-context";

/**
 * ADDRESS EXIT SSOT — same key as CallerContext (`samarket:address-mgmt-exit`).
 * Plain-href legacy values are coerced on peek inside member-address-caller-context.
 */

/** Ensure open-phase context exists when landing with returnTo transport only. */
export function ensureMemberAddressCallerContextFromTransport(
  returnTo: string | null | undefined,
): MemberAddressCallerContextV1 | null {
  const existing = peekMemberAddressCallerContext();
  if (existing && existing.phase === "open") return existing;
  if (existing?.phase === "pending_restore") return existing;
  const href = parseSafeInternalReturnTo(returnTo);
  if (!href) return existing;
  const ctx = buildLegacyUnknownCallerContext(href);
  if (ctx) writeMemberAddressCallerContext(ctx);
  return ctx;
}

/** @deprecated Prefer openMemberAddressBook */
export function writeAddressFlowExitHref(raw: string | null | undefined): void {
  const ctx = buildLegacyUnknownCallerContext(raw);
  if (ctx) writeMemberAddressCallerContext(ctx);
}

export function peekAddressFlowExitHref(): string {
  return resolveMemberAddressExitHrefFromContext(peekMemberAddressCallerContext());
}

export function readAddressFlowExitHref(): string {
  const href = peekAddressFlowExitHref();
  clearAddressFlowExitHref();
  return href;
}

export function clearAddressFlowExitHref(): void {
  clearMemberAddressCallerContext();
}

export function resolveAddressManagementExitHref(returnTo?: string | null): string {
  const fromCtx = resolveMemberAddressExitHrefFromContext(peekMemberAddressCallerContext());
  if (fromCtx) return fromCtx;
  return parseSafeInternalReturnTo(returnTo);
}

/** CONFIRM exit — may carry trade pending_restore; region handoff set by caller before this. */
export function confirmMemberAddressFlowExit(returnTo?: string | null): string {
  const ctx = peekMemberAddressCallerContext();
  if (ctx && ctx.phase === "open") {
    const { href } = commitMemberAddressExit(ctx, "confirm");
    if (href) return href;
  }
  const fromQuery = parseSafeInternalReturnTo(returnTo);
  clearMemberAddressCallerContext();
  return fromQuery;
}

/** CANCEL / BACK — restore caller without address apply (no region handoff). */
export function cancelMemberAddressFlowExit(returnTo?: string | null): string {
  const ctx = peekMemberAddressCallerContext();
  if (ctx && ctx.phase === "open") {
    const { href } = commitMemberAddressExit(ctx, "cancel");
    if (href) return href;
  }
  const fromQuery = parseSafeInternalReturnTo(returnTo);
  clearMemberAddressCallerContext();
  return fromQuery;
}
