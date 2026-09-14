/**
 * Philippines Information Source Catalog — canonical SSOT.
 * Catalog presence ≠ collect capability.
 * operationStatus is DERIVED from capabilities + adapterId + canonicalUrl + disabledOverride.
 * AVAILABLE COUNT must stay 0 until CUT B+ fidelity proofs close the matrix.
 */

import {
  catalogCapabilityLabel,
  deriveOperationStatus,
  unprovenCapabilities,
  type OperationStatus,
  type SectionCapabilities,
} from "@/lib/external-board-import/catalog/capabilities";
import { normalizeExternalBoardUrl } from "@/lib/external-board-import/identity/source-board-identity";

export type TopicGroupId =
  | "life"
  | "news"
  | "travel"
  | "golf"
  | "region"
  | "history"
  | "culture"
  | "language"
  | "visa"
  | "government"
  | "economy"
  | "expat";

export type SourceCapability = OperationStatus;
export type SourceType = "OFFICIAL" | "COMMUNITY" | "MEDIA";
export type CatalogImportKind = "article" | "language_resource" | "reference";
export type CatalogDefaultLanguage = "en" | "fil" | "tl" | "ceb" | "ko" | "other";
export type CatalogAuthMode = "public" | "login_required" | "session_required";

export type CatalogSectionView = {
  sectionId: string;
  sourceId: string;
  sectionName: string;
  /** @deprecated prefer canonicalUrl */
  sectionUrl: string | null;
  canonicalUrl: string | null;
  status: OperationStatus;
  adapterId: string | null;
  category: TopicGroupId;
  defaultLanguage: CatalogDefaultLanguage;
  recommendedTopicHint: string | null;
  importKind: CatalogImportKind;
  authMode: CatalogAuthMode;
  capabilities: SectionCapabilities;
  disabledOverride: boolean;
};

export type CatalogSection = CatalogSectionView;

export type CatalogSource = {
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  topicGroups: readonly TopicGroupId[];
  sections: readonly CatalogSectionView[];
};

type SectionDef = {
  sectionId: string;
  sectionName: string;
  canonicalUrl: string | null;
  adapterId: string | null;
  category: TopicGroupId;
  defaultLanguage?: CatalogDefaultLanguage;
  recommendedTopicHint?: string | null;
  importKind?: CatalogImportKind;
  authMode?: CatalogAuthMode;
  capabilities?: SectionCapabilities;
  disabledOverride?: boolean;
};

