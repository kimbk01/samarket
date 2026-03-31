/** GET /api/posts/[id]/owner-edit `post` 와 동일 — 클라이언트 폼 시드용 */
export type OwnerEditPostSnapshot = {
  id: string;
  trade_category_id: string;
  title: string;
  content: string;
  price: number | null;
  region: string;
  city: string;
  barangay: string;
  images: string[];
  meta: Record<string, unknown> | null;
  is_free_share: boolean;
  is_price_offer: boolean;
};
