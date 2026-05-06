export function formatAtUsername(username: string | null | undefined): string {
  const u = typeof username === "string" ? username.trim().replace(/^@+/, "") : "";
  return u ? `@${u}` : "";
}

export function labelFromDisplayAndUsername(
  displayName: string | null | undefined,
  username: string | null | undefined
): string {
  const dn = typeof displayName === "string" ? displayName.trim() : "";
  const at = formatAtUsername(username);
  if (dn && at) {
    const u = at.replace(/^@/, "").toLowerCase();
    if (dn.trim().toLowerCase() !== u) return `${dn} (${at})`;
    return dn;
  }
  return dn || at || "";
}

export function resolveDisplayName(input: {
  display_name?: string | null;
  nickname?: string | null;
  email?: string | null;
  username?: string | null;
}): string {
  const dn = typeof input.display_name === "string" ? input.display_name.trim() : "";
  if (dn) return dn;
  const nick = typeof input.nickname === "string" ? input.nickname.trim() : "";
  if (nick) return nick;
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (email && email.includes("@")) return email.split("@")[0]!.trim() || "User";
  const u = typeof input.username === "string" ? input.username.trim().replace(/^@+/, "") : "";
  return u || "User";
}

