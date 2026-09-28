"use client";

import { notifyHomePresentationReady, syncLiveIntroPack } from "@/lib/intro-show/native-host";

export function signalCommunityHomePresentationReady(reason: "first_card" | "empty" | "error"): void {
  void notifyHomePresentationReady(reason).then(() => {
    void syncLiveIntroPack();
  });
}
