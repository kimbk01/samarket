import type { SupabaseClient } from "@supabase/supabase-js";
import { deterministicUuid } from "@/lib/server/deterministic-uuid";
import { isValidNeighborhoodLocationKey } from "@/lib/neighborhood/location-validation";

export type EnsureLocationInput = {
  country?: string;
  city: string;
  district?: string;
  name: string;
};

export type ResolveNeighborhoodLocationResult = {
  locationId: string | null;
  /** API·로그용 (민감 정보 제외) */
  failure?: "invalid_key" | "schema_missing" | "persist_failed";
  supabaseMessage?: string;
};

function normalizeCountryName(raw: string): string {
  const v = raw.trim();
  if (!v) return "Philippines";
  const lower = v.toLowerCase();
  if (lower === "ph" || lower === "phl" || lower === "philippines") return "Philippines";
  return v;
}

/** 동일 국가·도시·읍면동·표시명 비교 (locations_dedup 인덱스와 동일한 비교 의미) */
async function findLocationIdByMeta(
  sb: SupabaseClient<any>,
  country: string,
  city: string,
  district: string,
  name: string
): Promise<string | null> {
  const dWant = district.trim().toLowerCase();
  const { data: candidates, error } = await sb
    .from("locations")
    .select("id, district")
    .ilike("country", country)
    .ilike("city", city)
    .ilike("name", name);
  if (error || !Array.isArray(candidates)) return null;
  for (const row of candidates as { id?: string; district?: string | null }[]) {
    const d = String(row.district ?? "").toLowerCase();
    if (d === dWant && row.id) return String(row.id);
  }
  return null;
}

/**
 * country 컬럼이 PH / Philippines 등으로 갈라져 dedup·조회가 어긋날 때 복구.
 * city·district·name(대소문자 무시)이 일치하는 행 id 반환.
 */
async function findLocationIdByCityDistrictName(
  sb: SupabaseClient<any>,
  city: string,
  district: string,
  name: string
): Promise<string | null> {
  const cWant = city.trim().toLowerCase();
  const dWant = district.trim().toLowerCase();
  const nWant = name.trim().toLowerCase();
  if (!cWant || !nWant) return null;

  const { data: candidates, error } = await sb.from("locations").select("id, city, district, name").ilike("city", city.trim());
  if (error || !Array.isArray(candidates)) return null;

  for (const row of candidates as { id?: string; city?: string; district?: string | null; name?: string }[]) {
    const c = String(row.city ?? "").trim().toLowerCase();
    const d = String(row.district ?? "").toLowerCase();
    const n = String(row.name ?? "").trim().toLowerCase();
    if (c === cWant && d === dWant && n === nWant && row.id) return String(row.id);
  }
  return null;
}

function isSchemaMissingError(error: { message?: string }): boolean {
  const msg = String(error.message ?? "");
  return msg.includes("locations") && (msg.includes("does not exist") || msg.includes("column"));
}

function isUniqueViolation(error: { message?: string; code?: string }): boolean {
  const msg = String(error.message ?? "");
  const code = String(error.code ?? "");
  return code === "23505" || /duplicate key|unique constraint/i.test(msg);
}

function isPermissionError(error: { message?: string }): boolean {
  const msg = String(error.message ?? "").toLowerCase();
  return msg.includes("permission denied") || msg.includes("rls");
}

/**
 * locationKey = `${regionId}:${cityId}:${barangay}` → locations.id
 * 동일 키면 동일 결정적 uuid. 시드/레거시 행이 locations_dedup 으로 막는 경우 기존 id 를 쓴다.
 */
export async function resolveNeighborhoodLocationId(
  sb: SupabaseClient<any>,
  locationKey: string,
  input: EnsureLocationInput
): Promise<ResolveNeighborhoodLocationResult> {
  const key = locationKey.trim();
  if (!key || !isValidNeighborhoodLocationKey(key)) {
    return { locationId: null, failure: "invalid_key" };
  }
  const deterministicId = deterministicUuid("samarket_neighborhood_location", key);
  const country = normalizeCountryName(input.country ?? "Philippines");
  const city = input.city.trim();
  const district = (input.district ?? "").trim();
  const name = input.name.trim() || city;

  const { data: byPk, error: pkErr } = await sb.from("locations").select("id").eq("id", deterministicId).maybeSingle();
  if (pkErr && isSchemaMissingError(pkErr)) {
    return { locationId: null, failure: "schema_missing", supabaseMessage: pkErr.message };
  }

  if (byPk && typeof (byPk as { id?: string }).id === "string") {
    return { locationId: String((byPk as { id: string }).id) };
  }

  let byMeta = await findLocationIdByMeta(sb, country, city, district, name);
  if (byMeta) return { locationId: byMeta };

  byMeta = await findLocationIdByMeta(sb, "PH", city, district, name);
  if (byMeta) return { locationId: byMeta };

  const byTriple = await findLocationIdByCityDistrictName(sb, city, district, name);
  if (byTriple) return { locationId: byTriple };

  const { error: upErr } = await sb.from("locations").upsert(
    {
      id: deterministicId,
      country,
      city,
      district,
      name,
    },
    { onConflict: "id" }
  );

  if (!upErr) return { locationId: deterministicId };

  if (isSchemaMissingError(upErr)) {
    return { locationId: null, failure: "schema_missing", supabaseMessage: upErr.message };
  }

  const afterFail =
    (await findLocationIdByMeta(sb, country, city, district, name)) ??
    (await findLocationIdByMeta(sb, "PH", city, district, name)) ??
    (await findLocationIdByCityDistrictName(sb, city, district, name));

  if (afterFail) return { locationId: afterFail };

  if (isUniqueViolation(upErr)) {
    const fb =
      (await findLocationIdByCityDistrictName(sb, city, district, name)) ??
      (await findLocationIdByMeta(sb, country, city, district, name));
    if (fb) return { locationId: fb };
  }

  if (process.env.NODE_ENV === "development") {
    console.error("[resolveNeighborhoodLocationId] upsert failed:", upErr.message, upErr);
  }

  return {
    locationId: null,
    failure: "persist_failed",
    supabaseMessage: isPermissionError(upErr)
      ? "DB 쓰기 권한이 없습니다. Supabase에서 service role 키와 RLS를 확인하세요."
      : upErr.message,
  };
}

/** @deprecated 선호: resolveNeighborhoodLocationId (실패 원인 구분 가능) */
export async function ensureLocationId(
  sb: SupabaseClient<any>,
  locationKey: string,
  input: EnsureLocationInput
): Promise<string | null> {
  const r = await resolveNeighborhoodLocationId(sb, locationKey, input);
  return r.locationId;
}
