export type CommunityMessengerManagedCallConfig = {
  provider: "agora";
  appId: string;
  tokenTtlSeconds: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;

export function getCommunityMessengerManagedCallConfig(): CommunityMessengerManagedCallConfig | null {
  const appId = process.env.NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID?.trim() ?? "";
  if (!appId) return null;
  const tokenTtlSeconds = Math.max(
    300,
    Number(process.env.COMMUNITY_MESSENGER_AGORA_TOKEN_TTL_SECONDS ?? DEFAULT_TOKEN_TTL_SECONDS)
  );
  return {
    provider: "agora",
    appId,
    tokenTtlSeconds: Number.isFinite(tokenTtlSeconds) ? tokenTtlSeconds : DEFAULT_TOKEN_TTL_SECONDS,
  };
}

export function getCommunityMessengerManagedCallCertificate(): string {
  return process.env.COMMUNITY_MESSENGER_AGORA_APP_CERTIFICATE?.trim() ?? "";
}
