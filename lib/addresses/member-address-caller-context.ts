/**
 * MEMBER ADDRESS — CallerContext SSOT.
 *
 * STORAGE (HARD):
 * - Uses EXISTING exit authority key only: `samarket:address-mgmt-exit`
 * - Evolves that key from plain href string → JSON CallerContext (same key).
 * - DO NOT invent a second address return sessionStorage / localStorage key.
 *
 * CONTRACT:
 * - CALLER IDENTITY ≠ URL pathname / returnTo string.
 * - returnTo query = transport only.
 * - pending_restore = same key, phase flip, consume-once.
 * - Trade region apply after confirm = in-memory handoff (SPA transient), not a new storage key.
 */

import { parseSafeInternalReturnTo } from "@/lib/addresses/mypage-addresses-return-to";
import { scheduleTradeWriteSheetReopenAfterMeetSpot } from "@/lib/navigation/trade-meet-spot-return-to";

/**
 * Pre-existing address flow exit key (formerly plain href).
 * PHASE 1 wrongly introduced a second key — removed; this is the only session authority.
 */
export const MEMBER_ADDRESS_CALLER_CONTEXT_KEY = "samarket:address-mgmt-exit";

/** @deprecated alias — identical to MEMBER_ADDRESS_CALLER_CONTEXT_KEY */
export const ADDRESS_FLOW_EXIT_SESSION_KEY = MEMBER_ADDRESS_CALLER_CONTEXT_KEY;

/** Query transport only — never infer caller from returnTo path alone. */
export const MEMBER_ADDRESS_CALLER_QUERY = "caller";

export type MemberAddressCaller =
  | "trade_write"
  | "community_region"
  | "header_region"
  | "delivery_home"
  | "checkout"
  | "mypage"
  | "onboarding"
  | "profile"
  | "owner"
  | "unknown";

export type MemberAddressFlowMode = "manage" | "select";

export type MemberAddressApplyTarget =
  | { kind: "none" }
  | { kind: "set_default_master" }
  | { kind: "set_default_delivery" }
  /** Trade write: apply region to THIS draft via in-memory handoff — no global default mutation. */
  | { kind: "trade_region" };

export type MemberAddressRestorePlan =
  | {
      kind: "href";
      href: string;
    }
  | {
      kind: "trade_write";
      surfaceHref: string;
      categoryId: string;
      categoryKey: string;
      reopenSheet: boolean;
    };

export type MemberAddressCallerContextV1 = {
  v: 1;
  caller: MemberAddressCaller;
  mode: MemberAddressFlowMode;
  selectedAddressId: string | null;
  purpose: string;
  apply: MemberAddressApplyTarget;
  restore: MemberAddressRestorePlan;
  transportHref: string;
  openedAt: number;
  phase: "open" | "pending_restore";
  /** confirm = apply selection; cancel = restore only */
  exitIntent: "confirm" | "cancel";
};

export type TradeWriteRegionApplyHandoff = {
  addressId: string;
  regionId: string;
  cityId: string;
  displayLine: string;
};

/** SPA-only transient — cleared on consume. Not sessionStorage. */
let tradeWriteRegionApplyHandoff: TradeWriteRegionApplyHandoff | null = null;

export function setTradeWriteRegionApplyHandoff(next: TradeWriteRegionApplyHandoff | null): void {
  tradeWriteRegionApplyHandoff = next;
}

export function peekTradeWriteRegionApplyHandoff(): TradeWriteRegionApplyHandoff | null {
  return tradeWriteRegionApplyHandoff;
}

export function consumeTradeWriteRegionApplyHandoff(): TradeWriteRegionApplyHandoff | null {
  const h = tradeWriteRegionApplyHandoff;
  tradeWriteRegionApplyHandoff = null;
  return h;
}

const CALLERS = new Set<MemberAddressCaller>([
  "trade_write",
  "community_region",
  "header_region",
  "delivery_home",
  "checkout",
  "mypage",
  "onboarding",
  "profile",
  "owner",
  "unknown",
]);

