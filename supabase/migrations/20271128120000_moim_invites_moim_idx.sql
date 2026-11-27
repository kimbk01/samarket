-- 모임 3번 묶음 E9 (2026-11-27 모임 전체 감사 E11) — 초대 링크 목록은 moim_id 로 읽는데 인덱스가 없었다(pkey·token 만).
-- 설계: docs/audit/moim-bundle3-design-2026-11-28.md (Owner 「구현 승인」 2026-11-28). 롤백: drop index public.moim_invites_moim_idx;
create index if not exists moim_invites_moim_idx on public.moim_invites (moim_id, created_at desc);
