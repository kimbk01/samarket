export type TestCrawlPreviewItem = {
  ok: true;
  title: string;
  contentPreview: string;
  contentMarkdown: string;
  representativeImageUrl: string | null;
  bodyImageUrls: string[];
  bodyImageCount: number;
  /** DIBAY display author after board author policy (import-time). */
  authorDisplayName: string;
  /** Raw source author text when extracted (metadata only — not user-facing DIBAY author). */
  sourceAuthorRaw?: string | null;
  authorNote?: string;
  displayDateIso: string | null;
  sourcePublishedAt: string | null;
  viewCount: number | null;
  sourceUrl: string;
  sourcePostId: string | null;
  dibayTopicId: string;
  dibayTopicName: string | null;
  imageMode: "PREVIEW_EXTERNAL_IMAGE_ONLY";
  warnings: string[];
};

export type TestCrawlPreviewFailure = {
  ok: false;
  sourceUrl: string | null;
  errorCode: string;
  errorMessage: string;
};

export type TestCrawlResultStatus = "SUCCESS" | "PARTIAL" | "FAILED";

export type TestCrawlResult = {
  status: TestCrawlResultStatus;
  runId: string | null;
  boardId: string;
  sourceId: string;
  listUrl: string;
  policyStatus: string;
  policyNote: string;
  fetchedCount: number;
  successCount: number;
  failedCount: number;
  skippedInvalidCount: number;
  insertedCount: 0;
  updatedCount: 0;
  postLinkWriteCount: 0;
  mediaWriteCount: 0;
  previews: TestCrawlPreviewItem[];
  failures: TestCrawlPreviewFailure[];
  errorCode: string | null;
  errorMessage: string | null;
};
