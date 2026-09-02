/**
 * AuthSessionBoundary private-tree gate — pure decision helper (SSOT).
 * Cookie/session already authenticated ⇒ never pin Loading forever while membership resolves.
 */

export type AuthSessionMembershipStatus = "checking" | "guest" | "member";

export function shouldFailOpenPrivateTreeWhileMembershipResolves(args: {
  sessionApiAuthenticated: boolean;
  membershipStatus: AuthSessionMembershipStatus;
}): boolean {
  return args.sessionApiAuthenticated && args.membershipStatus !== "member";
}

export function shouldBlockPrivateTreeForAuthSession(args: {
  sessionApiAuthenticated: boolean;
  membershipStatus: AuthSessionMembershipStatus;
  holdForRecovery: boolean;
  authExitStarted: boolean;
}): boolean {
  if (args.authExitStarted) return true;
  if (shouldFailOpenPrivateTreeWhileMembershipResolves(args)) return false;
  return args.holdForRecovery || args.membershipStatus === "guest";
}

/** Messenger room/call — middleware already requires auth; do not replace with Loading… */
export function isMessengerRoomOrCallPath(pathname: string): boolean {
  const p = pathname.trim();
  return p.startsWith("/community-messenger/rooms/") || p.startsWith("/community-messenger/calls/");
}
