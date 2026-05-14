import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleRoutesComputeRoutesSingleLeg } from "@/lib/geo/google-routes-client";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env.GOOGLE_ROUTES_API_DISABLED = ORIGINAL_ENV.GOOGLE_ROUTES_API_DISABLED;
  process.env.GOOGLE_ROUTES_MATRIX_DISABLED = ORIGINAL_ENV.GOOGLE_ROUTES_MATRIX_DISABLED;
  process.env.GOOGLE_ROUTES_TRAVEL_MODE = ORIGINAL_ENV.GOOGLE_ROUTES_TRAVEL_MODE;
  process.env.GOOGLE_ROUTES_TRAFFIC_AWARE = ORIGINAL_ENV.GOOGLE_ROUTES_TRAFFIC_AWARE;
  process.env.GOOGLE_ROUTES_ALLOW_TWO_WHEELER = ORIGINAL_ENV.GOOGLE_ROUTES_ALLOW_TWO_WHEELER;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = ORIGINAL_ENV.GOOGLE_MAPS_SERVER_API_KEY;
  process.env.GOOGLE_MAPS_ROUTES_API_KEY = ORIGINAL_ENV.GOOGLE_MAPS_ROUTES_API_KEY;
  process.env.GOOGLE_MAPS_ROUTES_SERVER_KEY = ORIGINAL_ENV.GOOGLE_MAPS_ROUTES_SERVER_KEY;
}

function mockRoutesFetch(duration = "600s", distanceMeters = 3200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ routes: [{ duration, distanceMeters }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

describe("google routes cost guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it("does not call Google when routes are disabled", async () => {
    process.env.GOOGLE_ROUTES_API_DISABLED = "1";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchGoogleRoutesComputeRoutesSingleLeg(
      { lat: 14.5, lng: 121.0 },
      { lat: 14.6, lng: 121.1 },
      { source: "test", reason: "disabled_guard" }
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.skipReason).toBe("disabled_by_env");
    expect(result.rideMinutes).toBeNull();
    expect(result.routeDistanceMeters).toBeNull();
  });

  it("uses DRIVE without traffic aware by default when explicitly enabled", async () => {
    process.env.GOOGLE_ROUTES_API_DISABLED = "0";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-key";
    process.env.GOOGLE_ROUTES_TRAVEL_MODE = "TWO_WHEELER";
    process.env.GOOGLE_ROUTES_ALLOW_TWO_WHEELER = "0";
    process.env.GOOGLE_ROUTES_TRAFFIC_AWARE = "0";
    const fetchSpy = mockRoutesFetch();

    const result = await fetchGoogleRoutesComputeRoutesSingleLeg(
      { lat: 14.51, lng: 121.01 },
      { lat: 14.61, lng: 121.11 },
      { source: "test", reason: "drive_default" }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.travelMode).toBe("DRIVE");
    expect(body.routingPreference).toBeUndefined();
    expect(body.computeAlternativeRoutes).toBe(false);
    expect((init as RequestInit).headers).toMatchObject({
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    });
    expect(result.travelModeUsed).toBe("DRIVE");
  });

  it("dedupes five identical concurrent requests into one Google call", async () => {
    process.env.GOOGLE_ROUTES_API_DISABLED = "0";
    process.env.GOOGLE_MAPS_SERVER_API_KEY = "test-key";
    process.env.GOOGLE_ROUTES_TRAVEL_MODE = "DRIVE";
    process.env.GOOGLE_ROUTES_TRAFFIC_AWARE = "0";
    process.env.GOOGLE_ROUTES_ALLOW_TWO_WHEELER = "0";
    const fetchSpy = mockRoutesFetch("540s", 2800);

    const origin = { lat: 14.52, lng: 121.02 };
    const destination = { lat: 14.62, lng: 121.12 };
    const calls = Array.from({ length: 5 }, () =>
      fetchGoogleRoutesComputeRoutesSingleLeg(origin, destination, {
        source: "test",
        reason: "five_click_dedupe",
      })
    );

    const results = await Promise.all(calls);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.rideMinutes === 9)).toBe(true);
    expect(results.every((r) => r.routeDistanceMeters === 2800)).toBe(true);
  });
});
