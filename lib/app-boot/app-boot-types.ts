import type { ProfileRow } from "@/lib/profile/types";

export type AppBootProfileMode = "minimal" | "full";

export type AppBootState = {
  status: "idle" | "shell" | "hydrating" | "ready" | "anonymous" | "error";
  profile: ProfileRow | null;
  bootedAt: number | null;
  error: string | null;
};

export const APP_BOOT_READY_EVENT = "dibay:app-boot-ready";
export const APP_BOOT_PROFILE_UPDATED_EVENT = "dibay:app-boot-profile-updated";
