"use client";

import {
  patchCommunityMessengerCallSession,
  type CommunityMessengerCallSessionPatchDebugContext,
} from "@/lib/community-messenger/call-http-actions";

type CallEnginePatchAction = "reject" | "cancel" | "end" | "missed";

type CallEngineRouter = { replace: (href: string) => void };

export const callEngineActions = {
  acceptIncoming: async (args: {
    callId: string;
    source: string;
    debugContext?: CommunityMessengerCallSessionPatchDebugContext;
  }): Promise<{ ok: boolean }> => {
    const sid = args.callId.trim();
    if (!sid) return { ok: false };
    const patched = await patchCommunityMessengerCallSession(sid, "accept", undefined, args.debugContext);
    return { ok: patched.ok === true };
  },

  patch: async (args: {
    callId: string;
    action: CallEnginePatchAction;
    source: string;
  }): Promise<{ ok: boolean }> => {
    const sid = args.callId.trim();
    if (!sid) return { ok: false };
    const patched = await patchCommunityMessengerCallSession(sid, args.action);
    return { ok: patched.ok === true };
  },

  replaceRouteOnce: (_router: CallEngineRouter, _sessionId: string, _href: string): boolean => false,
};
