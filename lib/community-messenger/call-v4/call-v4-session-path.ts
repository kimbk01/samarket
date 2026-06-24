/** Dedicated calls-v4 screen path — presentation layer (no video deps). */
export function isCallV4DedicatedSessionPath(pathname: string | null | undefined, callId: string): boolean {
  if (!pathname || !callId.trim()) return false;
  return pathname.includes(`/community-messenger/calls-v4/${encodeURIComponent(callId.trim())}`);
}
