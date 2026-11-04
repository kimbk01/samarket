/**
 * Member age gate — Owner 2026-11-05: minimum age 14, DOB self-declaration.
 * Self-report ≠ government ID verification.
 */

export const MEMBER_MIN_AGE_YEARS = 14;

export type AgeGateStatus = "unverified" | "verified" | "blocked_underage";

export type AgeGateProfileFields = {
  date_of_birth?: string | null;
  age_gate_status?: string | null;
  age_attested_at?: string | null;
  /** Member existed before the age policy (`member_age_gate_legacy_members`, server-read only). */
  age_gate_legacy?: boolean | null;
};

/** Parse YYYY-MM-DD (or ISO date prefix). Rejects invalid calendar dates. */
export function parseDateOfBirthInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dt.getTime() > todayUtc) return null;
  if (y < 1900) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Whole years elapsed from DOB to `at` (UTC calendar). */
export function ageYearsFromDob(dobYmd: string, at: Date = new Date()): number | null {
  const parsed = parseDateOfBirthInput(dobYmd);
  if (!parsed) return null;
  const [ys, ms, ds] = parsed.split("-").map(Number) as [number, number, number];
  let age = at.getUTCFullYear() - ys;
  const month = at.getUTCMonth() + 1;
  const day = at.getUTCDate();
  if (month < ms || (month === ms && day < ds)) age -= 1;
  return age;
}

export function isAtLeastMinAge(dobYmd: string, minYears: number = MEMBER_MIN_AGE_YEARS, at?: Date): boolean {
  const age = ageYearsFromDob(dobYmd, at);
  return age != null && age >= minYears;
}

/**
 * Server/current-state age gate: pre-policy member, or verified status + DOB still ≥ min age.
 * Missing columns (pre-migration) ⇒ unverified (fail-closed for new writes).
 */
export function hasAgeGateConsent(
  profile: AgeGateProfileFields | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!profile) return false;
  if (profile.age_gate_legacy === true) return true;
  const status = String(profile.age_gate_status ?? "").trim().toLowerCase();
  if (status === "blocked_underage") return false;
  if (status !== "verified") return false;
  const dob = parseDateOfBirthInput(profile.date_of_birth ?? null);
  if (!dob) return false;
  if (!profile.age_attested_at) return false;
  return isAtLeastMinAge(dob, MEMBER_MIN_AGE_YEARS, at);
}

export type AgeAttestationDecision =
  | { ok: true; dateOfBirth: string; ageYears: number; status: "verified" }
  | { ok: false; code: "dob_required" | "dob_invalid" | "age_under_minimum"; messageKo: string; messageEn: string };

export function evaluateAgeAttestationInput(input: {
  dateOfBirth?: unknown;
  attestAge?: unknown;
}): AgeAttestationDecision {
  if (input.attestAge !== true) {
    return {
      ok: false,
      code: "dob_required",
      messageKo: "만 14세 이상임에 동의해 주세요.",
      messageEn: "Please confirm that you are 14 years of age or older.",
    };
  }
  const dob = parseDateOfBirthInput(input.dateOfBirth);
  if (!dob) {
    return {
      ok: false,
      code: "dob_invalid",
      messageKo: "생년월일을 올바르게 입력해 주세요.",
      messageEn: "Please enter a valid date of birth.",
    };
  }
  const ageYears = ageYearsFromDob(dob);
  if (ageYears == null || ageYears < MEMBER_MIN_AGE_YEARS) {
    return {
      ok: false,
      code: "age_under_minimum",
      messageKo: "만 14세 이상만 가입할 수 있습니다.",
      messageEn: "You must be at least 14 years old to join.",
    };
  }
  return { ok: true, dateOfBirth: dob, ageYears, status: "verified" };
}
