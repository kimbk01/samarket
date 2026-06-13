import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("native exchange route contract", () => {
  it("keeps no-store headers and sessionEstablished guard", () => {
    const routeSource = fs.readFileSync(
      path.join(ROOT, "app/api/auth/native/exchange/route.ts"),
      "utf8",
    );
    expect(routeSource).toContain('Cache-Control", "no-store, no-cache, must-revalidate"');
    expect(routeSource).toContain('Pragma", "no-cache"');
    expect(routeSource).toContain("sessionEstablished !== true");
    expect(routeSource).toContain("parseNativeExchangeRequest");
    expect(routeSource).not.toContain("parseNativeAppleExchangeBody");
    expect(routeSource).toContain("needsProfileCompletion");
    expect(routeSource).toContain("needsTermsAgreement");
    expect(routeSource).toContain("isNewUser");
    expect(routeSource).toContain("userId");
  });

  it("defines shared native provider contract types", () => {
    const contractSource = fs.readFileSync(
      path.join(ROOT, "lib/auth/native/native-provider-contract.ts"),
      "utf8",
    );
    expect(contractSource).toContain("NativeExchangeSuccessResponse");
    expect(contractSource).toContain("NativeExchangeRequest");
    expect(contractSource).toContain('"google", "kakao", "apple", "facebook"');
  });

  it("does not register naver in native exchange types", () => {
    const typesSource = fs.readFileSync(
      path.join(ROOT, "lib/auth/native/native-exchange-types.server.ts"),
      "utf8",
    );
    expect(typesSource).toContain("native-provider-contract");
    expect(typesSource).not.toContain('"naver"');
  });
});
