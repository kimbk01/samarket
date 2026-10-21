// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ADDRESS_EDIT_DRAFT_V3_MAX_AGE_MS,
  buildAddressEditDraftV3Key,
  clearAddressEditDraftV3ForAddress,
  readAddressEditDraftV3,
  writeAddressEditDraftV3,
} from "@/lib/addresses/canonical-address-draft-storage";

const fields = {
  detail: "Unit 5",
  landmark: "Green gate",
  note: "Call",
  labelType: "home" as const,
  nickname: null,
  isDefault: false,
};

describe("address edit draft v3 (UX-008)", () => {
  beforeEach(() => sessionStorage.clear());

  it("key = prefix:userId:addressId|new", () => {
    expect(buildAddressEditDraftV3Key("u1", null)).toBe("dibay.address.edit.draft.v3:u1:new");
    expect(buildAddressEditDraftV3Key("u1", "a1")).toBe("dibay.address.edit.draft.v3:u1:a1");
  });

  it("restores only same user + address + baseUpdatedAt within 2h", () => {
    writeAddressEditDraftV3({ userId: "u1", addressId: "a1", baseUpdatedAt: "t1", fields, now: 1000 });
    expect(readAddressEditDraftV3({ userId: "u2", addressId: "a1", baseUpdatedAt: "t1", now: 2000 })).toBeNull();
    expect(
      readAddressEditDraftV3({ userId: "u1", addressId: "a1", baseUpdatedAt: "t1", now: 2000 })?.fields,
    ).toEqual(fields);
    expect(readAddressEditDraftV3({ userId: "u1", addressId: "a1", baseUpdatedAt: "t2", now: 2000 })).toBeNull();
    /** 불일치 시 키 제거 */
    expect(sessionStorage.getItem(buildAddressEditDraftV3Key("u1", "a1"))).toBeNull();
  });

  it("expires after 2h", () => {
    writeAddressEditDraftV3({ userId: "u1", addressId: null, baseUpdatedAt: null, fields, now: 0 });
    expect(
      readAddressEditDraftV3({
        userId: "u1",
        addressId: null,
        baseUpdatedAt: null,
        now: ADDRESS_EDIT_DRAFT_V3_MAX_AGE_MS,
      }),
    ).toBeNull();
  });

  it("clears by address id on delete", () => {
    writeAddressEditDraftV3({ userId: "u1", addressId: "a1", baseUpdatedAt: "t1", fields });
    writeAddressEditDraftV3({ userId: "u1", addressId: "a2", baseUpdatedAt: "t1", fields });
    clearAddressEditDraftV3ForAddress("a1");
    expect(sessionStorage.getItem(buildAddressEditDraftV3Key("u1", "a1"))).toBeNull();
    expect(sessionStorage.getItem(buildAddressEditDraftV3Key("u1", "a2"))).not.toBeNull();
  });
});
