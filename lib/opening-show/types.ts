import type { OpeningDocument } from "@/lib/opening-show/document";

export type OpeningShowListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export type OpeningReadyMedia = {
  id: string;
  showId: string;
  fileName: string;
  mime: string;
  width: number;
  height: number;
  displayUrl: string;
  thumbUrl: string;
};

export type OpeningShowDetail = {
  id: string;
  title: string;
  document: OpeningDocument;
  media: OpeningReadyMedia[];
  updatedAt: string;
};
