import { describe, expect, it } from "vitest";
import {
  describeMeAddressesListFailure,
  translateUserAddressApiError,
} from "@/lib/addresses/user-address-api-error-i18n";
import type { MeAddressesListFetchResult } from "@/lib/addresses/address-list-client-cache";

function mockTranslate(key: string): string {
  const map: Record<string, string> = {
    addr_ui_list_err_login_required: "LOGIN",
    addr_ui_list_err_network: "NETWORK",
    addr_ui_table_missing: "TABLE_MISSING",
    addr_ui_store_not_master: "STORE_MASTER",
    addr_ui_api_nickname_duplicate: "DUP",
    address_load_failed: "FALLBACK",
    addr_ui_save_failed: "SAVE_FAIL",
  };
  return map[key] ?? key;
}

describe("translateUserAddressApiError", () => {
  it("maps stable API codes to i18n keys", () => {
    expect(translateUserAddressApiError("store_cannot_be_master", mockTranslate)).toBe("STORE_MASTER");
    expect(translateUserAddressApiError("nickname_duplicate", mockTranslate)).toBe("DUP");
    expect(translateUserAddressApiError("place_id_required", mockTranslate, "addr_ui_save_failed")).toBe(
      "addr_ui_no_place_id",
    );
  });

  it("maps legacy Korean server messages for deploy compatibility", () => {
    expect(
      translateUserAddressApiError(
        "매장 연결 주소는 대표 주소로 둘 수 없어요. 우리집·회사 등 일반 주소를 대표로 지정해 주세요.",
        mockTranslate,
      ),
    ).toBe("STORE_MASTER");
  });

  it("passes through unknown errors", () => {
    expect(translateUserAddressApiError("db_timeout", mockTranslate, "addr_ui_save_failed")).toBe("db_timeout");
  });
});

describe("describeMeAddressesListFailure", () => {
  it("uses translateUserAddressApiError for non-auth errors", () => {
    expect(
      describeMeAddressesListFailure(
        { ok: false, status: 500, rows: [], error: "user_addresses_table_missing" } satisfies MeAddressesListFetchResult,
        mockTranslate,
      ),
    ).toBe("TABLE_MISSING");
  });
});
