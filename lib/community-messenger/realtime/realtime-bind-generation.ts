/** TOKEN_REFRESH / fingerprint rebind — old generation callbacks must no-op. */
export function isStaleRealtimeBindGeneration(args: {
  cancelled: boolean;
  liveGeneration: number;
  callbackGeneration: number;
}): boolean {
  return args.cancelled || args.callbackGeneration !== args.liveGeneration;
}
