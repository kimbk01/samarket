# 02 — Domain Contract

Architecture LOCK #2.

모든 제품 표면은 아래 Domain 중 하나에 속한다. Messenger / Store / Delivery / Community도 **동일 계약 스키마**를 쓴다.

## Domains

| Domain | 설명 |
|--------|------|
| Member | 로그인 회원 |
| Owner (Store) | 매장 사장님 |
| Admin | 운영 관리자 |
| Guest | 비로그인 |
| System | 배치·워커·내부 잡 |
| Service | 서비스 롤 API · webhook |

## Domain 계약 표 (LOCK 시 확정)

각 Domain마다:

| Field | 의미 |
|-------|------|
| Reader | 읽기 진입점 (route/API) |
| Writer | 쓰기 진입점 |
| Projection | UI/DTO 투영 |
| Permission | 권한 게이트 |
| Navigation Root | 해당 Domain 내비 루트 |
| Badge Authority | 뱃지 집계 권위 |
| Notification Authority | 알림 권위 |
| Audit Scope | 감사 로그 범위 |

### 템플릿 예 (LOCK 전 초안)

#### Member

| Field | Value |
|-------|-------|
| Reader | `/mypage`, profile read APIs |
| Writer | profile update, settings |
| Projection | Member Projection |
| Permission | authenticated member |
| Navigation Root | BottomNav · 내정보 |
| Badge Authority | Member Badge (TBD SSOT) |
| Notification Authority | Member Notification |
| Audit Scope | self actions |

#### Owner (Store)

| Field | Value |
|-------|-------|
| Reader | `/stores/owner…`, store APIs |
| Writer | store ops |
| Projection | Owner Projection |
| Permission | store owner role |
| Navigation Root | Owner shell |
| Badge Authority | Store Badge |
| Notification Authority | Owner Notification |
| Audit Scope | store ops |

#### Admin

| Field | Value |
|-------|-------|
| Reader | `/admin/**`, admin APIs |
| Writer | adjust / moderate / CMS |
| Projection | Admin User Facts Projection |
| Permission | admin roles |
| Navigation Root | Admin shell |
| Badge Authority | Admin ops badges |
| Notification Authority | Admin send + inbox ops |
| Audit Scope | full Admin Audit |

#### Guest · System · Service

Architecture LOCK에서 Reader/Writer/Permission/Audit Scope를 동일 스키마로 채운다.
