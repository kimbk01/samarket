/**
 * Philippines Information Source Catalog.
 * CATALOG presence ≠ collect capability. Only `available` sections may register/collect.
 */

export type TopicGroupId =
  | "life"
  | "news"
  | "travel"
  | "region"
  | "history"
  | "culture"
  | "language"
  | "visa"
  | "government"
  | "economy"
  | "expat";

export type SourceCapability = "available" | "needs_check" | "disabled";
export type SourceType = "OFFICIAL" | "COMMUNITY" | "MEDIA";

export type CatalogSection = {
  sectionId: string;
  sectionName: string;
  sectionUrl: string | null;
  status: SourceCapability;
  adapterId: string | null;
};

export type CatalogSource = {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  topicGroups: readonly TopicGroupId[];
  sections: readonly CatalogSection[];
};

export const TOPIC_GROUP_LABELS: Record<TopicGroupId | "all", string> = {
  all: "전체",
  life: "생활정보",
  news: "뉴스",
  travel: "여행",
  region: "지역정보",
  history: "역사",
  culture: "문화",
  language: "언어",
  visa: "비자/이민",
  government: "정부/공공정보",
  economy: "경제/통계",
  expat: "교민정보",
};

export const TOPIC_GROUP_ORDER: readonly (TopicGroupId | "all")[] = [
  "all",
  "life",
  "news",
  "travel",
  "region",
  "history",
  "culture",
  "language",
  "visa",
  "government",
  "economy",
  "expat",
];

const DOT = "https://www.tourism.gov.ph";

