export type GenericHtmlAdapterConfig = {
  listItemSelector?: string;
  detailLinkSelector?: string;
  titleSelector?: string;
  contentSelector?: string;
  authorSelector?: string;
  dateSelector?: string;
  viewSelector?: string;
  imageSelector?: string;
  representativeImageSelector?: string;
  sourcePostIdSelector?: string;
  sourcePostIdAttr?: string;
  nextPageSelector?: string;
};

export function parseGenericHtmlAdapterConfig(raw: Record<string, unknown> | null | undefined): {
  ok: true;
  config: GenericHtmlAdapterConfig;
} | {
  ok: false;
  error: string;
} {
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (k: string): string | undefined => {
    const v = r[k];
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t || undefined;
  };
  const detailLinkSelector = str("detailLinkSelector") ?? str("detail_link_selector");
  const titleSelector = str("titleSelector") ?? str("title_selector");
  const contentSelector = str("contentSelector") ?? str("content_selector");
  // Selectors are optional now for generic semantic extraction!
  return {
    ok: true,
    config: {
      listItemSelector: str("listItemSelector") ?? str("list_item_selector"),
      detailLinkSelector,
      titleSelector,
      contentSelector,
      authorSelector: str("authorSelector") ?? str("author_selector"),
      dateSelector: str("dateSelector") ?? str("date_selector"),
      viewSelector: str("viewSelector") ?? str("view_selector"),
      imageSelector: str("imageSelector") ?? str("image_selector"),
      representativeImageSelector:
        str("representativeImageSelector") ?? str("representative_image_selector"),
      sourcePostIdSelector: str("sourcePostIdSelector") ?? str("source_post_id_selector"),
      sourcePostIdAttr: str("sourcePostIdAttr") ?? str("source_post_id_attr") ?? "href",
      nextPageSelector: str("nextPageSelector") ?? str("next_page_selector"),
    },
  };
}

export function emptyGenericHtmlAdapterConfigFields(): Record<keyof GenericHtmlAdapterConfig, string> {
  return {
    listItemSelector: "",
    detailLinkSelector: "",
    titleSelector: "",
    contentSelector: "",
    authorSelector: "",
    dateSelector: "",
    viewSelector: "",
    imageSelector: "",
    representativeImageSelector: "",
    sourcePostIdSelector: "",
    sourcePostIdAttr: "href",
    nextPageSelector: "",
  };
}
