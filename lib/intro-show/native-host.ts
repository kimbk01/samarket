"use client";

import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

type IntroShowHostPlugin = {
  notifyHomePresentationReady: (opts: { reason: string }) => Promise<void>;
  stagePack: (opts: { packJson: string }) => Promise<{ ready: boolean }>;
  abort: (opts: { reason: string }) => Promise<void>;
};

const IntroShowHost = registerPlugin<IntroShowHostPlugin>("IntroShowHost");

let homeReadySent = false;

export async function notifyHomePresentationReady(reason: string): Promise<void> {
  if (homeReadySent) return;
  homeReadySent = true;
  if (!isCapacitorNativePlatform()) return;
  await IntroShowHost.notifyHomePresentationReady({ reason });
}

export async function syncLiveIntroPack(): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  const res = await fetch("/api/app/intro-runtime/pack", { cache: "no-store" });
  if (res.status === 204) return;
  if (!res.ok) return;
  const json = (await res.json().catch(() => ({}))) as { pack?: unknown };
  const pack = json.pack;
  if (!pack) return;
  await IntroShowHost.stagePack({ packJson: JSON.stringify(pack) });
}
