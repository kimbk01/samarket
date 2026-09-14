import type { ExternalBoardDef, SiteAdapter } from "../types";

const SITE_KEY = "philgo";
const BASE = "https://philgo.com";

export const philgoBoards: ExternalBoardDef[] = [
  {
    siteKey: SITE_KEY,
    boardKey: "home",
    name: "Philgo home",
    listUrl: `${BASE}/`,
    topicHint: "information",
    capabilities: {
      supportsRecent: false,
      supportsPageRange: false,
      supportsDateRange: false,
    },
  },
];

/** BLOCKED — Playwright 403. Do not register as usable board in product seed. */
export const philgoAdapter: SiteAdapter = {
  site: {
    countryCode: "PH",
    siteKey: SITE_KEY,
    name: "필고",
    baseUrl: BASE,
    engine: "playwright",
    adapterKey: "philgo",
  },

  listBoards() {
    return philgoBoards;
  },

  fetchArticleList() {
    return [];
  },

  fetchArticleDetail({ article }) {
    return {
      externalArticleKey: article.externalArticleKey,
      canonicalUrl: article.canonicalUrl,
      title: article.title,
      author: null,
      sourcePublishedAt: null,
      bodyHtml: "",
      bodyText: "",
      thumbnailUrl: null,
      bodyImageUrls: [],
      galleryImageUrls: [],
      nodes: [],
      mediaMeta: {
        thumbnailAuthority: "blocked",
        bodyImageSelector: "blocked",
        gallerySelector: "blocked",
        decorativeExclusions: [],
      },
    };
  },
};
