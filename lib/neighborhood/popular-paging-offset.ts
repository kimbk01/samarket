/**
 * Popular feed offset pagination — exclude the hasMore probe row from advance.
 * Window size is pageSize+1; when hasMore, only pageSize rows were consumed for the page.
 */
export function resolvePopularPagingOffsetAdvance(input: {
  hasMore: boolean;
  pageSize: number;
  dbScannedCount: number;
}): number {
  const pageSize = Math.max(1, Math.floor(input.pageSize));
  const scanned = Math.max(0, Math.floor(input.dbScannedCount));
  if (input.hasMore) return pageSize;
  return scanned;
}
