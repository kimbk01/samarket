-- Synthetic schema with the reference shapes found in the DIBAY audit (local test only).
CREATE TABLE public.categories (id int PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname text,
  manual_account_type text,
  avatar_url text
);
CREATE TABLE public.admin_memberships (id serial PRIMARY KEY, user_id uuid NOT NULL, status text NOT NULL);
CREATE TABLE public.test_users (id uuid PRIMARY KEY, username text, display_name text, password text);
CREATE TABLE public.users (id uuid PRIMARY KEY, nickname text);
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  category_id int REFERENCES public.categories (id),
  title text,
  image_url text,
  updated_by_admin_id uuid
);
CREATE TABLE public.post_images (
  id bigserial PRIMARY KEY,
  post_id uuid NOT NULL,                 -- soft reference to posts (no FK)
  storage_path text
);
CREATE TABLE public.comments (
  id bigserial PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  parent_id bigint REFERENCES public.comments (id) ON DELETE CASCADE,
  body text
);
CREATE TABLE public.favorites (
  user_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE public.reports (id bigserial PRIMARY KEY, reporter_id uuid, target_id uuid, reason text);
CREATE TABLE public.sanctions (id bigserial PRIMARY KEY, user_id uuid, created_by uuid, note text);
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.profiles (id),            -- NO ACTION
  seller_id uuid REFERENCES public.profiles (id),
  amount numeric NOT NULL
);
CREATE TABLE public.order_items (
  id bigserial PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts (id) ON DELETE SET NULL,
  qty int
);
CREATE TABLE public.point_ledger (id bigserial PRIMARY KEY, user_id uuid, delta int);
CREATE TABLE public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  seller_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts (id) ON DELETE CASCADE
);
CREATE TABLE public.chat_messages (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.chat_rooms (id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles (id) ON DELETE CASCADE,
  body text,
  attachment jsonb
);
CREATE TABLE public.stores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid REFERENCES public.profiles (id), name text);
CREATE TABLE public.store_products (
  id bigserial PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  category_id int REFERENCES public.categories (id),
  name text,
  image_url text
);
CREATE TABLE public.store_fee_policies (id bigserial PRIMARY KEY, store_id uuid REFERENCES public.stores (id) ON DELETE CASCADE, fee int);
CREATE TABLE public.audit_logs (id bigserial PRIMARY KEY, user_id uuid, admin_id uuid, action text);
CREATE TABLE public.backfill_nopk (a uuid, b text);
CREATE TABLE public.browse_snapshots (id bigserial PRIMARY KEY, payload jsonb);
CREATE TABLE public.settings (key text PRIMARY KEY, value text);
CREATE TABLE public.favorite_audit_log (id bigserial PRIMARY KEY, user_id text, post_id text);
CREATE TABLE public.unresolved_things (id bigserial PRIMARY KEY, user_id uuid);
CREATE TABLE public.ad_impressions (id bigserial PRIMARY KEY, store_id uuid);  -- owner-less, soft ref to stores
CREATE TABLE public.lookup_children (id bigserial PRIMARY KEY, category_id int REFERENCES public.categories (id)); -- only lookup parent
