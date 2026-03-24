/**
 * 필리핀 4자리 ZIP → `regions-data`의 regionId·cityId.
 * 전국 전체 우편 DB는 아니며 대표 번호 위주. 미매칭 시 아래에서 직접 선택.
 */

export type ZipLocationHit = { regionId: string; cityId: string };

/** 자주 쓰이는 우편번호 → 앱 내 동네(Area) id */
const ZIP_TO_LOCATION: Record<string, ZipLocationHit> = {
  // Manila (City of Manila)
  "1000": { regionId: "manila", cityId: "m3" },
  "1001": { regionId: "manila", cityId: "m4" },
  "1002": { regionId: "manila", cityId: "m5" },
  "1003": { regionId: "manila", cityId: "m6" },
  "1004": { regionId: "manila", cityId: "m1" },
  "1005": { regionId: "manila", cityId: "m13" },
  "1006": { regionId: "manila", cityId: "m14" },
  "1007": { regionId: "manila", cityId: "m3" },
  "1008": { regionId: "manila", cityId: "m15" },
  "1009": { regionId: "manila", cityId: "m16" },
  "1010": { regionId: "manila", cityId: "m7" },
  "1011": { regionId: "manila", cityId: "m8" },
  "1012": { regionId: "manila", cityId: "m6" },
  "1013": { regionId: "manila", cityId: "m11" },
  "1014": { regionId: "manila", cityId: "m12" },
  "1015": { regionId: "manila", cityId: "m7" },
  "1016": { regionId: "manila", cityId: "m9" },
  "1017": { regionId: "manila", cityId: "m10" },
  "1018": { regionId: "manila", cityId: "m1" },
  // Metro pockets (앱 목록 기준)
  "1200": { regionId: "manila", cityId: "m2" },
  "1210": { regionId: "manila", cityId: "m39" },
  "1219": { regionId: "manila", cityId: "m40" },
  "1223": { regionId: "manila", cityId: "m2" },
  "1224": { regionId: "manila", cityId: "m2" },
  "1225": { regionId: "manila", cityId: "m2" },
  "1226": { regionId: "manila", cityId: "m18" },
  "1227": { regionId: "manila", cityId: "m18" },
  "1228": { regionId: "manila", cityId: "m19" },
  "1230": { regionId: "manila", cityId: "m20" },
  "1231": { regionId: "manila", cityId: "m18" },
  "1232": { regionId: "manila", cityId: "m25" },
  "1233": { regionId: "manila", cityId: "m26" },
  "1234": { regionId: "manila", cityId: "m27" },
  "1235": { regionId: "manila", cityId: "m28" },
  "1550": { regionId: "manila", cityId: "m23" },
  "1552": { regionId: "manila", cityId: "m24" },
  "1300": { regionId: "manila", cityId: "m36" },
  "1309": { regionId: "manila", cityId: "m37" },
  "1400": { regionId: "manila", cityId: "m30" },
  "1401": { regionId: "manila", cityId: "m31" },
  "1440": { regionId: "manila", cityId: "m32" },
  "1441": { regionId: "manila", cityId: "m33" },
  "1442": { regionId: "manila", cityId: "m34" },
  "1443": { regionId: "manila", cityId: "m35" },
  "1470": { regionId: "manila", cityId: "m38" },
  "1600": { regionId: "manila", cityId: "m29" },
  // Quezon City
  "1100": { regionId: "quezon", cityId: "q3" },
  "1101": { regionId: "quezon", cityId: "q1" },
  "1102": { regionId: "quezon", cityId: "q23" },
  "1103": { regionId: "quezon", cityId: "q24" },
  "1104": { regionId: "quezon", cityId: "q25" },
  "1105": { regionId: "quezon", cityId: "q3" },
  "1106": { regionId: "quezon", cityId: "q4" },
  "1107": { regionId: "quezon", cityId: "q10" },
  "1109": { regionId: "quezon", cityId: "q11" },
  "1110": { regionId: "quezon", cityId: "q12" },
  "1111": { regionId: "quezon", cityId: "q13" },
  "1112": { regionId: "quezon", cityId: "q14" },
  "1113": { regionId: "quezon", cityId: "q15" },
  "1114": { regionId: "quezon", cityId: "q16" },
  "1115": { regionId: "quezon", cityId: "q5" },
  "1116": { regionId: "quezon", cityId: "q6" },
  "1117": { regionId: "quezon", cityId: "q7" },
  "1118": { regionId: "quezon", cityId: "q8" },
  "1119": { regionId: "quezon", cityId: "q2" },
  "1120": { regionId: "quezon", cityId: "q17" },
  "1121": { regionId: "quezon", cityId: "q18" },
  "1122": { regionId: "quezon", cityId: "q19" },
  "1123": { regionId: "quezon", cityId: "q20" },
  "1124": { regionId: "quezon", cityId: "q21" },
  "1125": { regionId: "quezon", cityId: "q22" },
  "1126": { regionId: "quezon", cityId: "q30" },
  "1127": { regionId: "quezon", cityId: "q31" },
  "1128": { regionId: "quezon", cityId: "q9" },
  // Cebu
  "6000": { regionId: "cebu", cityId: "c11" },
  "6001": { regionId: "cebu", cityId: "c2" },
  "6014": { regionId: "cebu", cityId: "c2" },
  "6015": { regionId: "cebu", cityId: "c28" },
  "6016": { regionId: "cebu", cityId: "c29" },
  "6045": { regionId: "cebu", cityId: "c28" },
  "6046": { regionId: "cebu", cityId: "c3" },
  "6004": { regionId: "cebu", cityId: "c4" },
  "6006": { regionId: "cebu", cityId: "c6" },
  // Angeles / Pampanga (대표)
  "2009": { regionId: "angeles", cityId: "a1" },
  "2010": { regionId: "angeles", cityId: "a2" },
};

export function normalizePhilippinesZipInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

export function lookupLocationByPhilippinesZip(raw: string): ZipLocationHit | null {
  const code = normalizePhilippinesZipInput(raw);
  if (code.length !== 4) return null;
  return ZIP_TO_LOCATION[code] ?? null;
}
