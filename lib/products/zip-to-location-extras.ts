/**
 * PhilPost 4자리 → 지역·동네 보강 매핑.
 * `regions-data`의 모든 city가 최소 1개 ZIP으로 역조회되도록 하며,
 * `zip-to-location.ts`의 본표와 합쳐집니다.
 *
 * **Angeles `a3`~`a28` 구간(2001~2028 등):** PhilPost 실제 바랑가이 단위 ZIP이 아니라
 * 앱 내 동네(Area)마다 역조회·라운드트립 테스트를 맞추기 위한 **대표 코드 분배**입니다.
 * 실제 우편은 대부분 **2009(Angeles City)** 등 소수 코드를 쓰므로, 정확히 맞추려면
 * PhilPost 공식 목록(`https://www.phlpost.gov.ph/zip-code-locator/`)으로 본표를 보강하세요.
 */

export type ZipLocationHit = { regionId: string; cityId: string };

export const ZIP_TO_LOCATION_EXTRAS: Record<string, ZipLocationHit> = {
  // Manila — 본표에 없던 동네(대표 PhilPost 구역)
  "1660": { regionId: "manila", cityId: "m17" },
  "1702": { regionId: "manila", cityId: "m26" },
  "1236": { regionId: "manila", cityId: "m40" },

  // Quezon City — q26~q29, q32~q40 (본표 1128까지 외 구획)
  "1129": { regionId: "quezon", cityId: "q26" },
  "1130": { regionId: "quezon", cityId: "q27" },
  "1131": { regionId: "quezon", cityId: "q28" },
  "1132": { regionId: "quezon", cityId: "q29" },
  "1133": { regionId: "quezon", cityId: "q32" },
  "1134": { regionId: "quezon", cityId: "q33" },
  "1135": { regionId: "quezon", cityId: "q34" },
  "1136": { regionId: "quezon", cityId: "q35" },
  "1137": { regionId: "quezon", cityId: "q36" },
  "1138": { regionId: "quezon", cityId: "q37" },
  "1139": { regionId: "quezon", cityId: "q38" },
  "1140": { regionId: "quezon", cityId: "q39" },
  "1141": { regionId: "quezon", cityId: "q40" },

  // Cebu — 본표·범위에서 c11 등으로만 묶이던 세부 Area (대표 6000번대)
  "6017": { regionId: "cebu", cityId: "c1" },
  "6018": { regionId: "cebu", cityId: "c5" },
  "6019": { regionId: "cebu", cityId: "c7" },
  "6020": { regionId: "cebu", cityId: "c8" },
  "6021": { regionId: "cebu", cityId: "c9" },
  "6022": { regionId: "cebu", cityId: "c10" },
  "6023": { regionId: "cebu", cityId: "c12" },
  "6024": { regionId: "cebu", cityId: "c13" },
  "6025": { regionId: "cebu", cityId: "c14" },
  "6026": { regionId: "cebu", cityId: "c15" },
  "6027": { regionId: "cebu", cityId: "c16" },
  "6028": { regionId: "cebu", cityId: "c17" },
  "6029": { regionId: "cebu", cityId: "c18" },
  "6030": { regionId: "cebu", cityId: "c19" },
  "6031": { regionId: "cebu", cityId: "c20" },
  "6032": { regionId: "cebu", cityId: "c21" },
  "6033": { regionId: "cebu", cityId: "c22" },
  "6034": { regionId: "cebu", cityId: "c23" },
  "6035": { regionId: "cebu", cityId: "c24" },
  "6036": { regionId: "cebu", cityId: "c25" },
  "6037": { regionId: "cebu", cityId: "c26" },
  "6038": { regionId: "cebu", cityId: "c27" },
  "6039": { regionId: "cebu", cityId: "c30" },
  "6040": { regionId: "cebu", cityId: "c31" },
  "6041": { regionId: "cebu", cityId: "c32" },
  "6042": { regionId: "cebu", cityId: "c33" },
  "6043": { regionId: "cebu", cityId: "c34" },
  "6044": { regionId: "cebu", cityId: "c35" },

  // Angeles — 2009=a1, 2010=a2 유지, a3~a28 대표 코드 (2000~2030 구간 내 exact 우선)
  "2001": { regionId: "angeles", cityId: "a3" },
  "2002": { regionId: "angeles", cityId: "a4" },
  "2003": { regionId: "angeles", cityId: "a5" },
  "2004": { regionId: "angeles", cityId: "a6" },
  "2005": { regionId: "angeles", cityId: "a7" },
  "2006": { regionId: "angeles", cityId: "a8" },
  "2007": { regionId: "angeles", cityId: "a9" },
  "2008": { regionId: "angeles", cityId: "a10" },
  "2011": { regionId: "angeles", cityId: "a11" },
  "2012": { regionId: "angeles", cityId: "a12" },
  "2013": { regionId: "angeles", cityId: "a13" },
  "2014": { regionId: "angeles", cityId: "a14" },
  "2015": { regionId: "angeles", cityId: "a15" },
  "2016": { regionId: "angeles", cityId: "a16" },
  "2017": { regionId: "angeles", cityId: "a17" },
  "2018": { regionId: "angeles", cityId: "a18" },
  "2019": { regionId: "angeles", cityId: "a19" },
  "2020": { regionId: "angeles", cityId: "a20" },
  "2021": { regionId: "angeles", cityId: "a21" },
  "2022": { regionId: "angeles", cityId: "a22" },
  "2023": { regionId: "angeles", cityId: "a23" },
  "2024": { regionId: "angeles", cityId: "a24" },
  "2025": { regionId: "angeles", cityId: "a25" },
  "2026": { regionId: "angeles", cityId: "a26" },
  "2027": { regionId: "angeles", cityId: "a27" },
  "2028": { regionId: "angeles", cityId: "a28" },
};
