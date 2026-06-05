import { describe, expect, it } from "vitest";
import {
  hasMypageCmsTableMissingError,
  isMypageCmsTableMissingError,
} from "@/lib/my/is-mypage-cms-supabase-error";

describe("isMypageCmsTableMissingError", () => {
  it("detects PostgREST missing-table responses", () => {
    expect(
      isMypageCmsTableMissingError({
        code: "PGRST205",
        message: "Could not find the table 'public.my_services' in the schema cache",
        status: 404,
      }),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(
      isMypageCmsTableMissingError({
        code: "42501",
        message: "permission denied for table my_services",
        status: 403,
      }),
    ).toBe(false);
  });

  it("aggregates multiple errors", () => {
    expect(hasMypageCmsTableMissingError(null, { status: 404, message: "Not Found" })).toBe(true);
  });
});
