/**
 * SOURCE BOARD vs DIBAY TARGET — never conflate.
 */

export type SourceBoardRef = {
  siteName: string;
  sourceBoardName: string;
  sourceUrl: string;
};

export type DibayTargetRef = {
  /** community topic / category id */
  targetTopicId: string;
  targetLabel: string;
};

export type SourceToTargetMapping = {
  source: SourceBoardRef;
  target: DibayTargetRef;
};

/** Changing SOURCE must never auto-rename TARGET. */
export function assertSourceTargetSeparated(mapping: SourceToTargetMapping): void {
  if (!mapping.source.sourceUrl.trim()) {
    throw new Error("SOURCE URL is required");
  }
  if (!mapping.target.targetTopicId.trim()) {
    throw new Error("DIBAY TARGET must be selected by Admin");
  }
}