export function parseMemberAddressCaller(raw: string | null | undefined): MemberAddressCaller | null {
  const v = String(raw ?? "").trim() as MemberAddressCaller;
  return CALLERS.has(v) ? v : null;
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isApply(x: unknown): x is MemberAddressApplyTarget {
  if (!x || typeof x !== "object") return false;
  const k = (x as { kind?: unknown }).kind;
  return (
    k === "none" ||
    k === "set_default_master" ||
    k === "set_default_delivery" ||
    k === "trade_region"
  );
}

function isRestore(x: unknown): x is MemberAddressRestorePlan {
  if (!x || typeof x !== "object") return false;
  const r = x as MemberAddressRestorePlan;
  if (r.kind === "href") return Boolean(parseSafeInternalReturnTo(r.href));
  if (r.kind === "trade_write") {
    return (
      Boolean(parseSafeInternalReturnTo(r.surfaceHref)) &&
      typeof r.categoryId === "string" &&
      typeof r.categoryKey === "string" &&
      typeof r.reopenSheet === "boolean"
    );
  }
  return false;
}

export function coerceMemberAddressCallerContext(raw: unknown): MemberAddressCallerContextV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<MemberAddressCallerContextV1>;
  if (o.v !== 1) return null;
  const caller = parseMemberAddressCaller(o.caller);
  if (!caller) return null;
  if (o.mode !== "manage" && o.mode !== "select") return null;
  if (!isApply(o.apply) || !isRestore(o.restore)) return null;
  const transportHref = parseSafeInternalReturnTo(o.transportHref);
  if (!transportHref && o.restore.kind === "href") return null;
  const phase = o.phase === "pending_restore" ? "pending_restore" : "open";
  const exitIntent = o.exitIntent === "cancel" ? "cancel" : "confirm";
  return {
    v: 1,
    caller,
    mode: o.mode,
    selectedAddressId: typeof o.selectedAddressId === "string" ? o.selectedAddressId : null,
    purpose: typeof o.purpose === "string" ? o.purpose : "",
    apply: o.apply,
    restore: o.restore,
    transportHref:
      transportHref ||
      (o.restore.kind === "trade_write"
        ? parseSafeInternalReturnTo(o.restore.surfaceHref)
        : parseSafeInternalReturnTo(o.restore.href)),
    openedAt: typeof o.openedAt === "number" ? o.openedAt : Date.now(),
    phase,
    exitIntent,
  };
}

function canUseSessionStorage(): boolean {
  try {
    return typeof sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

export function writeMemberAddressCallerContext(ctx: MemberAddressCallerContextV1): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY, JSON.stringify(ctx));
  } catch {
    /* quota */
  }
}

/**
 * Read authority from the single exit key.
 * Supports JSON context OR legacy plain href string in the same key.
 */
export function peekMemberAddressCallerContext(): MemberAddressCallerContextV1 | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY);
    if (!raw) return null;
    const asJson = coerceMemberAddressCallerContext(safeParse(raw));
    if (asJson) return asJson;
    const href = parseSafeInternalReturnTo(raw);
    if (!href) return null;
    return buildLegacyUnknownCallerContext(href);
  } catch {
    return null;
  }
}

export function clearMemberAddressCallerContext(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(MEMBER_ADDRESS_CALLER_CONTEXT_KEY);
  } catch {
    /* ignore */
  }
}

export function buildMemberAddressCallerContext(input: {
  caller: MemberAddressCaller;
  mode?: MemberAddressFlowMode;
  selectedAddressId?: string | null;
  purpose: string;
  apply: MemberAddressApplyTarget;
  restore: MemberAddressRestorePlan;
}): MemberAddressCallerContextV1 {
  const transportHref =
    input.restore.kind === "trade_write"
      ? parseSafeInternalReturnTo(input.restore.surfaceHref)
      : parseSafeInternalReturnTo(input.restore.href);
  return {
    v: 1,
    caller: input.caller,
    mode: input.mode ?? (input.caller === "mypage" ? "manage" : "select"),
    selectedAddressId: input.selectedAddressId?.trim() || null,
    purpose: input.purpose.trim(),
    apply: input.apply,
    restore: input.restore,
    transportHref,
    openedAt: Date.now(),
    phase: "open",
    exitIntent: "confirm",
  };
}

export function resolveMemberAddressExitHrefFromContext(
  ctx: MemberAddressCallerContextV1 | null,
): string {
  if (!ctx) return "";
  if (ctx.restore.kind === "trade_write") {
    return parseSafeInternalReturnTo(ctx.restore.surfaceHref);
  }
  return parseSafeInternalReturnTo(ctx.restore.href);
}

/**
 * Exit handoff: pending_restore for trade sheet reopen, else clear.
 * `exitIntent` distinguishes confirm (may have region handoff) vs cancel.
 */
export function commitMemberAddressExit(
  ctx: MemberAddressCallerContextV1,
  exitIntent: "confirm" | "cancel",
): { href: string; pending: MemberAddressCallerContextV1 | null } {
  const href = resolveMemberAddressExitHrefFromContext(ctx);
  if (
    ctx.restore.kind === "trade_write" &&
    ctx.restore.reopenSheet &&
    ctx.restore.categoryKey.trim()
  ) {
    const pending: MemberAddressCallerContextV1 = {
      ...ctx,
      phase: "pending_restore",
      transportHref: href,
      exitIntent,
    };
    writeMemberAddressCallerContext(pending);
    scheduleTradeWriteSheetReopenAfterMeetSpot(
      ctx.restore.surfaceHref,
      ctx.restore.categoryId || ctx.restore.categoryKey,
    );
    return { href, pending };
  }
  clearMemberAddressCallerContext();
  return { href, pending: null };
}

/** @deprecated use commitMemberAddressExit(ctx, "confirm") */
export function commitMemberAddressConfirmExit(
  ctx: MemberAddressCallerContextV1,
): { href: string; pending: MemberAddressCallerContextV1 | null } {
  return commitMemberAddressExit(ctx, "confirm");
}

