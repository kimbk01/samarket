const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 12_000;

export type LatLng = { lat: number; lng: number };
export type SingleLegRouteMetrics = {
  routeDistanceMeters: number | null;
  rideMinutes: number | null;
  travelModeUsed: "TWO_WHEELER" | "DRIVE" | null;
  fallbackUsed: boolean;
};

type ComputeRoutesResponse = {
  routes?: {
    duration?: string;
    distanceMeters?: number;
  }[];
};

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null;
  const m = /^(\d+(?:\.\d+)?)s$/i.exec(duration.trim());
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec >= 0 ? sec : null;
}

function minutesCeil(sec: number): number {
  return Math.max(1, Math.ceil(sec / 60));
}

async function computeSingleLeg(
  origin: LatLng,
  destination: LatLng,
  travelMode: "TWO_WHEELER" | "DRIVE",
): Promise<{ routeDistanceMeters: number | null; rideMinutes: number | null } | null> {
  const key = process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() || process.env.GOOGLE_MAPS_ROUTES_SERVER_KEY?.trim();
  if (!key) return null;
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode,
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
  };
  let res: Response;
  try {
    res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: ComputeRoutesResponse;
  try {
    json = (await res.json()) as ComputeRoutesResponse;
  } catch {
    return null;
  }
  const route = json.routes?.[0];
  if (!route) return null;
  const seconds = parseDurationSeconds(route.duration);
  const dm = route.distanceMeters;
  return {
    routeDistanceMeters: typeof dm === "number" && Number.isFinite(dm) && dm >= 0 ? Math.round(dm) : null,
    rideMinutes: seconds != null ? minutesCeil(seconds) : null,
  };
}

export async function fetchDeliveryRouteSingleLeg(
  origin: LatLng,
  destination: LatLng,
): Promise<SingleLegRouteMetrics> {
  const two = await computeSingleLeg(origin, destination, "TWO_WHEELER");
  if (two && (two.rideMinutes != null || two.routeDistanceMeters != null)) {
    return { ...two, travelModeUsed: "TWO_WHEELER", fallbackUsed: false };
  }
  const drive = await computeSingleLeg(origin, destination, "DRIVE");
  if (drive && (drive.rideMinutes != null || drive.routeDistanceMeters != null)) {
    return { ...drive, travelModeUsed: "DRIVE", fallbackUsed: true };
  }
  return { routeDistanceMeters: null, rideMinutes: null, travelModeUsed: null, fallbackUsed: true };
}
