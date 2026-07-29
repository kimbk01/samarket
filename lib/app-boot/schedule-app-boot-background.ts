"use client";

import { isStoreOwnerHubPathname } from "@/lib/business/owner-hub-path";
import { enableOwnerHubBadgeBackgroundHydration } from "@/lib/chats/owner-hub-badge-store";
import { getAppBootSnapshot, mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import {
  fetchMeProfileFullBackground,
  isMeProfileFullFetchSkippable,
} from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { scheduleStartupApiDeferred } from "@/lib/http/startup-api-scheduler";
import { ensureInitialBadgeSnapshotForBoot } from "@/lib/notifications/notification-badge-count-store";

let backgroundArmId = 0;
let backgroundCancel: (() => void) | null = null;

/** P3-b1 — same boot background arm must not double-schedule badge initial. */
const APP_BOOT_INITIAL_BADGE_JOB = "app-boot-initial-badge";

function scheduleAfterFirstPaint(run: () => void): void {
  if (typeof window === "undefined") return;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof requestIdleCallback === "function") {
          const id = requestIdleCallback(
            () => {
              if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
              run();
            },
            { timeout: 3000 }
          );
          backgroundCancel = () => {
            try {
              cancelIdleCallback(id);
            } catch {
              /* ignore */
            }
          };
        } else {
          const t = window.setTimeout(run, 0);
          backgroundCancel = () => clearTimeout(t);
        }
      });
    });
    return;
  }
  const t = window.setTimeout(run, 50);
  backgroundCancel = () => clearTimeout(t);
}

/**
 * Boot minimal 완료 후 — initial badge COMPLETE · profile full · hub badge
 * (first_paint_blocking=false).
 *
 * P3-b1 LOCK — Badge Initial Generation Owner is App Boot background, not Bell.
 * Guest (no profile) skips badge ownership. Same `backgroundArmId` epoch joins
 * via `ensureInitialBadgeSnapshotForBoot(armId)`.
 */
export function scheduleAppBootBackgroundHydration(): void {
  backgroundCancel?.();
  backgroundCancel = null;
  const armId = ++backgroundArmId;

  scheduleAfterFirstPaint(() => {
    if (armId !== backgroundArmId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const onStoreOwnerHub = isStoreOwnerHubPathname();

    // P3-b1 — authenticated cold boot: one non-fresh Domain snapshot (COMPLETE gen owner).
    scheduleStartupApiDeferred(
      APP_BOOT_INITIAL_BADGE_JOB,
      () => {
        if (armId !== backgroundArmId) return;
        if (!getAppBootSnapshot().profile) return;
        void ensureInitialBadgeSnapshotForBoot(armId);
      },
      { delayMs: 0, source: "app_boot_initial_badge" }
    );

    if (!onStoreOwnerHub) {
      scheduleStartupApiDeferred(
        "profile-full",
        () => {
          if (armId !== backgroundArmId) return;
          if (isMeProfileFullFetchSkippable()) return;
          /**
           * `/mypage` root — boot lite snapshot is enough for summary;
           * skip background full so enter window stays at most 1 profile network (lite).
           * Other surfaces still schedule full as before.
           */
          if (typeof window !== "undefined") {
            const p = window.location.pathname.split("?")[0]!.trim();
            if (p === "/mypage" || p === "/my") return;
          }
          void fetchMeProfileFullBackground("app_boot_background")
            .then(({ status, json }) => {
              const data = json as { ok?: boolean; profile?: ProfileRow } | null;
              if (status === 200 && data?.ok && data.profile) {
                mergeAppBootProfileFull(data.profile);
              }
            })
            .catch(() => {});
        },
        { delayMs: 80 }
      );
    }

    scheduleStartupApiDeferred(
      "hub-badge",
      () => {
        if (armId !== backgroundArmId) return;
        enableOwnerHubBadgeBackgroundHydration();
      },
      { delayMs: 220 }
    );
  });
}

export function cancelAppBootBackgroundHydration(): void {
  backgroundArmId += 1;
  backgroundCancel?.();
  backgroundCancel = null;
}