export const TOPIC_GROUP_LABELS: Record<TopicGroupId | "all", string> = {
  all: "전체",
  life: "생활정보",
  news: "뉴스",
  travel: "여행",
  golf: "골프",
  region: "지역정보",
  history: "역사",
  culture: "문화",
  language: "필리핀 언어",
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
  "golf",
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
const NHCP = "https://nhcp.gov.ph";
const TALAPAMANA = "https://www.talapamana.ncca.gov.ph";
const PIA = "https://pia.gov.ph";
const BI = "https://immigration.gov.ph";
const PSA = "https://psa.gov.ph";
const BSP = "https://www.bsp.gov.ph";

function buildSection(sourceId: string, def: SectionDef): CatalogSectionView {
  const capabilities = def.capabilities ?? unprovenCapabilities();
  const disabledOverride = Boolean(def.disabledOverride);
  const canonicalUrl = def.canonicalUrl;
  const adapterId = def.adapterId;
  const status = deriveOperationStatus({
    capabilities,
    adapterId,
    canonicalUrl,
    disabledOverride,
  });
  return {
    sectionId: def.sectionId,
    sourceId,
    sectionName: def.sectionName,
    sectionUrl: canonicalUrl,
    canonicalUrl,
    status,
    adapterId,
    category: def.category,
    defaultLanguage: def.defaultLanguage ?? "en",
    recommendedTopicHint: def.recommendedTopicHint ?? null,
    importKind: def.importKind ?? "article",
    authMode: def.authMode ?? "public",
    capabilities,
    disabledOverride,
  };
}

function buildSource(
  sourceId: string,
  sourceName: string,
  sourceType: SourceType,
  topicGroups: readonly TopicGroupId[],
  sectionDefs: readonly SectionDef[]
): CatalogSource {
  return {
    sourceId,
    sourceName,
    sourceType,
    topicGroups,
    sections: sectionDefs.map((d) => buildSection(sourceId, d)),
  };
}

/** Destination units — image fidelity open → all needs_check. */
const DOT_DESTINATION_DEFS: readonly SectionDef[] = [
  {
    sectionId: "dot-central-visayas",
    sectionName: "Central Visayas",
    canonicalUrl: `${DOT}/destination/central-visayas/`,
    adapterId: "dot-tourism-destination",
    category: "travel",
    recommendedTopicHint: "travel",
    capabilities: unprovenCapabilities({
      list: "proven",
      detail: "proven",
      title: "proven",
      author: "proven",
      date: "proven",
      body: "proven",
      thumb: "proven",
      // Proven: HTML .content-gallery-main__gallery (Mandaue 2 images live).
      bodyImage: "proven",
      gallery: "proven",
      pagination: "proven",
      language: "proven",
      publish: "proven",
    }),
  },
  {
    sectionId: "dot-golfing",
    sectionName: "Golfing",
    canonicalUrl: `${DOT}/golfing/`,
    adapterId: null,
    category: "golf",
    importKind: "reference",
    recommendedTopicHint: "travel",
  },
  {
    sectionId: "dot-cebu-province",
    sectionName: "Cebu",
    canonicalUrl: `${DOT}/destination/central-visayas/cebu-province/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-bohol",
    sectionName: "Bohol",
    canonicalUrl: `${DOT}/destination/central-visayas/bohol/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-palawan",
    sectionName: "Palawan",
    canonicalUrl: `${DOT}/destination/mimaropa/palawan/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-coron",
    sectionName: "Coron",
    canonicalUrl: `${DOT}/destination/mimaropa/coron/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-el-nido",
    sectionName: "El Nido",
    canonicalUrl: `${DOT}/destination/mimaropa/el-nido/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-boracay",
    sectionName: "Boracay",
    canonicalUrl: `${DOT}/destination/western-visayas/boracay/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-siargao",
    sectionName: "Siargao",
    canonicalUrl: `${DOT}/destination/caraga/siargao-island/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-manila",
    sectionName: "Manila",
    canonicalUrl: `${DOT}/destination/national-capital-region/manila/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-quezon-city",
    sectionName: "Quezon City",
    canonicalUrl: `${DOT}/destination/national-capital-region/quezon-city/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-baguio",
    sectionName: "Baguio",
    canonicalUrl: `${DOT}/destination/cordillera-administrative-region/baguio-city/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-vigan",
    sectionName: "Vigan",
    canonicalUrl: `${DOT}/destination/ilocos-region/vigan/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-davao",
    sectionName: "Davao",
    canonicalUrl: `${DOT}/destination/davao-region/davao-city/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-iloilo",
    sectionName: "Iloilo",
    canonicalUrl: `${DOT}/destination/western-visayas/iloilo-province/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-bacolod",
    sectionName: "Bacolod",
    canonicalUrl: `${DOT}/destination/nir/bacolod-city/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-dumaguete",
    sectionName: "Dumaguete",
    canonicalUrl: `${DOT}/destination/nir/city-of-dumaguete/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-la-union",
    sectionName: "La Union",
    canonicalUrl: `${DOT}/destination/ilocos-region/la-union/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-pampanga",
    sectionName: "Pampanga",
    canonicalUrl: `${DOT}/destination/central-luzon/pampanga/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-tagaytay",
    sectionName: "Tagaytay",
    canonicalUrl: `${DOT}/destination/calabarzon/city-of-tagaytay/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-zamboanga",
    sectionName: "Zamboanga",
    canonicalUrl: `${DOT}/destination/zamboanga-peninsula/zamboanga-city/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-batanes",
    sectionName: "Batanes",
    canonicalUrl: `${DOT}/destination/cagayan-valley/batanes/`,
    adapterId: null,
    category: "travel",
  },
  {
    sectionId: "dot-region-ncr",
    sectionName: "Region · NCR",
    canonicalUrl: `${DOT}/destination/national-capital-region/`,
    adapterId: null,
    category: "region",
  },
  {
    sectionId: "dot-region-mimaropa",
    sectionName: "Region · MIMAROPA",
    canonicalUrl: `${DOT}/destination/mimaropa/`,
    adapterId: null,
    category: "region",
  },
  {
    sectionId: "dot-region-western-visayas",
    sectionName: "Region · Western Visayas",
    canonicalUrl: `${DOT}/destination/western-visayas/`,
    adapterId: null,
    category: "region",
  },
];

export const PHILIPPINES_SOURCE_CATALOG: readonly CatalogSource[] = [
  buildSource("dot", "Department of Tourism", "OFFICIAL", ["travel", "region", "golf", "culture"], DOT_DESTINATION_DEFS),
  buildSource("pia", "Philippine Information Agency", "OFFICIAL", ["news", "government", "region", "life", "golf", "language"], [
    {
      sectionId: "pia-regional-news",
      sectionName: "Regional News",
      canonicalUrl: `${PIA}/`,
      adapterId: null,
      category: "news",
      recommendedTopicHint: "news",
    },
    {
      sectionId: "pia-luzon",
      sectionName: "Luzon",
      canonicalUrl: null,
      adapterId: null,
      category: "region",
    },
    {
      sectionId: "pia-visayas",
      sectionName: "Visayas",
      canonicalUrl: null,
      adapterId: null,
      category: "region",
    },
    {
      sectionId: "pia-mindanao",
      sectionName: "Mindanao",
      canonicalUrl: null,
      adapterId: null,
      category: "region",
    },
    {
      sectionId: "pia-ncr",
      sectionName: "NCR",
      canonicalUrl: null,
      adapterId: null,
      category: "region",
    },
    {
      // Runner CF 403 — taxonomy only until official reachable endpoint proven.
      sectionId: "pia-golf-tourism",
      sectionName: "Golf tourism articles",
      canonicalUrl: null,
      adapterId: null,
      category: "golf",
      recommendedTopicHint: "golf",
    },
    {
      sectionId: "pia-kwf-language-articles",
      sectionName: "KWF / Filipino language articles",
      canonicalUrl: null,
      adapterId: null,
      category: "language",
      importKind: "article",
      recommendedTopicHint: "language",
    },
  ]),
  buildSource(
    "pna",
    "Philippine News Agency",
    "OFFICIAL",
    ["news", "golf", "government"],
    [
      {
        // Public articles exist (e.g. /articles/1214497) but runner CF 403 — no bypass.
        // No proven golf category/tag/archive list authority yet → no adapter.
        sectionId: "pna-golf-tourism",
        sectionName: "Golf tourism articles",
        canonicalUrl: null,
        adapterId: null,
        category: "golf",
        recommendedTopicHint: "golf",
      },
    ]
  ),
  buildSource("nhcp", "NHCP National Memory Project", "OFFICIAL", ["history", "culture"], [
    {
      sectionId: "nhcp-featured-articles",
      sectionName: "Featured Articles",
      canonicalUrl: `${NHCP}/national-memory-project/`,
      adapterId: null,
      category: "history",
      importKind: "article",
      recommendedTopicHint: "history",
      // Runner Cloudflare 403 — structure exists publicly; rights vary per item.
    },
    {
      sectionId: "nhcp-philippine-history",
      sectionName: "Philippine History",
      canonicalUrl: `${NHCP}/national-memory-project/`,
      adapterId: null,
      category: "history",
      importKind: "article",
    },
    {
      sectionId: "nhcp-local-history-articles",
      sectionName: "Local History (articles)",
      canonicalUrl: `${NHCP}/national-memory-project/`,
      adapterId: null,
      category: "history",
      importKind: "article",
    },
    {
      sectionId: "nhcp-local-history-index",
      sectionName: "Local History Index (bibliographic)",
      canonicalUrl: `${NHCP}/national-memory-project/`,
      adapterId: null,
      category: "history",
      // 61+ pages of bibliographic/reference metadata — NOT full article body.
      importKind: "reference",
    },
  ]),
  buildSource("ncca", "NCCA Talapamana", "OFFICIAL", ["culture", "history"], [
    {
      sectionId: "ncca-talapamana-articles",
      sectionName: "Articles",
      canonicalUrl: `${TALAPAMANA}/index.php/announcements/articles`,
      adapterId: "ncca-talapamana-articles",
      category: "culture",
      recommendedTopicHint: "culture",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
    {
      sectionId: "ncca-heritage-updates",
      sectionName: "Philippine Registry of Heritage Updates",
      canonicalUrl: `${TALAPAMANA}/index.php/announcements/articles`,
      adapterId: "ncca-talapamana-articles",
      category: "culture",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
    {
      sectionId: "ncca-cultural-property-db",
      sectionName: "Cultural Property Database",
      canonicalUrl: `${TALAPAMANA}/index.php/talapamana/cultural-property-database/talapamana`,
      adapterId: null,
      category: "culture",
      importKind: "reference",
    },
  ]),
  buildSource("bi", "Bureau of Immigration", "OFFICIAL", ["visa", "government"], [
    {
      sectionId: "bi-advisory",
      sectionName: "Advisory",
      canonicalUrl: `${BI}/category/advisory/`,
      adapterId: "bi-advisory",
      category: "visa",
      recommendedTopicHint: "visa",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
  ]),
  buildSource("psa", "Philippine Statistics Authority", "OFFICIAL", ["economy", "government"], [
    {
      sectionId: "psa-press-releases",
      sectionName: "Press Releases",
      canonicalUrl: `${PSA}/`,
      adapterId: null,
      category: "economy",
      recommendedTopicHint: "economy",
    },
  ]),
  buildSource("bsp", "Bangko Sentral ng Pilipinas", "OFFICIAL", ["economy", "government"], [
    {
      sectionId: "bsp-media-releases",
      sectionName: "Media Releases (HTML)",
      canonicalUrl: `${BSP}/SitePages/MediaAndResearch/MediaList.aspx?TabId=1`,
      adapterId: "bsp-media-releases",
      category: "economy",
      defaultLanguage: "en",
      recommendedTopicHint: "economy",
      importKind: "article",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
    {
      sectionId: "bsp-filipino-press-releases",
      sectionName: "Filipino Press Releases",
      canonicalUrl: `${BSP}/SitePages/MediaAndResearch/MediaList.aspx?TabId=1&lang=fil`,
      adapterId: "bsp-media-releases",
      category: "economy",
      defaultLanguage: "fil",
      recommendedTopicHint: "economy",
      importKind: "article",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
    {
      // PDF-only series on IRO — REFERENCE, not Community article body.
      sectionId: "bsp-philippine-economic-updates",
      sectionName: "Philippine Economic Updates (PDF)",
      canonicalUrl: `${BSP}/Pages/IRO.aspx`,
      adapterId: null,
      category: "economy",
      importKind: "reference",
      recommendedTopicHint: "economy",
    },
  ]),
  buildSource("kwf", "Komisyon sa Wikang Filipino", "OFFICIAL", ["language", "culture"], [
    {
      sectionId: "kwf-language-resources",
      sectionName: "Language Resources (Koha metadata)",
      canonicalUrl: "https://library.kwf.gov.ph/cgi-bin/koha/opac-search.pl?q=filipino+grammar&count=20",
      adapterId: "kwf-language-resource",
      category: "language",
      importKind: "language_resource",
      defaultLanguage: "fil",
      recommendedTopicHint: "language",
      // Adapter present but runner bot-challenge → stays needs_check until live metadata proof.
      capabilities: unprovenCapabilities({
        list: "unproven",
        detail: "unproven",
        title: "unproven",
        author: "unproven",
        date: "unproven",
        body: "unproven",
        thumb: "na",
        bodyImage: "na",
        gallery: "na",
        pagination: "unproven",
        language: "unproven",
        publish: "unproven",
      }),
    },
  ]),
  buildSource("manilaseoul", "마닐라서울", "COMMUNITY", ["expat", "life"], [
    {
      sectionId: "ms-reader",
      sectionName: "독자투고",
      canonicalUrl: "http://manilaseoul.co.kr/bbs_list.php?tb=board_reader",
      adapterId: "manilaseoul-static-bbs",
      category: "expat",
      defaultLanguage: "ko",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "unproven",
        title: "proven",
        author: "unproven",
        date: "unproven",
        body: "unproven",
        thumb: "unproven",
        bodyImage: "unproven",
        pagination: "proven",
        language: "proven",
        publish: "unproven",
      }),
    },
    {
      sectionId: "ms-monthly",
      sectionName: "PDF월간발행",
      canonicalUrl: "http://manilaseoul.co.kr/bbs_list.php?tb=board_monthly",
      adapterId: "manilaseoul-static-bbs",
      category: "expat",
      defaultLanguage: "ko",
      importKind: "reference",
    },
  ]),
  buildSource("pinoy-forum", "Pinoy Forum", "COMMUNITY", ["expat", "life"], [
    {
      sectionId: "pinoy-host",
      sectionName: "게시판 (호스트 확인)",
      canonicalUrl: "https://pinoy.forum/",
      adapterId: "pinoy-forum-flarum",
      category: "expat",
    },
  ]),
  buildSource("philsamo", "Philsamo", "COMMUNITY", ["expat", "life"], [
    {
      sectionId: "philsamo-host",
      sectionName: "게시판 (호스트 확인)",
      canonicalUrl: null,
      adapterId: "philsamo-gnuboard",
      category: "expat",
    },
  ]),
  buildSource("hello-cebu", "Hello Cebu", "COMMUNITY", ["expat", "region", "travel"], [
    {
      sectionId: "hello-cebu-posts",
      sectionName: "게시물",
      canonicalUrl: "https://hellocebuph.com/",
      adapterId: "hellocebuph-wordpress",
      category: "expat",
      defaultLanguage: "en",
      capabilities: unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "proven",
        bodyImage: "proven",
        gallery: "na",
        pagination: "proven",
        language: "proven",
        publish: "proven",
      }),
    },
  ]),
  buildSource("wikivoyage", "Wikivoyage", "MEDIA", ["travel", "region"], [
    {
      sectionId: "wikivoyage-philippines",
      sectionName: "Category:Philippines",
      canonicalUrl: "https://en.wikivoyage.org/wiki/Category:Philippines",
      adapterId: null,
      category: "travel",
      disabledOverride: true,
    },
  ]),
];

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
      category: TOPIC_GROUP_LABELS[sec.category],
      siteName: src.sourceName,
      sectionLabel: sec.sectionName,
      capability: sec.status,
      suggestedUrl: sec.canonicalUrl,
      adapterId: sec.adapterId,
      note: sec.importKind === "language_resource" ? "LANGUAGE_RESOURCE" : "",
    }))
  );

export { catalogCapabilityLabel };

export function sourceTypeLabel(t: SourceType): string {
  if (t === "OFFICIAL") return "공식";
  if (t === "COMMUNITY") return "교민·커뮤니티";
  return "미디어";
}

export function importKindLabel(k: CatalogImportKind): string {
  if (k === "language_resource") return "언어 자료";
  if (k === "reference") return "참고";
  return "기사";
}

export function authModeLabel(m: CatalogAuthMode): string {
  if (m === "login_required") return "로그인 필요";
  if (m === "session_required") return "세션 필요";
  return "공개 소스";
}

export function filterCatalogByTopicGroup(
  group: TopicGroupId | "all",
  query = ""
): CatalogSource[] {
  const q = query.trim().toLowerCase();
  return PHILIPPINES_SOURCE_CATALOG.filter((src) => {
    if (group !== "all" && !src.topicGroups.includes(group) && !src.sections.some((s) => s.category === group)) {
      return false;
    }
    if (!q) return true;
    const hay = `${src.sourceName} ${src.sections.map((s) => s.sectionName).join(" ")}`.toLowerCase();
    return hay.includes(q);
  }).map((src) => ({
    ...src,
    sections:
      group === "all"
        ? [...src.sections]
        : src.sections.filter((s) => s.category === group || src.topicGroups.includes(group)),
  }));
}

export function findCatalogSection(sectionId: string): {
  source: CatalogSource;
  section: CatalogSectionView;
} | null {
  for (const source of PHILIPPINES_SOURCE_CATALOG) {
    const section = source.sections.find((s) => s.sectionId === sectionId);
    if (section) return { source, section };
  }
  return null;
}

export function countAvailableCatalogSections(): number {
  let n = 0;
  for (const src of PHILIPPINES_SOURCE_CATALOG) {
    for (const sec of src.sections) {
      if (sec.status === "available") n += 1;
    }
  }
  return n;
}

/**
 * Resolve catalog sectionId from URL via existing URL canonicalizer.
 * Query params that distinguish sections (e.g. tb=) are preserved by normalize.
 */
export function resolveCatalogSectionIdFromUrl(rawUrl: string): string | null {
  const canonical = normalizeExternalBoardUrl(rawUrl);
  if (!canonical) return null;
  const target = new URL(canonical);
  for (const src of PHILIPPINES_SOURCE_CATALOG) {
    for (const sec of src.sections) {
      if (!sec.canonicalUrl) continue;
      const secCanon = normalizeExternalBoardUrl(sec.canonicalUrl);
      if (!secCanon) continue;
      const u = new URL(secCanon);
      if (u.hostname.replace(/^www\./, "") !== target.hostname.replace(/^www\./, "")) continue;
      if (u.pathname === target.pathname && u.search === target.search) {
        return sec.sectionId;
      }
      // Path prefix match for destination roots when exact section URL is a parent.
      if (!u.search && !target.search && target.pathname === u.pathname) {
        return sec.sectionId;
      }
    }
  }
  return null;
}

/** Test helper — build a fully proven section shape (not in live catalog). */
export function makeDerivedAvailableFixture(overrides?: Partial<SectionDef> & { sourceId?: string }): CatalogSectionView {
  const sourceId = overrides?.sourceId ?? "fixture-source";
  return buildSection(sourceId, {
    sectionId: overrides?.sectionId ?? "fixture-available-section",
    sectionName: overrides?.sectionName ?? "Fixture Available",
    canonicalUrl: overrides?.canonicalUrl ?? "https://fixture.external-board.local/board",
    adapterId: overrides?.adapterId ?? "fixture",
    category: overrides?.category ?? "life",
    defaultLanguage: overrides?.defaultLanguage ?? "en",
    importKind: overrides?.importKind ?? "article",
    capabilities:
      overrides?.capabilities ??
      unprovenCapabilities({
        list: "proven",
        detail: "proven",
        title: "proven",
        author: "proven",
        date: "proven",
        body: "proven",
        thumb: "na",
        bodyImage: "na",
        gallery: "na",
        pagination: "na",
        language: "proven",
        publish: "proven",
      }),
    disabledOverride: overrides?.disabledOverride,
  });
}
