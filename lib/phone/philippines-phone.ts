const PH_E164_RE = /^\+639\d{9}$/;

function stripPhoneNoise(raw: string): string {
  return String(raw ?? "").replace(/[\s()-]/g, "").trim();
}

export function normalizePhilippinesPhoneNumber(input: string): string {
  const cleaned = stripPhoneNoise(input);
  if (!cleaned) return "";

  const digitsOnly = cleaned.replace(/[^\d+]/g, "");
  let normalized = digitsOnly;

  if (normalized.startsWith("09")) {
    normalized = `+63${normalized.slice(1)}`;
  } else if (normalized.startsWith("639")) {
    normalized = `+${normalized}`;
  } else if (normalized.startsWith("+63")) {
    normalized = normalized;
  } else if (normalized.startsWith("9") && normalized.length === 10) {
    normalized = `+63${normalized}`;
  }

  return normalized;
}

export function isValidPhilippinesMobilePhone(phone: string): boolean {
  return PH_E164_RE.test(String(phone ?? "").trim());
}
