"use client";

import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { IncomingCallerDisplay } from "@/lib/community-messenger/incoming-call/incoming-caller-ssot";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

const cache = new Map<string, IncomingCallerDisplay>();

async function fetchCallerDisplay(callerUserId: string): Promise<IncomingCallerDisplay | null> {
  const cached = cache.get(callerUserId);
  if (cached) return cached;

  const res = await fetch(
    `/api/community-messenger/users/resolve?targetUserId=${encodeURIComponent(callerUserId)}`,
    { cache: "no-store", credentials: "include" }
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    profile?: {
      display_name?: string | null;
      avatar_url?: string | null;
      public_id?: string | null;
    };
  };
  if (!res.ok || !json.ok || !json.profile) return null;

  const label =
    incomingCallPeerNicknameLabel(json.profile.display_name) ??
    json.profile.display_name?.trim() ??
    "";
  if (!label) return null;

  const display: IncomingCallerDisplay = {
    label,
    avatarUrl: json.profile.avatar_url?.trim() || null,
    publicId: json.profile.public_id?.trim().replace(/^@+/, "") || null,
  };
  cache.set(callerUserId, display);
  return display;
}

/** 발신자 userId 단일 경로 — session.peerLabel 은 seed 힌트만 */
export function useIncomingCallerDisplay(
  callerUserId: string | null,
  seed: IncomingCallerDisplay | null
): IncomingCallerDisplay {
  const [display, setDisplay] = useState<IncomingCallerDisplay>(() => seed ?? { label: "", avatarUrl: null, publicId: null });

  useEffect(() => {
    if (seed) {
      setDisplay(seed);
    }
  }, [seed?.label, seed?.avatarUrl, seed?.publicId]);

  useEffect(() => {
    const id = callerUserId?.trim();
    if (!id) return;
    if (cache.has(id)) {
      setDisplay(cache.get(id)!);
      return;
    }
    void runSingleFlight(`cm:incoming-caller:${id}`, () => fetchCallerDisplay(id)).then((resolved) => {
      if (resolved) setDisplay(resolved);
    });
  }, [callerUserId]);

  return display;
}
