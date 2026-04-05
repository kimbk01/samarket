import { RtcRole, RtcTokenBuilder } from "agora-token";
import type {
  CommunityMessengerCallSession,
  CommunityMessengerManagedCallConnection,
} from "@/lib/community-messenger/types";
import {
  getCommunityMessengerManagedCallCertificate,
  getCommunityMessengerManagedCallConfig,
} from "./config";

export function buildCommunityMessengerManagedCallToken(
  session: CommunityMessengerCallSession,
  userId: string
): CommunityMessengerManagedCallConnection | null {
  const config = getCommunityMessengerManagedCallConfig();
  if (!config) return null;

  const channelName = session.id;
  const uid = String(userId).trim();
  const certificate = getCommunityMessengerManagedCallCertificate();
  const expiresAt = new Date(Date.now() + config.tokenTtlSeconds * 1000).toISOString();
  const token =
    certificate.length > 0
      ? RtcTokenBuilder.buildTokenWithUserAccount(
          config.appId,
          certificate,
          channelName,
          uid,
          RtcRole.PUBLISHER,
          config.tokenTtlSeconds,
          config.tokenTtlSeconds
        )
      : null;

  return {
    provider: "agora",
    appId: config.appId,
    channelName,
    uid,
    token,
    expiresAt,
    callKind: session.callKind,
  };
}
