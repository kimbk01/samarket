import { describe, expect, it } from "vitest";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

describe("isMissingAppNoticesTableError", () => {
  it("rejects column-missing errors that mention app_notices", () => {
    expect(
      isMissingAppNoticesTableError("column app_notices.starts_at does not exist")
    ).toBe(false);
    expect(
      isMissingAppNoticesTableError(
        "Could not find the 'ends_at' column of 'app_notices' in the schema cache"
      )
    ).toBe(false);
  });

  it("accepts relation/table missing only", () => {
    expect(
      isMissingAppNoticesTableError('relation "public.app_notices" does not exist')
    ).toBe(true);
    expect(
      isMissingAppNoticesTableError('relation "app_notices" does not exist')
    ).toBe(true);
    expect(
      isMissingAppNoticesTableError("Could not find the table 'public.app_notices' in the schema cache")
    ).toBe(true);
  });
});
