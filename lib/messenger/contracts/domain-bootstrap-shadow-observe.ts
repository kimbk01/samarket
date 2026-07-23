/**
 * STEP1 — Domain Bootstrap Shadow observe (diagnose-only).
 *
 * Called via chat-domain bridge from Legacy CM bootstrap so CM does not
 * statically import Domain ports (architecture boundary).
 *
 * FORBIDDEN: UI apply · cache write · badge/notification · Legacy↔Domain merge ·
 * shell unlock streak · failing product responses.
 */
import {
  isPhase11dAAllowlisted,
  PHASE11D_A_BADGE_READ_WIRING,
  PHASE11D_A_CACHE_WRITE,
  PHASE11D_A_NOTIFICATION_WRITE,
  PHASE11D_A_PRODUCTION_HOME_WIRING,
  PHASE11D_A_REALTIME_APPLY,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { runPhase11dAShadowCompare } from "@/lib/messenger/contracts/phase11da-canary-runtime";
import {
  compareDomainRoomSets,
  compareHubs,
  PHASE11D_B_MERGE_FORBIDDEN,
  PHASE11D_B_SHADOW_WRITE,
  PHASE11D_B_UI_WIRING,
  summarizeClassCounts,
  type Phase11dBDiffClass,
  type Phase11dBParityRow,
} from "@/lib/messenger/contracts/phase11db-legacy-shadow-parity";

const SHADOW_TIMEOUT_MS = 8_000;

export type DomainBootstrapShadowLegacySurfaces = Readonly<{
  roomListCap: number;
  allRoomIds: ReadonlyArray<string>;
  generalDirect: ReadonlyArray<Phase11dBParityRow>;
  group: ReadonlyArray<Phase11dBParityRow>;
  trade: ReadonlyArray<Phase11dBParityRow>;
  storeOrder: ReadonlyArray<Phase11dBParityRow>;
  tradeHub: {
    roomCount: number;
    unreadMetric: number;
    unreadUnit: "message_sum" | "unread_room_count";
    latestRoomId: string | null;
    latestActivityAt: string | null;
    preview: string;
    href: string;
  };
  storeOrderHub: {
    roomCount: number;
    unreadMetric: number;
    unreadUnit: "message_sum" | "unread_room_count";
    latestRoomId: string | null;
    latestActivityAt: string | null;
    preview: string;
    href: string;
  };
}>;

export type DomainBootstrapShadowObserveSummary = Readonly<{
  ok: boolean;
  skipped?: "allowlist" | "writers_on" | "flags";
  error?: string;
  domainPass?: boolean;
  domainReasons?: ReadonlyArray<string>;
  domainDurationMs?: number;
  roomCounts?: {
    legacy: { gd: number; group: number; trade: number; storeOrder: number };
    domain: { gd: number; group: number; trade: number; storeOrder: number };
  };
  classCounts?: Record<Phase11dBDiffClass, number>;
  newMissing?: number;
  unauthorizedExtra?: number;
  duplicateIdentityReasons?: ReadonlyArray<string>;
  ownerNameLeak?: boolean;
  writes?: {
    sessionStorage: 0;
    localStorage: 0;
    persistentDomainCache: 0;
    realtime: 0;
    badge: 0;
    legacyStateMutated: 0;
    merge: 0;
  };
  shellUnlockRecorded: false;
  uiApplied: false;
}>;

function toParity(row: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  lastMessageAt: string | null;
  unread: number;
  title: string;
  preview: string;
  avatar: string | null;
  orderId?: string | null;
}): Phase11dBParityRow {
  return {
    roomId: row.roomId,
    chatDomain: row.chatDomain,
    domainIdentityKey: row.domainIdentityKey,
    title: row.title,
    avatar: row.avatar,
    preview: row.preview,
    lastMessageAt: row.lastMessageAt,
    unread: row.unread,
    orderId: row.orderId ?? null,
  };
}

function logSafe(summary: DomainBootstrapShadowObserveSummary): void {
  // eslint-disable-next-line no-console -- STEP1 shadow diagnose (no message bodies in counts path)
  console.info(
    "[cm-domain-bootstrap-shadow]",
    JSON.stringify({
      ok: summary.ok,
      skipped: summary.skipped ?? null,
      error: summary.error ?? null,
      domainPass: summary.domainPass ?? null,
      domainReasons: summary.domainReasons ?? null,
      domainDurationMs: summary.domainDurationMs ?? null,
      roomCounts: summary.roomCounts ?? null,
      classCounts: summary.classCounts ?? null,
      newMissing: summary.newMissing ?? null,
      unauthorizedExtra: summary.unauthorizedExtra ?? null,
      duplicateIdentityReasons: summary.duplicateIdentityReasons ?? null,
      ownerNameLeak: summary.ownerNameLeak ?? null,
      writes: summary.writes ?? null,
      shellUnlockRecorded: false,
      uiApplied: false,
    })
  );
}

