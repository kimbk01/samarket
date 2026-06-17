import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

/** 커뮤니티 UI — `@username`·`( @id )` 등 핸들 접미사 제거 후 닉네임만 표시 */
export function communityAuthorDisplayName(raw: string | null | undefined, fallback = ""): string {
  const stripped = incomingCallPeerNicknameLabel(raw ?? "");
  if (stripped) return stripped;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return fallback;
  const withoutParen = trimmed.replace(/\s*\(@[^)]+\)\s*$/u, "").trim();
  if (withoutParen) return withoutParen;
  if (trimmed.startsWith("@")) {
    const rest = trimmed.replace(/^@+/, "").trim();
    return rest || fallback;
  }
  return trimmed;
}
