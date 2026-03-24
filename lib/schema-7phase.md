# 7단계 연동 DB 테이블 참고

## posts (기존 + 확장)

- id, category_id, author_id, type, title, content
- price, is_price_offer, is_free_share (trade)
- region, city, barangay, contact_method (선택)
- **status**: active | reserved | sold | hidden
- **view_count**: number (기본 0)
- created_at, updated_at

## favorites

| 컬럼      | 타입        |
|-----------|-------------|
| id        | uuid PK     |
| user_id   | text/uuid   |
| post_id   | uuid FK     |
| created_at| timestamptz |

## comments

| 컬럼      | 타입        |
|-----------|-------------|
| id        | uuid PK     |
| post_id   | uuid FK     |
| user_id   | text/uuid   |
| content   | text        |
| created_at| timestamptz |

## reports

| 컬럼      | 타입        |
|-----------|-------------|
| id        | uuid PK     |
| post_id   | uuid FK     |
| user_id   | text/uuid   |
| reason    | text        |
| status    | text (선택) |
| created_at| timestamptz |

## chat_rooms

| 컬럼      | 타입        |
|-----------|-------------|
| id        | uuid PK     |
| post_id   | uuid FK     |
| seller_id | text/uuid   |
| buyer_id  | text/uuid   |
| created_at| timestamptz |

## profiles (작성자 표시용)

- id, nickname, avatar_url, temperature 등 (getUserProfile에서 id, nickname, avatar_url 사용)
