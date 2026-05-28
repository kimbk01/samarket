"use client";

import { isStoreOwnerHubPathname } from "@/lib/business/owner-hub-path";
import { enableOwnerHubBadgeBackgroundHydration } from "@/lib/chats/owner-hub-badge-store";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import {
  fetchMeProfileFullBackground,
  isMeProfileFullFetchSkippable,
} from "@/lib/profile/fetch-me-profile-deduped";
import type { ProfileRow } from "@/lib/profile/types";
import { scheduleStartupApiDeferred } from "@/lib/http/startup-api-scheduler";

let backgroundArmId = 0;
let backgroundCancel: (() => void) | null = null;

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
 * Boot minimal 완료 후 — profile full·hub badge (first_paint_blocking=false).
 */
export function scheduleAppBootBackgroundHydration(): void {
  backgroundCancel?.();
  backgroundCancel = null;
  const armId = ++backgroundArmId;

  scheduleAfterFirstPaint(() => {
    if (armId !== backgroundArmId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const onStoreOwnerHub = isStoreOwnerHubPathname();

    if (!onStoreOwnerHub) {
      scheduleStartupApiDeferred(
        "profile-full",
        () => {
          if (armId !== backgroundArmId) return;
          if (isMeProfileFullFetchSkippable()) return;
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
