/**
 * Cap iOS/Android pushNotificationActionPerformed → flat string map for route resolve.
 *
 * Cap coerces APNs userInfo (incl. nested `aps`, NSNumber) into JSObject.
 * Route resolvers expect string leaf values — coerce without inventing routes.
 */

const ROUTE_HINT_KEYS = [
  "routeUrl",
  "route_url",
  "targetApprovedRoute",
  "target_approved_route",
  "targetRoute",
  "target_route",
  "url",
  "link_url",
  "link_url_absolute",
] as const;

function leafToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return undefined;
}

/**
 * Flatten Cap notification.data into FcmRouteData-compatible string fields.
 * Nested dictionaries (except opaque `aps`) are flattened one level for known keys.
 */
export function normalizeNativePushTapData(
  raw: Record<string, unknown> | null | undefined
): Record<string, string | undefined> {
  if (!raw || typeof raw !== "object") return {};

  const out: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === "aps") continue;
    const asString = leafToString(value);
    if (asString !== undefined) {
      out[key] = asString;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [innerKey, innerVal] of Object.entries(value as Record<string, unknown>)) {
        const innerStr = leafToString(innerVal);
        if (innerStr === undefined) continue;
        // Fill missing keys only — never overwrite top-level route hints.
        if (out[innerKey] === undefined) {
          out[innerKey] = innerStr;
        } else if ((ROUTE_HINT_KEYS as readonly string[]).includes(innerKey) && !out[innerKey]) {
          out[innerKey] = innerStr;
        }
      }
    }
  }

  return out;
}
