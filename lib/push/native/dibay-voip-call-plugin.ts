"use client";

import { registerPlugin } from "@capacitor/core";

export const DIBAY_VOIP_CALL_PLUGIN_ID = "DibayVoipCall";

export type DibayVoipCallPlugin = {
  startVoipRegistration(): Promise<{ started?: boolean }>;
  reportCallEnded(options: { sessionId: string }): Promise<{ ok?: boolean }>;
  claimForegroundWebIncomingOwner(options: {
    sessionId: string;
    reason?: string;
  }): Promise<{ claimed?: boolean }>;
};

/** Single Capacitor registration — do not call registerPlugin(DibayVoipCall) elsewhere. */
export const dibayVoipCallPlugin = registerPlugin<DibayVoipCallPlugin>(DIBAY_VOIP_CALL_PLUGIN_ID);
