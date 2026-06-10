"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resolveClientMembership, type ClientMembershipResolution } from "@/lib/auth/resolve-client-profile-session";

export type ClientMembershipState =
  | { status: "checking" }
  | { status: "guest" }
  | { status: "member"; profile: Profile };

function initialMembershipState(): ClientMembershipState {
  const cached = getCurrentUser();
  if (cached?.id) return { status: "member", profile: cached };
  return { status: "checking" };
}

/**
 * 화면 게스트/회원 분기 — 캐시만으로 비회원 판정하지 않는다.
 */
export function useClientMembershipState(source: string): ClientMembershipState {
  const [state, setState] = useState<ClientMembershipState>(initialMembershipState);

  useEffect(() => {
    const cached = getCurrentUser();
    if (cached?.id) {
      setState({ status: "member", profile: cached });
      return;
    }
    let cancelled = false;
    void resolveClientMembership(source).then((resolved: ClientMembershipResolution) => {
      if (cancelled) return;
      setState(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return state;
}
