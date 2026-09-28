"use client";

import { useLayoutEffect } from "react";
import { markHomePresentationReady } from "@/lib/dibay-intro/runtime/home-presentation";

/** Smallest Community HOME first-meaningful-surface probe. Does not change feed behavior. */
export function CommunityHomePresentationProbe() {
  useLayoutEffect(() => {
    markHomePresentationReady("community_home_list");
  }, []);
  return null;
}