/** Destination units shown in catalog; only Central Visayas is collectable in this pass. */
const DOT_DESTINATION_SECTIONS: readonly CatalogSection[] = [
  {
    sectionId: "dot-central-visayas",
    sectionName: "Central Visayas",
    sectionUrl: `${DOT}/destination/central-visayas/`,
    status: "available",
    adapterId: "dot-tourism-destination",
  },
  {
    sectionId: "dot-cebu-province",
    sectionName: "Cebu",
    sectionUrl: `${DOT}/destination/central-visayas/cebu-province/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-bohol",
    sectionName: "Bohol",
    sectionUrl: `${DOT}/destination/central-visayas/bohol/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-palawan",
    sectionName: "Palawan",
    sectionUrl: `${DOT}/destination/mimaropa/palawan/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-coron",
    sectionName: "Coron",
    sectionUrl: `${DOT}/destination/mimaropa/coron/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-el-nido",
    sectionName: "El Nido",
    sectionUrl: `${DOT}/destination/mimaropa/el-nido/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-boracay",
    sectionName: "Boracay",
    sectionUrl: `${DOT}/destination/western-visayas/boracay/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-siargao",
    sectionName: "Siargao",
    sectionUrl: `${DOT}/destination/caraga/siargao-island/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-manila",
    sectionName: "Manila",
    sectionUrl: `${DOT}/destination/national-capital-region/manila/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-quezon-city",
    sectionName: "Quezon City",
    sectionUrl: `${DOT}/destination/national-capital-region/quezon-city/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-baguio",
    sectionName: "Baguio",
    sectionUrl: `${DOT}/destination/cordillera-administrative-region/baguio-city/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-vigan",
    sectionName: "Vigan",
    sectionUrl: `${DOT}/destination/ilocos-region/vigan/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-davao",
    sectionName: "Davao",
    sectionUrl: `${DOT}/destination/davao-region/davao-city/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-iloilo",
    sectionName: "Iloilo",
    sectionUrl: `${DOT}/destination/western-visayas/iloilo-province/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-bacolod",
    sectionName: "Bacolod",
    sectionUrl: `${DOT}/destination/nir/bacolod-city/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-dumaguete",
    sectionName: "Dumaguete",
    sectionUrl: `${DOT}/destination/nir/city-of-dumaguete/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-la-union",
    sectionName: "La Union",
    sectionUrl: `${DOT}/destination/ilocos-region/la-union/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-pampanga",
    sectionName: "Pampanga",
    sectionUrl: `${DOT}/destination/central-luzon/pampanga/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-tagaytay",
    sectionName: "Tagaytay",
    sectionUrl: `${DOT}/destination/calabarzon/city-of-tagaytay/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-zamboanga",
    sectionName: "Zamboanga",
    sectionUrl: `${DOT}/destination/zamboanga-peninsula/zamboanga-city/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-batanes",
    sectionName: "Batanes",
    sectionUrl: `${DOT}/destination/cagayan-valley/batanes/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-region-ncr",
    sectionName: "Region · NCR",
    sectionUrl: `${DOT}/destination/national-capital-region/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-region-mimaropa",
    sectionName: "Region · MIMAROPA",
    sectionUrl: `${DOT}/destination/mimaropa/`,
    status: "needs_check",
    adapterId: null,
  },
  {
    sectionId: "dot-region-western-visayas",
    sectionName: "Region · Western Visayas",
    sectionUrl: `${DOT}/destination/western-visayas/`,
    status: "needs_check",
    adapterId: null,
  },
];

export const PHILIPPINES_SOURCE_CATALOG: readonly CatalogSource[] = [
  {
    sourceId: "dot",
    sourceName: "Department of Tourism",
    sourceType: "OFFICIAL",
    topicGroups: ["travel", "region", "culture", "history"],
    sections: DOT_DESTINATION_SECTIONS,
  },
  {
    sourceId: "pia",
    sourceName: "Philippine Information Agency",
    sourceType: "OFFICIAL",
    topicGroups: ["news", "government", "region", "life"],
    sections: [
      {
        sectionId: "pia-national",
        sectionName: "전국 공공 정보",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
      {
        sectionId: "pia-luzon",
        sectionName: "Luzon",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
      {
        sectionId: "pia-visayas",
        sectionName: "Visayas",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
      {
        sectionId: "pia-mindanao",
        sectionName: "Mindanao",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "bi",
    sourceName: "Bureau of Immigration",
    sourceType: "OFFICIAL",
    topicGroups: ["visa", "government"],
    sections: [
      {
        sectionId: "bi-advisory",
        sectionName: "비자·체류·공지",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "psa",
    sourceName: "Philippine Statistics Authority",
    sourceType: "OFFICIAL",
    topicGroups: ["economy", "government"],
    sections: [
      {
        sectionId: "psa-releases",
        sectionName: "보도·발표 (release 단위)",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "ncca",
    sourceName: "National Commission for Culture and the Arts",
    sourceType: "OFFICIAL",
    topicGroups: ["history", "culture"],
    sections: [
      {
        sectionId: "ncca-national-history",
        sectionName: "국가 역사",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
      {
        sectionId: "ncca-heritage",
        sectionName: "문화유산",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
      {
        sectionId: "ncca-regional-history",
        sectionName: "지역 역사",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "kwf",
    sourceName: "Komisyon sa Wikang Filipino",
    sourceType: "OFFICIAL",
    topicGroups: ["language", "culture"],
    sections: [
      {
        sectionId: "kwf-articles",
        sectionName: "언어·생활 회화 정보",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "manilaseoul",
    sourceName: "마닐라서울",
    sourceType: "COMMUNITY",
    topicGroups: ["expat", "life"],
    sections: [
      {
        sectionId: "ms-reader",
        sectionName: "독자투고",
        sectionUrl: "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader",
        status: "needs_check",
        adapterId: "manilaseoul-static-bbs",
      },
      {
        sectionId: "ms-monthly",
        sectionName: "PDF월간발행",
        sectionUrl: "http://manilaseoul.co.kr/bbs_list.php?tb=board_monthly",
        status: "needs_check",
        adapterId: "manilaseoul-static-bbs",
      },
      // board_free: adapter may still parse it, but Owner catalog MUST NOT expose it
      // (ADAPTER CAPABILITY ≠ PRODUCT CATALOG ELIGIBILITY).
      {
        sectionId: "ms-wishlist",
        sectionName: "핫토픽·정치·경제·생활/문화·여행·비자·교육",
        sectionUrl: null,
        status: "needs_check",
        adapterId: null,
      },
    ],
  },
  {
    sourceId: "pinoy-forum",
    sourceName: "Pinoy Forum",
    sourceType: "COMMUNITY",
    topicGroups: ["expat", "life"],
    sections: [
      {
        sectionId: "pinoy-host",
        sectionName: "게시판 (호스트 확인)",
        sectionUrl: "https://pinoy.forum/",
        status: "needs_check",
        adapterId: "pinoy-forum-flarum",
      },
    ],
  },
  {
    sourceId: "philsamo",
    sourceName: "Philsamo",
    sourceType: "COMMUNITY",
    topicGroups: ["expat", "life"],
    sections: [
      {
        sectionId: "philsamo-host",
        sectionName: "게시판 (호스트 확인)",
        sectionUrl: null,
        status: "needs_check",
        adapterId: "philsamo-gnuboard",
      },
    ],
  },
  {
    sourceId: "hello-cebu",
    sourceName: "Hello Cebu",
    sourceType: "COMMUNITY",
    topicGroups: ["expat", "region", "travel"],
    sections: [
      {
        sectionId: "hello-cebu-posts",
        sectionName: "게시물",
        sectionUrl: "https://hellocebuph.com/",
        status: "available",
        adapterId: "hellocebuph-wordpress",
      },
    ],
  },
  {
    sourceId: "wikivoyage",
    sourceName: "Wikivoyage",
    sourceType: "MEDIA",
    topicGroups: ["travel", "region"],
    sections: [
      {
        sectionId: "wikivoyage-philippines",
        sectionName: "Category:Philippines",
        sectionUrl: "https://en.wikivoyage.org/wiki/Category:Philippines",
        status: "disabled",
        adapterId: null,
      },
    ],
  },
] as const;

/** @deprecated use PHILIPPINES_SOURCE_CATALOG */
export type SourceCatalogCapability = SourceCapability;
export type SourceCatalogEntry = {
  id: string;
  category: string;
  siteName: string;
  sectionLabel: string;
  capability: SourceCapability;
  suggestedUrl: string | null;
  adapterId: string | null;
  note: string;
};

export const EXTERNAL_BOARD_SOURCE_CATALOG: readonly SourceCatalogEntry[] =
  PHILIPPINES_SOURCE_CATALOG.flatMap((src) =>
    src.sections.map((sec) => ({
      id: sec.sectionId,
      category: TOPIC_GROUP_LABELS[src.topicGroups[0] ?? "life"],
      siteName: src.sourceName,
      sectionLabel: sec.sectionName,
      capability: sec.status,
      suggestedUrl: sec.sectionUrl,
      adapterId: sec.adapterId,
      note: "",
    }))
  );

export function catalogCapabilityLabel(c: SourceCapability): string {
  if (c === "available") return "사용 가능";
  if (c === "disabled") return "사용 중지";
  return "확인 필요";
}

export function sourceTypeLabel(t: SourceType): string {
  if (t === "OFFICIAL") return "공식";
  if (t === "COMMUNITY") return "교민·커뮤니티";
  return "미디어";
}

export function filterCatalogByTopicGroup(
  group: TopicGroupId | "all",
  query = ""
): CatalogSource[] {
  const q = query.trim().toLowerCase();
  return PHILIPPINES_SOURCE_CATALOG.filter((src) => {
    if (group !== "all" && !src.topicGroups.includes(group)) return false;
    if (!q) return true;
    const hay = `${src.sourceName} ${src.sections.map((s) => s.sectionName).join(" ")}`.toLowerCase();
    return hay.includes(q);
  }).map((src) => ({ ...src, sections: [...src.sections] }));
}

export function findCatalogSection(sectionId: string): {
  source: CatalogSource;
  section: CatalogSection;
} | null {
  for (const source of PHILIPPINES_SOURCE_CATALOG) {
    const section = source.sections.find((s) => s.sectionId === sectionId);
    if (section) return { source, section };
  }
  return null;
}
