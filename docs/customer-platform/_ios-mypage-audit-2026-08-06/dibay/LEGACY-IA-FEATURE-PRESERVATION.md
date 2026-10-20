# Legacy IA — feature preservation matrix (pre-runtime)

| label (key) | route | permission | new group | delete | note |
|-------------|-------|------------|-----------|--------|------|
| trade active | sales | member | activity | 0 | KEEP |
| purchases | trade hub | member | activity | 0 | KEEP |
| favorites | favorites | member | activity | 0 | KEEP |
| offers | offers | member | activity | 0 | KEEP |
| recent | recent | member | activity | 0 | KEEP |
| reviews | reviews | member | activity | 0 | KEEP |
| store register | /stores/owner/apply | member | store_order | 0 | KEEP |
| store orders | store-orders | member | store_order | 0 | KEEP |
| rider | store/rider | member | store_order | 0 | KEEP |
| points card | (summary) | member | assets | 0 | MOVE after store |
| account | account href | member | account | 0 | KEEP |
| addresses | addresses | member | account | 0 | KEEP (행 오른쪽 동네 값 없음 — 대표 주소는 필수정보 3행이 표시, 2026-10-20) |
| payment | store/payment | member | account | 0 | KEEP |
| security | device-permissions | member | account | 0 | KEEP |
| notifications | notifications | member | account | 0 | KEEP |
| language | toggle | member | account | 0 | KEEP |
| region/country | country | member | account | 0 | KEEP |
| service rows | settings/* | member | service | 0 | KEEP (all SERVICE_ITEMS, 아래 3종 홈 행 제외) |
| 읽는 기능 없는 설정 3종 (video-autoplay · personalization · country) | settings/video-autoplay · settings/personalization · settings/country | member | service · account | 0 | 경로·저장 데이터·레지스트리 KEEP, **홈 행 HIDE** (2026-10-20 Owner 개정 C-4 — 저장값을 읽는 기능 0) |
| notices | notices | member | support | 0 | KEEP |
| CS | customer-center | member | support | 0 | KEEP |
| inquiries | /mypage/inquiries | member | support | 0 | KEEP |
| inbox | /mypage/inbox | member | support | 0 | KEEP |
| terms | settings/terms | member | policy | 0 | MOVE from support |
| privacy | /privacy | public | policy | 0 | MOVE |
| business | /business-info | public | policy | 0 | MOVE |
| leave | settings/leave | member | danger | 0 | MOVE from account |
| logout | modal menu_row | member | danger | 0 | MOVE from account |
| required info 3 rows (아이디 · 전화번호 인증 · 대표 주소) | sheets · /mypage/addresses | member | under identity | 0 | **필수정보 3행 상시 표시 (2026-10-20 Owner 승인, real-screen-redesign §11)** — 완료여도 숨기지 않음, 계정(S03)도 같은 컴포넌트 |

writer clone = 0 · route clone = 0 · Admin/CMS = 0
