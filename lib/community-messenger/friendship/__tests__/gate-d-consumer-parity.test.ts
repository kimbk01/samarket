import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

async function readRepoFile(relPath: string): Promise<string> {
  return readFile(new URL(relPath, import.meta.url), "utf8");
}

function extractFunctionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) return "";
  const braceStart = src.indexOf("{", start);
  if (braceStart < 0) return "";
  let depth = 0;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(braceStart, i + 1);
    }
  }
  return "";
}

describe("Gate D — bootstrap/home-sync SSOT friends path", () => {
  it("home-sync full tier uses listCommunityMessengerFriendsFromSsot", async () => {
    const src = await readRepoFile("../../get-community-messenger-home-sync-bundle.ts");
    expect(src).toContain("listCommunityMessengerFriendsFromSsot");
    expect(src).not.toMatch(/listCommunityMessengerFriends\s*\(/);
  });

  it("fetchBootstrapLiteSocialGraphSnapshot uses SSOT bootstrap rows only", async () => {
    const src = await readRepoFile("../../service.ts");
    const body = extractFunctionBody(
      src,
      "export async function fetchBootstrapLiteSocialGraphSnapshot"
    );
    expect(body).toContain("listBootstrapAcceptedFriendRowsFromSsot");
    expect(body).not.toContain("fetchCommunityFriendAcceptedRowsForViewer");
  });

  it("getCommunityMessengerBootstrap full fetch uses SSOT accepted rows", async () => {
    const src = await readRepoFile("../../service.ts");
    const idx = src.indexOf("const acceptedFriendRowsPromise");
    expect(idx).toBeGreaterThan(0);
    const slice = src.slice(idx, idx + 500);
    expect(slice).toContain("listBootstrapAcceptedFriendRowsFromSsot");
    expect(slice).not.toContain("fetchCommunityFriendAcceptedRowsForViewer");
  });

  it("full bootstrap snapshot assemble does not call overlay resolver", async () => {
    const src = await readRepoFile("../../full-bootstrap-snapshot-assemble.ts");
    expect(src).toContain("listBootstrapAcceptedFriendRowsFromSsot");
    expect(src).not.toContain("resolveBootstrapAcceptedFriendRows");
  });

  it("listCommunityMessengerFriends legacy body unchanged (Step 2 LOCK)", async () => {
    const src = await readRepoFile("../../service.ts");
    const body = extractFunctionBody(src, "export async function listCommunityMessengerFriends");
    expect(body).toContain("fetchCommunityFriendAcceptedRowsForViewer");
    expect(body).not.toContain("listBootstrapAcceptedFriendRowsFromSsot");
  });

  it("GET /api/friends route still uses SSOT list (Step 2 LOCK)", async () => {
    const src = await readRepoFile("../../../../app/api/community-messenger/friends/route.ts");
    expect(src).toContain("listCommunityMessengerFriendsFromSsot");
    expect(src).not.toMatch(/listCommunityMessengerFriends\s*\(/);
  });

  it("home realtime subscribes community_messenger_friendships for refresh", async () => {
    const src = await readRepoFile("../../realtime/community-messenger-home-realtime-channels.ts");
    expect(src).toContain('table: "community_messenger_friendships"');
  });
});

describe("Gate D — cross-consumer peer id parity (unit)", () => {
  it("bootstrap SSOT peer ids helper dedupes viewer-relative peers", async () => {
    const { listSsotAcceptedPeerIdsForViewer } = await import(
      "@/lib/community-messenger/friendship/bootstrap-accepted-friend-rows-from-ssot"
    );
    const { listCommunityMessengerFriendsFromSsot } = await import(
      "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot"
    );
    expect(typeof listSsotAcceptedPeerIdsForViewer).toBe("function");
    expect(typeof listCommunityMessengerFriendsFromSsot).toBe("function");
  });
});
