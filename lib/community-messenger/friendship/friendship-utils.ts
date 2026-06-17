import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export type FriendshipSupabaseClient = NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>;

export function trimFriendshipText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function friendshipNowIso(): string {
  return new Date().toISOString();
}

export function isFriendshipMissingTableError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "42P01" || /does not exist|relation .* does not exist|column .* does not exist/i.test(message);
}

export function getFriendshipSupabaseOrNull(): FriendshipSupabaseClient | null {
  try {
    return getSupabaseServer() as FriendshipSupabaseClient;
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

export function friendshipPairKey(userA: string, userB: string): string {
  const a = trimFriendshipText(userA);
  const b = trimFriendshipText(userB);
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function peerIdFromDirectKey(directKey: string, viewerUserId: string): string {
  const viewer = trimFriendshipText(viewerUserId);
  return trimFriendshipText(directKey)
    .split(":")
    .map((part) => part.trim())
    .find((id) => id && id !== viewer) ?? "";
}

export function isGeneralCommunityDirectKey(directKey: string): boolean {
  const key = trimFriendshipText(directKey);
  return (
    key.includes(":") &&
    !key.startsWith("trade_item:") &&
    !key.startsWith("trade_pc:") &&
    !key.startsWith("store_order:") &&
    !key.startsWith("trade_order:")
  );
}
