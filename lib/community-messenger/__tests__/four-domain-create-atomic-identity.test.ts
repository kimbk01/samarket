/**
 * Contract: every domain create path must atomically write chat_domain + domain_identity_key.
 * Prod NOT NULL on both columns — insert without them fails.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  plannedColumnsForGroup,
  plannedColumnsForStoreOrderRoom,
  roomDomainInsertColumns,
} from "@/lib/chat-domain/domain-identity-legacy-map";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("four-domain create atomic identity", () => {
  it("store-order ensure insert includes chat_domain + domain_identity_key", () => {
    const src = readFileSync(join(root, "store-order-chat-service.ts"), "utf8");
    expect(src).toContain("roomDomainInsertColumns(plannedColumnsForStoreOrderRoom");
    expect(src).toContain("domain_identity_key: soDomainCols.domain_identity_key");
    expect(src).toContain("chat_domain: soDomainCols.chat_domain");
    const cols = roomDomainInsertColumns(plannedColumnsForStoreOrderRoom("order-z"));
    expect(cols).toEqual({
      chat_domain: "store_order",
      domain_identity: "store_order:order-z",
      domain_identity_key: "store_order:order-z",
    });
  });

  it("private group insert preallocates id and writes group:{id} identity", () => {
    const src = readFileSync(join(root, "group/group-room-repository.ts"), "utf8");
    expect(src).toContain("plannedColumnsForGroup(roomId)");
    expect(src).toContain("domain_identity_key: domainCols.domain_identity_key");
    expect(src).toContain("id: roomId");
    const cols = roomDomainInsertColumns(plannedColumnsForGroup("g-1"));
    expect(cols.chat_domain).toBe("group");
    expect(cols.domain_identity_key).toBe("group:g-1");
  });

  it("open group create preallocates id and writes group identity", () => {
    const src = readFileSync(join(root, "service.ts"), "utf8");
    const slice = src.slice(src.indexOf("export async function createOpenGroupRoom"));
    expect(slice).toContain("plannedColumnsForGroup(roomId)");
    expect(slice).toContain("domain_identity_key: domainCols.domain_identity_key");
    expect(slice).toContain("id: roomId");
  });

  it("1:1 member-sheet dial keeps source roomId (no peer-only GD ensure)", () => {
    const src = readFileSync(
      join(root, "room/phase2/use-messenger-room-phase2-controller.ts"),
      "utf8"
    );
    const slice = src.slice(src.indexOf("const startDirectCallWithMember"));
    expect(slice).toContain("!isGroupRoom");
    expect(slice).toContain("roomId: rid");
    expect(slice).toContain("launchOutgoingDirectCall");
  });

  it("GD + trade ensure paths dual-write domain_identity_key", () => {
    const src = readFileSync(join(root, "service.ts"), "utf8");
    expect(src).toContain("domain_identity_key: gdCols.domain_identity_key");
    expect(src).toContain("roomDomainInsertColumns(plannedDomain)");
  });
});
