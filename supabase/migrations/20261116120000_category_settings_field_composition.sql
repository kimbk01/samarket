-- Trade category Field Composition Admin V1 persistence.
-- Additive only: category_settings.field_composition JSONB NULL.
-- Does NOT alter posts / listing meta. Does NOT invent a new composition table.
--
-- Payload shape (v1):
-- {
--   "v": 1,
--   "fields": [
--     { "id": "<fieldLibraryId>", "active": true, "required": true, "order": 10 }
--   ]
-- }
-- Field ids must exist in Product Field Library. No storagePath / widget / validator in DB.

BEGIN;

ALTER TABLE public.category_settings
  ADD COLUMN IF NOT EXISTS field_composition jsonb NULL;

COMMENT ON COLUMN public.category_settings.field_composition IS
  'Trade category Field Composition overlay (Admin V1). Approved Field Library ids only: {v, fields:[{id,active,required,order}]}. NULL => Product seed composition.';

COMMIT;