export async function runDomainBootstrapShadowObserve(input: {
  viewerUserId: string;
  legacy: DomainBootstrapShadowLegacySurfaces;
}): Promise<DomainBootstrapShadowObserveSummary> {
  if (isPhase11dAAllowlisted(input.viewerUserId)) {
    return { ok: true, skipped: "allowlist", shellUnlockRecorded: false, uiApplied: false };
  }
  // STEP2: Domain Cache Authority may be ON for allowlist — Shadow itself still writes 0.
  // Only skip when other product writers / home wiring are on.
  if (
    PHASE11D_A_REALTIME_APPLY ||
    PHASE11D_A_BADGE_READ_WIRING ||
    PHASE11D_A_NOTIFICATION_WRITE ||
    PHASE11D_A_PRODUCTION_HOME_WIRING
  ) {
    return { ok: false, skipped: "writers_on", shellUnlockRecorded: false, uiApplied: false };
  }
  void PHASE11D_A_CACHE_WRITE;
  if (PHASE11D_B_SHADOW_WRITE || PHASE11D_B_UI_WIRING || !PHASE11D_B_MERGE_FORBIDDEN) {
    return { ok: false, skipped: "flags", shellUnlockRecorded: false, uiApplied: false };
  }

  try {
    const domain = await Promise.race([
      runPhase11dAShadowCompare(input.viewerUserId, { recordShellUnlock: false }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("domain_bootstrap_shadow_timeout")), SHADOW_TIMEOUT_MS);
      }),
    ]);

    const legacyAllRoomIds = new Set(input.legacy.allRoomIds);
    const allDiffs = [
      ...compareDomainRoomSets({
        domain: "general_direct",
        legacy: input.legacy.generalDirect,
        neu: domain.parityRows.generalDirect.map(toParity),
        legacyCap: input.legacy.roomListCap,
        legacyAllRoomIds,
      }).diffs,
      ...compareDomainRoomSets({
        domain: "group",
        legacy: input.legacy.group,
        neu: domain.parityRows.group.map(toParity),
        legacyCap: input.legacy.roomListCap,
        legacyAllRoomIds,
      }).diffs,
      ...compareDomainRoomSets({
        domain: "trade",
        legacy: input.legacy.trade,
        neu: domain.parityRows.trade.map(toParity),
        legacyCap: input.legacy.roomListCap,
        legacyAllRoomIds,
      }).diffs,
      ...compareDomainRoomSets({
        domain: "store_order",
        legacy: input.legacy.storeOrder,
        neu: domain.parityRows.storeOrder.map(toParity),
        legacyCap: input.legacy.roomListCap,
        legacyAllRoomIds,
      }).diffs,
      ...compareHubs({
        domain: "trade",
        legacy: input.legacy.tradeHub,
        neu: {
          roomCount: domain.tradeHub.roomCount,
          unreadMetric: domain.tradeHub.unreadCount,
          unreadUnit: "unread_room_count",
          latestRoomId: domain.tradeHub.latestRoomId,
          latestActivityAt: null,
          preview: domain.tradeHub.preview,
          href: input.legacy.tradeHub.href,
        },
      }),
      ...compareHubs({
        domain: "store_order",
        legacy: input.legacy.storeOrderHub,
        neu: {
          roomCount: domain.storeOrderHub.roomCount,
          unreadMetric: domain.storeOrderHub.unreadCount,
          unreadUnit: "unread_room_count",
          latestRoomId: domain.storeOrderHub.latestRoomId,
          latestActivityAt: null,
          preview: domain.storeOrderHub.preview,
          href: input.legacy.storeOrderHub.href,
        },
      }),
    ];

    const classCounts = summarizeClassCounts(allDiffs);
    const duplicateIdentityReasons = domain.reasons.filter((r) => r.includes("duplicate"));
    const summary: DomainBootstrapShadowObserveSummary = {
      ok: true,
      domainPass: domain.pass,
      domainReasons: domain.reasons,
      domainDurationMs: domain.durationMs,
      roomCounts: {
        legacy: {
          gd: input.legacy.generalDirect.length,
          group: input.legacy.group.length,
          trade: input.legacy.trade.length,
          storeOrder: input.legacy.storeOrder.length,
        },
        domain: {
          gd: domain.parityRows.generalDirect.length,
          group: domain.parityRows.group.length,
          trade: domain.parityRows.trade.length,
          storeOrder: domain.parityRows.storeOrder.length,
        },
      },
      classCounts,
      newMissing: classCounts.LEGACY_CORRECT_NEW_MISSING,
      unauthorizedExtra: classCounts.NEW_EXTRA_UNAUTHORIZED,
      duplicateIdentityReasons,
      ownerNameLeak: domain.storeOrderCustomer.ownerNameLeak,
      writes: {
        ...domain.writes,
        merge: 0,
      },
      shellUnlockRecorded: false,
      uiApplied: false,
    };
    logSafe(summary);
    return summary;
  } catch (err) {
    const summary: DomainBootstrapShadowObserveSummary = {
      ok: false,
      error: err instanceof Error ? err.message : "domain_bootstrap_shadow_failed",
      shellUnlockRecorded: false,
      uiApplied: false,
      writes: {
        sessionStorage: 0,
        localStorage: 0,
        persistentDomainCache: 0,
        realtime: 0,
        badge: 0,
        legacyStateMutated: 0,
        merge: 0,
      },
    };
    logSafe(summary);
    return summary;
  }
}

export function scheduleDomainBootstrapShadowObserve(input: {
  viewerUserId: string;
  legacy: DomainBootstrapShadowLegacySurfaces;
}): void {
  void runDomainBootstrapShadowObserve(input).catch(() => {
    /* never surface — product path isolated */
  });
}
