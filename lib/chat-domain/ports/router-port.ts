import { requireChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertChatDomainOwnership } from "@/lib/chat-domain/ports/domain-ownership";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

export type ChatDomainRoomRouteInput = Readonly<{
  roomId: string;
  domain: ChatDomain;
  identityKey: string;
  from?: string | null;
  returnHref?: string | null;
  query?: ReadonlyArray<readonly [key: string, value: string]>;
}>;

export type ChatDomainRouterPort = Readonly<{
  domain: ChatDomain;
  buildRoomHref: (input: ChatDomainRoomRouteInput) => string;
}>;

function sanitizeInternalReturnHref(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  try {
    const url = new URL(raw, "https://samarket.local");
    if (url.origin !== "https://samarket.local") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function buildChatDomainRoomHref(
  owner: ChatDomain,
  input: ChatDomainRoomRouteInput
): string {
  const domain = requireChatDomain(input.domain);
  assertChatDomainOwnership(owner, domain, "router");

  const roomId = input.roomId.trim();
  if (!roomId) throw new Error("dibay_chat_domain_router_room_id_required");

  const identityKey = requireDomainIdentityKey(input.identityKey);
  if (!identityKey.startsWith(`${domain}:`)) {
    throw new Error("dibay_chat_domain_router_identity_mismatch");
  }
  if (domain === "group" && identityKey !== `group:${roomId}`) {
    throw new Error("dibay_chat_domain_router_identity_mismatch");
  }

  const url = new URL(
    `/community-messenger/rooms/${encodeURIComponent(roomId)}`,
    "https://samarket.local"
  );
  const from = input.from?.trim();
  if (
    from === "community" ||
    from === "trade" ||
    from === "delivery" ||
    from === "delivery-owner"
  ) {
    url.searchParams.set("from", from);
  }
  if (domain === "trade") url.searchParams.set("cm_list", "trade");
  if (domain === "store_order") url.searchParams.set("cm_list", "delivery");

  const returnHref = sanitizeInternalReturnHref(input.returnHref);
  if (returnHref) url.searchParams.set("cm_return", returnHref);
  const reservedRouteKeys = new Set(["from", "cm_list", "cm_return"]);
  for (const [key, value] of input.query ?? []) {
    const normalizedKey = key.trim();
    const normalizedValue = value.trim();
    if (
      normalizedKey &&
      normalizedValue &&
      !reservedRouteKeys.has(normalizedKey)
    ) {
      url.searchParams.set(normalizedKey, normalizedValue);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
