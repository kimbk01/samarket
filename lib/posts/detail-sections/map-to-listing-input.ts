import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryLite, ListingDetailInput } from "./types";
import { resolveServiceSegment } from "./resolve-service-segment";

export function toListingDetailInput(post: PostWithMeta, category: CategoryLite | null): ListingDetailInput {
  return {
    post,
    category,
    segment: resolveServiceSegment(post, category),
  };
}
