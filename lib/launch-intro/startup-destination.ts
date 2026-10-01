/**
 * DIBAY Intro — STARTUP DESTINATION OWNER (contract §5, §8).
 *
 * The ONLY module that decides INTRO vs COMMUNITY, once per document, synchronously, without
 * network: the CURRENT LAUNCH SNAPSHOT is the cached publication that is COMPLETE (promoted only
 * after sha verification), LOCALLY ELIGIBLE, in a launch epoch where the Intro has not been shown.
 * It is NOT "the server's latest publication". The snapshot is frozen for this launch.
 *
 * The deferral promise holds the route tree (Community) unmounted while the Intro owns the launch
 * (DEFERRED MOUNT, contract §10). It resolves exactly once: on Intro exit or INTRO → COMMUNITY.
 */
import { readLaunchIntroIndex, type LaunchIntroCachedPublication } from "@/lib/launch-intro/cache";
import { readLaunchEpoch, readShownLaunchEpoch } from "@/lib/launch-intro/launch-epoch";
import {
  claimLaunchOsReleaseForIntro,
  handLaunchOsReleaseToCommunity,
} from "@/lib/launch-intro/os-release-owner";

export type LaunchIntroSnapshot = {
  epoch: string;
  revision: number;
  publication: LaunchIntroCachedPublication;
};

export type LaunchDestinationDecision = {
  destination: "intro" | "community";
  reason: string;
  snapshot: LaunchIntroSnapshot | null;
};

let decision: LaunchDestinationDecision | null = null;
let deferral: { promise: Promise<void>; resolve: () => void; done: boolean } | null = null;

function eligibleNow(pub: LaunchIntroCachedPublication): boolean {
  const e = pub.eligibility ?? { frequency: "every_launch" };
  if (e.frequency !== "every_launch") return false;
  const now = Date.now();
  if (e.startAt && Number.isFinite(Date.parse(e.startAt)) && now < Date.parse(e.startAt)) return false;
  if (e.endAt && Number.isFinite(Date.parse(e.endAt)) && now >= Date.parse(e.endAt)) return false;
  return true;
}

function decide(): LaunchDestinationDecision {
  const community = (reason: string): LaunchDestinationDecision => ({ destination: "community", reason, snapshot: null });
  if (typeof window === "undefined") return community("server");
  const epoch = readLaunchEpoch();
  if (!epoch) return community("no_epoch");
  if (window.location.pathname !== "/") return community("not_app_entry");
  if (readShownLaunchEpoch() === epoch) return community("shown_this_epoch");
  const index = readLaunchIntroIndex();
  if (!index) return community("no_index");
  if (index.state !== "active" || !index.publication) return community(`state_${index.state}`);
  if (!eligibleNow(index.publication)) return community("not_eligible");
  if (!claimLaunchOsReleaseForIntro()) return community("os_already_released");
  return {
    destination: "intro",
    reason: "snapshot",
    snapshot: { epoch, revision: index.revision, publication: index.publication },
  };
}

/** Sync, once per document. Server always COMMUNITY. */
export function getLaunchDestination(): LaunchDestinationDecision {
  if (typeof window === "undefined") return { destination: "community", reason: "server", snapshot: null };
  if (!decision) {
    decision = decide();
    try {
      console.info(`[dibay-launch-intro] destination=${decision.destination} reason=${decision.reason}`);
    } catch {
      /* ignore */
    }
  }
  return decision;
}

/** Pending promise while the Intro owns the launch; null when the route tree may render. */
export function getLaunchIntroDeferral(): Promise<void> | null {
  if (typeof window === "undefined") return null;
  if (getLaunchDestination().destination !== "intro") return null;
  if (!deferral) {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    deferral = { promise, resolve, done: false };
  }
  return deferral.done ? null : deferral.promise;
}

/** Ends the deferral (route tree mounts). Idempotent. */
export function releaseLaunchIntroDeferral(): void {
  getLaunchIntroDeferral();
  if (deferral && !deferral.done) {
    deferral.done = true;
    deferral.resolve();
  }
}

/** INTRO → COMMUNITY, once, before the OS release (local failure or launch intent). */
export function abortLaunchIntroToCommunity(reason: string): void {
  if (decision?.destination === "intro") {
    decision = { destination: "community", reason: `aborted_${reason}`, snapshot: null };
    handLaunchOsReleaseToCommunity();
    try {
      console.info(`[dibay-launch-intro] destination=community reason=aborted_${reason}`);
    } catch {
      /* ignore */
    }
  }
  releaseLaunchIntroDeferral();
}
