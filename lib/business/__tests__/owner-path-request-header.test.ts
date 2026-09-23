import { describe, expect, it } from "vitest";
import {
  X_SAM_OWNER_PATH_HEADER,
  applyOwnerPathRequestHeader,
  isOwnerOrderChatEnsurePath,
  isStoresOwnerPath,
} from "@/lib/business/owner-path-request-header";

describe("owner-path-request-header", () => {
  it("marks stores owner paths", () => {
    expect(isStoresOwnerPath("/stores/owner")).toBe(true);
    expect(isStoresOwnerPath("/stores/owner/orders")).toBe(true);
    expect(isStoresOwnerPath("/stores/owner/order-chat/abc")).toBe(true);
    expect(isStoresOwnerPath("/community-messenger")).toBe(false);
  });

  it("detects order-chat ensure path", () => {
    expect(isOwnerOrderChatEnsurePath("/stores/owner/order-chat/abc")).toBe(true);
    expect(isOwnerOrderChatEnsurePath("/stores/owner/order-chats")).toBe(false);
  });

  it("sets x-sam-owner-path on request Headers for owner paths only", () => {
    const h = new Headers();
    applyOwnerPathRequestHeader(h, "/stores/owner/order-chat/db78185f-1d84-42d7-93ed-55f5245ad4fe");
    expect(h.get(X_SAM_OWNER_PATH_HEADER)).toBe(
      "/stores/owner/order-chat/db78185f-1d84-42d7-93ed-55f5245ad4fe"
    );

    const other = new Headers();
    applyOwnerPathRequestHeader(other, "/mypage");
    expect(other.get(X_SAM_OWNER_PATH_HEADER)).toBeNull();
  });
});
