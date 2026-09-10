/**
 * @deprecated Prefer adapters/travel-philippines for extract helpers.
 * Path string constants only — never import cheerio/dns into client bundles.
 */

export const TRAVEL_PH_NEXT_DATA_COVER_PATH =
  "props.pageProps.data.article.coverImage.url" as const;
export const TRAVEL_PH_NEXT_DATA_TITLE_PATH = "props.pageProps.data.article.title" as const;