export type TradeWritePendingRestore = {
  categoryKey: string;
  categoryId: string;
  exitIntent: "confirm" | "cancel";
  selectedAddressId: string | null;
};

function normalizeTradeWriteSurfacePath(p: string | null | undefined): string {
  const raw = (p ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * `/market` 홈(쿼리 없음) · `/market?category=` · 레거시 `/market/{seg}` 를 동일 표면으로 본다.
 */
export function tradeWriteRestoreSurfacesMatch(
  pathname: string | null | undefined,
  surfaceHref: string,
  categoryKey?: string | null,
): boolean {
  const base = normalizeTradeWriteSurfacePath(pathname);
  const expected = normalizeTradeWriteSurfacePath(parseSafeInternalReturnTo(surfaceHref));
  if (!base || !expected) return false;
  if (base === expected) return true;
  const key = (categoryKey ?? "").trim();
  if (base === "/market" && expected === "/market") return true;
  if (base === "/market" && expected.startsWith("/market")) return true;
  if (expected === "/market" && base.startsWith("/market")) return true;
  if (key) {
    const legacy = base.match(/^\/market\/([^/]+)$/);
    if (legacy?.[1]) {
      let seg = legacy[1];
      try {
        seg = decodeURIComponent(seg);
      } catch {
        /* keep seg */
      }
      if (seg === key) return true;
    }
  }
  return false;
}

function readTradeWritePendingRestoreFromContext(
  ctx: MemberAddressCallerContextV1,
): TradeWritePendingRestore | null {
  if (ctx.restore.kind !== "trade_write") return null;
  const categoryKey = ctx.restore.categoryKey.trim();
  const categoryId = ctx.restore.categoryId.trim();
  if (!categoryKey) return null;
  return {
    categoryKey,
    categoryId,
    exitIntent: ctx.exitIntent,
    selectedAddressId: ctx.selectedAddressId,
  };
}

/** 제거 없이 pending_restore 만 확인 */
export function peekMemberAddressTradeWritePendingRestore(
  pathname: string | null | undefined,
): TradeWritePendingRestore | null {
  const ctx = peekMemberAddressCallerContext();
  if (!ctx || ctx.phase !== "pending_restore") return null;
  if (ctx.restore.kind !== "trade_write") return null;
  if (
    !tradeWriteRestoreSurfacesMatch(pathname, ctx.restore.surfaceHref, ctx.restore.categoryKey)
  ) {
    return null;
  }
  return readTradeWritePendingRestoreFromContext(ctx);
}

/**
 * Consume-once pending_restore when surface path matches.
 * Stale path → leave context (no consume) so wrong surface cannot steal restore.
 */
export function consumeMemberAddressTradeWritePendingRestore(
  pathname: string | null | undefined,
): TradeWritePendingRestore | null {
  const pending = peekMemberAddressTradeWritePendingRestore(pathname);
  if (!pending) return null;
  clearMemberAddressCallerContext();
  return pending;
}

export type OpenMemberAddressBookInput = {
  caller: MemberAddressCaller;
  mode?: MemberAddressFlowMode;
  selectedAddressId?: string | null;
  purpose: string;
  apply: MemberAddressApplyTarget;
  restore: MemberAddressRestorePlan;
  replace?: boolean;
};

type AddressBookRouter = {
  push: (href: string) => void;
  replace: (href: string) => void;
};

export function buildMemberAddressBookHrefFromContext(ctx: MemberAddressCallerContextV1): string {
  const params = new URLSearchParams();
  params.set(MEMBER_ADDRESS_CALLER_QUERY, ctx.caller);
  if (ctx.transportHref) {
    params.set("returnTo", ctx.transportHref);
  }
  if (ctx.selectedAddressId) {
    params.set("selectedId", ctx.selectedAddressId);
  }
  return `/mypage/addresses?${params.toString()}`;
}

export function openMemberAddressBook(
  router: AddressBookRouter,
  input: OpenMemberAddressBookInput,
): { href: string; context: MemberAddressCallerContextV1 } {
  setTradeWriteRegionApplyHandoff(null);
  const context = buildMemberAddressCallerContext(input);
  writeMemberAddressCallerContext(context);
  const href = buildMemberAddressBookHrefFromContext(context);
  if (input.replace) router.replace(href);
  else router.push(href);
  return { href, context };
}

export function buildLegacyUnknownCallerContext(
  returnTo: string | null | undefined,
): MemberAddressCallerContextV1 | null {
  const href = parseSafeInternalReturnTo(returnTo);
  if (!href) return null;
  return buildMemberAddressCallerContext({
    caller: "unknown",
    mode: "select",
    purpose: "legacy_return_to",
    apply: { kind: "set_default_master" },
    restore: { kind: "href", href },
  });
}

/** returnTo transport must never override an open CallerContext. */
export function assertCallerContextBeatsReturnToTransport(
  ctx: MemberAddressCallerContextV1,
  returnToQuery: string | null | undefined,
): MemberAddressCaller {
  void returnToQuery;
  return ctx.caller;
}
