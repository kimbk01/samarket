import { describe, expect, it } from "vitest";
import {
  bypassesPhilippinePhoneVerificationGate,
  hasFormalMemberContactVerification,
  isAdminProvisionedFormalMemberAuthProvider,
  isAdminProvisionedFormalMemberSignals,
} from "./member-access";

describe("admin-provisioned formal member", () => {
  it("recognizes auth_provider values", () => {
    expect(isAdminProvisionedFormalMemberAuthProvider("manual_admin")).toBe(true);
    expect(isAdminProvisionedFormalMemberAuthProvider("manual_admin_backfill")).toBe(true);
    expect(isAdminProvisionedFormalMemberAuthProvider("email")).toBe(false);
  });

  it("recognizes @manual.local email", () => {
    expect(
      isAdminProvisionedFormalMemberSignals({
        authProvider: null,
        email: "seller1@manual.local",
      })
    ).toBe(true);
    expect(
      isAdminProvisionedFormalMemberSignals({
        authProvider: null,
        email: "x@example.com",
      })
    ).toBe(false);
  });

  it("bypasses phone gate when admin-provisioned but phone_verified false", () => {
    expect(
      bypassesPhilippinePhoneVerificationGate({
        role: "user",
        phone_verified: false,
        auth_provider: "manual_admin",
        email: "x@example.com",
      })
    ).toBe(true);
  });

  it("does not bypass for normal unverified member", () => {
    expect(
      bypassesPhilippinePhoneVerificationGate({
        role: "user",
        phone_verified: false,
        auth_provider: "email",
        email: "x@example.com",
      })
    ).toBe(false);
  });

  it("hasFormalMemberContactVerification matches SMS or admin-provisioned", () => {
    expect(
      hasFormalMemberContactVerification({
        phone_verified: true,
        auth_provider: "google",
        email: "a@gmail.com",
      })
    ).toBe(true);
    expect(
      hasFormalMemberContactVerification({
        phone_verified: false,
        auth_provider: "manual_admin",
        email: "x@example.com",
      })
    ).toBe(true);
    expect(
      hasFormalMemberContactVerification({
        phone_verified: false,
        auth_provider: "email",
        email: "u@manual.local",
      })
    ).toBe(true);
    expect(
      hasFormalMemberContactVerification({
        phone_verified: false,
        auth_provider: "email",
        email: "u@gmail.com",
      })
    ).toBe(false);
  });
});
