# 카테고리 시스템 Supabase 스키마

## categories

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | |
| name | text | 표시 이름 |
| slug | text | URL/필터용 |
| icon_key | text | 아이콘 식별자 |
| type | text | trade, service, community, feature |
| sort_order | int | 정렬 순서 (0 기준) |
| is_active | boolean | 노출 여부 |
| description | text null | 설명 |
| quick_create_enabled | boolean | 글쓰기 런처 노출 (default false) |
| quick_create_group | text null | content \| trade |
| quick_create_order | int | 런처 내 순서 (default 0) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## category_settings (1:1)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| category_id | uuid PK FK categories(id) | |
| can_write | boolean | 글쓰기 가능 |
| has_price | boolean | 가격 필드 사용 (거래) |
| has_chat | boolean | 채팅 가능 |
| has_location | boolean | 위치 필드 사용 |
| post_type | text | post, request, link (글쓰기 분기) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## 글쓰기 분기

- **trade**: 가격 + 채팅 → /products/new
- **community**: 가격 없음 → /posts/new?type=community
- **service**: 요청형 폼 → /posts/new?type=service
- **feature**: post_type=link 시 페이지 이동
