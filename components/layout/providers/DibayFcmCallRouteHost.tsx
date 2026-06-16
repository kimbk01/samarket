"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  clearDibayCallPendingRoute,
  readDibayCallPendingRoute,
} from "@/lib/community-messenger/dibay-fcm-call-bridge";

/** Android native accept/route → legacy call page 진입 */
export function DibayFcmCallRouteHost() {
  const router = useRouter();

  useEffect(() => {
    const path = readDibayCallPendingRoute();
    if (!path) return;
    clearDibayCallPendingRoute();
    router.push(path);
  }, [router]);

  return null;
}
