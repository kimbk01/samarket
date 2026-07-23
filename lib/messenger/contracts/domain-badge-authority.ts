/**
 * STEP 4 — Domain Badge Authority (Phase8A/8B + Domain badge registry).
 *
 * Product flag PHASE11D_A_BADGE_READ_WIRING CONNECTED (all-user).
 * Home messenger nav = general_direct + group only; trade/store_order stay Hub-bound.
 * No presentation changes — contract/authority facade only.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  CHAT_DOMAIN_BADGE_PORTS,
  dispatchChatDomainBadge,
} from "@/lib/chat-domain/badge/domain-badge-registry";
import {
  aggregateChatDomainBadgeShell,
  type ChatDomainBadgeCounts,
  type ChatDomainBadgeShellResult,
} from "@/lib/chat-domain/shell/hub-badge-shell-aggregator";
import { assertNoDualWrite } from "@/lib/messenger/contracts/cutover";
import {
  composePhase8aBadgeShell,
  type Phase8aBadgeShellInput,
  type Phase8aBadgeShellOutput,
} from "@/lib/messenger/contracts/badge-shell-phase8a";
import { PHASE8A_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-read-unread-badge";
import { PHASE8B_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";
import {
  isPhase11dAAllowlisted,
  isPhase11dACanaryKilled,
  PHASE11D_A_BADGE_AUTHORITY_PREPARED,
  PHASE11D_A_BADGE_READ_WIRING,
} from "@/lib/messenger/contracts/phase11da-canary-gate";

export { PHASE11D_A_BADGE_AUTHORITY_PREPARED };

export function assertDomainBadgeAuthorityWritersContract(): void {
  if (!PHASE11D_A_BADGE_READ_WIRING) {
    throw new Error("dibay_domain_badge_authority_requires_badge_read_flag");
  }
  // Sibling Phase8 all-user production wiring stays OFF; PHASE11D_A_BADGE_READ_WIRING is the product path.
  if (PHASE8A_BADGE_PRODUCTION_WIRING || PHASE8B_BADGE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8_badge_all_user_wiring_must_remain_false");
  }
  assertNoDualWrite(["domain"]);
}

export function isDomainBadgeAuthorityEnabledForViewer(viewerUserId: string): boolean {
  if (!PHASE11D_A_BADGE_READ_WIRING) return false;
  if (isPhase11dACanaryKilled()) return false;
  if (!isPhase11dAAllowlisted(viewerUserId)) return false;
  return true;
}

export type DomainBadgeAuthorityReadResult =
  | { status: "ok"; shell: ChatDomainBadgeShellResult; phase8a: Phase8aBadgeShellOutput }
  | { status: "skipped"; reason: "authority_off_or_not_allowlisted" };

/**
 * Product badge read — flag OFF → skipped. Harness may call compose helpers directly.
 */
export function readDomainBadgeAuthorityShell(input: {
  viewerUserId: string;
  counts: ChatDomainBadgeCounts;
  phase8a: Phase8aBadgeShellInput;
  philifeChatUnread?: number;
}): DomainBadgeAuthorityReadResult {
  const viewer = input.viewerUserId.trim();
  if (!isDomainBadgeAuthorityEnabledForViewer(viewer)) {
    return { status: "skipped", reason: "authority_off_or_not_allowlisted" };
  }
  assertDomainBadgeAuthorityWritersContract();
  // Validate each domain contribution through Domain badge ports (identity ownership).
  for (const domain of Object.keys(CHAT_DOMAIN_BADGE_PORTS) as ChatDomain[]) {
    void dispatchChatDomainBadge(domain);
  }
  return {
    status: "ok",
    shell: aggregateChatDomainBadgeShell(input.counts, input.philifeChatUnread ?? 0),
    phase8a: composePhase8aBadgeShell(input.phase8a),
  };
}

/** Isolated harness — proves Runtime connected without product wiring. */
export function composeDomainBadgeAuthorityForHarness(input: {
  counts: ChatDomainBadgeCounts;
  phase8a: Phase8aBadgeShellInput;
  philifeChatUnread?: number;
}): { shell: ChatDomainBadgeShellResult; phase8a: Phase8aBadgeShellOutput } {
  return {
    shell: aggregateChatDomainBadgeShell(input.counts, input.philifeChatUnread ?? 0),
    phase8a: composePhase8aBadgeShell(input.phase8a),
  };
}

export function listDomainBadgeAuthoritySurfaces(): ReadonlyArray<{
  domain: ChatDomain;
  surface: "home_nav" | "trade_hub" | "store_order_hub";
  authority: "DOMAIN_AUTHORITY" | "OFF";
  ready: boolean;
}> {
  const authority = PHASE11D_A_BADGE_READ_WIRING ? ("DOMAIN_AUTHORITY" as const) : ("OFF" as const);
  return [
    { domain: "general_direct", surface: "home_nav", authority, ready: true },
    { domain: "group", surface: "home_nav", authority, ready: true },
    { domain: "trade", surface: "trade_hub", authority, ready: true },
    { domain: "store_order", surface: "store_order_hub", authority, ready: true },
  ];
}
