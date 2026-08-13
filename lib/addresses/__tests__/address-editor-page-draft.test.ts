import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearAddressEditorSession,
  hasAddressEditorSessionRestore,
  mergeFineTuneResultIntoEditorDraft,
  peekAddressEditorPageDraft,
  peekAddressFineTuneResult,
  writeAddressEditorPageDraft,
  writeAddressFineTuneResult,
  type AddressEditorPageDraftV1,
} from "@/lib/addresses/address-editor-page-draft";
import type { PhGooglePlaceParsed } from "@/lib/addresses/ph-google-place-address-components";

const parsedOk: PhGooglePlaceParsed = {
  routeLine: "Commonwealth Ave",
  barangay: null,
  cityMunicipality: "Quezon City",
  province: "Metro Manila",
  neighborhood: null,
  buildingOrPlaceHeadline: "Garden Residences",
  premiseName: null,
};

const baseDraft = (): AddressEditorPageDraftV1 => ({
  v: 1,
  mode: "create",
  addressId: null,
  returnTo: "/write",
  nickname: "",
  recipientName: "",
  phoneNumber: "",
  region: "",
  city: "",
  barangay: "",
  cityMunicipality: "",
  province: "",
  streetAddress: "",
  unitFloorRoom: "Unit 1",
  landmark: "",
  latitude: 14.6,
  longitude: 121.0,
  placeId: "",
  formattedAddress: "",
  roadAddress: "",
  fullAddress: "",
  neighborhoodName: "",
  buildingName: "",
  mapPinConfirmed: false,
  search: "",
  useLife: true,
  useTrade: true,
  useDel: true,
  defMaster: false,
  defLife: false,
  defTrade: false,
  defDel: false,
  labelPreset: "home",
  selectedStoreId: "",
  selectionAnchorSearch: null,
});

describe("address-editor-page-draft fine-tune restore", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("sessionStorage", sessionStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mergeFineTuneResultIntoEditorDraft sets mapPinConfirmed and building; remount peek keeps it", () => {
    writeAddressEditorPageDraft(baseDraft());
    mergeFineTuneResultIntoEditorDraft({
      latitude: 14.65,
      longitude: 121.05,
      formattedAddress: "Commonwealth Ave, Quezon City",
      placeId: "ChIJtest",
      parsed: parsedOk,
      buildingOrPlaceNames: ["Garden Residences", "Starbucks"],
    });
    const d1 = peekAddressEditorPageDraft();
    expect(d1?.mapPinConfirmed).toBe(true);
    expect(d1?.buildingName).toBe("Garden Residences");
    expect(d1?.placeId).toBe("ChIJtest");
    expect(d1?.unitFloorRoom).toBe("Unit 1");
    expect(peekAddressFineTuneResult()?.placeId).toBe("ChIJtest");
    /** remount simulation — peek again without clear */
    expect(peekAddressEditorPageDraft()?.buildingName).toBe("Garden Residences");
    expect(hasAddressEditorSessionRestore()).toBe(true);
    clearAddressEditorSession();
    expect(hasAddressEditorSessionRestore()).toBe(false);
  });

  it("rejects fine-tune result without placeId", () => {
    writeAddressFineTuneResult({
      latitude: 14.65,
      longitude: 121.05,
      formattedAddress: "Somewhere",
      placeId: null,
      parsed: {
        routeLine: null,
        barangay: null,
        cityMunicipality: null,
        province: null,
        neighborhood: null,
        buildingOrPlaceHeadline: null,
        premiseName: null,
      },
      buildingOrPlaceNames: [],
    });
    expect(peekAddressFineTuneResult()).toBeNull();
  });
});
