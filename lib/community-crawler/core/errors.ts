export const COMMUNITY_CRAWL_ERROR_CODES = [
  "FETCH_BLOCKED",
  "FETCH_TIMEOUT",
  "HTTP_ERROR",
  "CONTENT_TYPE_INVALID",
  "LIST_SELECTOR_EMPTY",
  "DETAIL_LINK_INVALID",
  "DETAIL_FETCH_FAILED",
  "TITLE_MISSING",
  "CONTENT_MISSING",
  "SOURCE_INVALID",
  "DATE_PARSE_FAILED",
  "VIEW_PARSE_FAILED",
  "ADAPTER_UNSUPPORTED",
  "SELECTOR_CONFIG_INVALID",
  "REDIRECT_BLOCKED",
  "RESPONSE_TOO_LARGE",
] as const;

export type CommunityCrawlErrorCode = (typeof COMMUNITY_CRAWL_ERROR_CODES)[number];

export class CommunityCrawlError extends Error {
  readonly code: CommunityCrawlErrorCode;
  readonly soft: boolean;

  constructor(code: CommunityCrawlErrorCode, message: string, opts?: { soft?: boolean }) {
    super(message);
    this.name = "CommunityCrawlError";
    this.code = code;
    this.soft = opts?.soft === true;
  }
}
