// @vitest-environment jsdom
/**
 * 매장 위치 시트 — 지도가 같은 좌표를 새 객체로 다시 보내도 주소 찾기가 멈추지 않는다
 * (운영 실기 2026-11-10 P1: 「주소를 찾는 중…」에서 멈춰 매장 위치를 정할 수 없었음).
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/ui/dibay-overlay/DibayFullSheet", () => ({
  DibayFullSheet: ({
    open,
    children,
    actions,
  }: {
    open: boolean;
    children: ReactNode;
    actions?: { key: string; label: string; disabled?: boolean; onClick: () => void }[];
  }) =>
    open ? (
      <div>
        {children}
        {actions?.map((a) => (
          <button key={a.key} data-action={a.key} disabled={a.disabled} onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>
    ) : null,
}));
/** 지도 흉내: 렌더될 때마다 같은 좌표를 새 객체로 다시 보낸다 (center 모드 idle 과 같음) */
vi.mock("@/components/map/MapPicker", () => ({
  MAP_PICKER_DEFAULT_CENTER: { lat: 14.5995, lng: 120.9842 },
  MapPicker: ({ marker, onMarkerPositionChange }: { marker: { lat: number; lng: number }; onMarkerPositionChange: (p: { lat: number; lng: number }) => void }) => {
    queueMicrotask(() => onMarkerPositionChange({ lat: marker.lat, lng: marker.lng }));
    return <div data-map="1" />;
  },
}));
const resolver = vi.fn();
vi.mock("@/lib/addresses/canonical-address-resolver", () => ({
  resolveCanonicalAddressFromLatLng: (...a: unknown[]) => resolver(...a),
}));
vi.mock("@/lib/permissions/device-permission-manager", () => ({ requestLocationWithDiBaYGate: vi.fn() }));
vi.mock("@/lib/ui/light-tap-feedback", () => ({ triggerInteractionFeedback: vi.fn() }));

import { StoreLocationPickSheet } from "@/components/business/apply/StoreLocationPickSheet";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  resolver.mockReset();
  resolver.mockResolvedValue({
    latitude: 14.5995,
    longitude: 120.9842,
    placeId: null,
    placeName: null,
    placeTypes: [],
    streetNumber: null,
    route: "Nicanor Reyes St",
    streetAddress: null,
    barangay: "Quiapo",
    cityMunicipality: "Manila",
    province: "Metro Manila",
    postalCode: null,
    neighborhoodName: null,
    formattedAddress: "Nicanor Reyes St, Quiapo, Manila",
    identitySource: "geocoder",
    samePlaceAsPreferred: false,
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("StoreLocationPickSheet", () => {
  it("같은 좌표 재전송에도 주소를 찾아 「이 위치로 정하기」가 켜진다", async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(<StoreLocationPickSheet open onClose={() => undefined} initial={null} onConfirm={onConfirm} />);
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(300);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Nicanor Reyes St, Quiapo, Manila");
    const ok = host.querySelector<HTMLButtonElement>('[data-action="ok"]');
    expect(ok?.disabled).toBe(false);
    await act(async () => ok!.click());
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ formattedAddress: "Nicanor Reyes St, Quiapo, Manila", city: "Manila", lat: 14.5995 })
    );
  });
});
