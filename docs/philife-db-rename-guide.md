# 필라이프 DB 전환 가이드

이 문서는 현재 코드에서 사용자 노출 이름은 `필라이프`로 바꾸되, 내부 DB 식별자(`community_*`, `dongnae`)는 아직 유지하고 있는 상태에서 다음 단계 전환을 준비하기 위한 가이드입니다.

## 현재 상태

- 사용자 경로: `/philife`, `/chats/philife`, `/admin/philife`
- 내부 DB 식별자: `community_posts`, `community_comments`, `community_reports`, `community_sections`, `community_topics`
- 주요 slug: `dongnae`

## 권장 전략

한 번에 물리 테이블명을 바꾸지 말고 3단계로 진행합니다.

1. 호환 계층 추가
2. 애플리케이션 코드 전환
3. 물리 테이블/정책/함수 최종 정리

## 1단계: 호환 계층 추가

가장 안전한 방법은 기존 테이블을 유지하면서 새 이름의 뷰 또는 별칭 함수를 추가하는 것입니다.

예시:

```sql
create or replace view public.philife_posts as
select * from public.community_posts;

create or replace view public.philife_comments as
select * from public.community_comments;

create or replace view public.philife_reports as
select * from public.community_reports;
```

주의:

- 단순 조회만 먼저 연결할 때 적합합니다.
- 쓰기까지 새 이름으로 받을 계획이면 `INSTEAD OF` 트리거나 RPC 함수 계층이 필요합니다.

## 2단계: slug 병행 운영

현재 `section_slug = 'dongnae'` 의존이 많기 때문에 바로 삭제하지 말고 `philife`를 병행 추가합니다.

예시:

```sql
update public.community_sections
set name = '필라이프'
where slug = 'dongnae';

insert into public.community_sections (id, name, slug, sort_order, is_active)
select gen_random_uuid(), '필라이프', 'philife', sort_order, is_active
where not exists (
  select 1 from public.community_sections where slug = 'philife'
);
```

그 다음 애플리케이션에서:

- 신규 저장은 `philife`
- 레거시 조회는 `dongnae`, `philife` 둘 다 허용

형태로 바꾸는 것이 안전합니다.

## 3단계: 데이터 백필

신규 slug를 쓰기 시작하면 기존 데이터도 점진적으로 옮깁니다.

```sql
update public.community_posts
set section_slug = 'philife'
where section_slug = 'dongnae';
```

필요 시 topic/seed 데이터도 함께 조정합니다.

## 4단계: 최종 물리 rename

충분히 안정화된 뒤에만 물리 이름을 바꾸는 것을 권장합니다.

예시 초안:

```sql
alter table public.community_posts rename to philife_posts;
alter table public.community_comments rename to philife_comments;
alter table public.community_reports rename to philife_reports;
```

이 단계에서는 반드시 아래를 같이 바꿔야 합니다.

- FK
- 인덱스 이름
- trigger 이름
- policy 이름
- function / rpc 이름
- service role 쿼리 코드
- seed / migration / admin SQL

## 같이 점검할 항목

- `increment_community_post_view_count()` 같은 함수명
- `community_posts_status_check` 같은 제약 이름
- `community_posts_location_created_idx` 같은 인덱스 이름
- `community_reports`를 참조하는 관리자 API
- 샘플 SQL의 `dongnae` slug

## 권장 적용 순서

1. 코드에서 `philife` 사용자 경로/문구 적용
2. DB에 `philife` 호환 view 또는 slug 병행 추가
3. 앱 저장 로직을 `philife` 우선으로 전환
4. 기존 `dongnae` / `community_*` 데이터 백필
5. 충분한 운영 확인 후 물리 rename

## 결론

지금 당장 가장 안전한 선택은:

- 사용자 노출은 `필라이프`
- DB 물리 이름은 일단 유지
- slug 는 `dongnae`와 `philife`를 병행

입니다.

물리 rename을 바로 진행하려면, 별도 전용 마이그레이션 묶음으로 `테이블`, `RLS`, `함수`, `시드`, `앱 코드`를 한 번에 맞춰야 합니다.
