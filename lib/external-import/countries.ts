/** Southeast Asia country codes supported by external-import architecture. */
export const SEA_COUNTRY_CODES = [
  "PH",
  "TH",
  "VN",
  "MY",
  "ID",
  "SG",
  "KH",
  "LA",
  "MM",
  "BN",
  "TL",
] as const;

export type SeaCountryCode = (typeof SEA_COUNTRY_CODES)[number];

export function isSeaCountryCode(value: string): value is SeaCountryCode {
  return (SEA_COUNTRY_CODES as readonly string[]).includes(value);
}
