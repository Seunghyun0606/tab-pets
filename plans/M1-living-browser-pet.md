# M1 Living Browser Pet 실행 계획 (초안)

상태: 계획 초안. Project OS의 M1 활성화 또는 canonical backlog 변경이 아니다.

## 진입 조건

- TASK-006의 10곳 호환성 QA와 독립 리뷰는 PASS다. M0의 종료 기준은 증거로 충족했으나 Project OS의 canonical milestone 상태는 아직 active이므로 별도 상태 전이가 필요하다.
- Momo Browser용 Idle, Walk, Sit, Look, Sleep, Groom 애니메이션 에셋을 준비한다. 현재 런타임에는 `idle-placeholder` 한 프레임만 있고, 6종 4포즈 시안은 `art/drafts/m1-momo/`에 별도로 보관한다.
- 기존 결정인 단일 PetState, Shadow DOM overlay, raster WebP sprite + CSS 이동, 주입 가능한 시각·난수에 기반한 결정적 Pet Brain을 유지한다.

## 착수 전 정리 (2026-10-05)

- Project OS에는 현재 eligible task가 없다. TASK-006은 PASS/done이지만 M0 milestone은 canonical state에서 아직 active이며, 설치된 projectctl에는 milestone 완료·M1 활성화 명령이 없다. 따라서 이 초안만으로 M1 구현이나 canonical backlog를 시작하지 않는다.
- `specs/architecture/asset-pipeline.md`의 초기 제작 7종은 Idle, Walk, Sit, Look, Sleep, Home Enter, Home Exit인 반면 M1 roadmap의 필수 재생 6종은 Idle, Walk, Sit, Look, Sleep, Groom이다. M1에 필요한 Groom의 제작 순서를 먼저 확정하고, Home Enter/Exit는 M3 범위와 혼동하지 않는다.
- 사용자는 현재 `idle-placeholder.webp`를 6종 시안의 기준으로 사용하는 안을 승인했다. 6종 contact sheet는 제작했지만 512 × 512 art master와 정렬된 256 × 256 WebP runtime frame은 아직 없다. 시안 검토·정리·프레임 export를 마치기 전에는 M1 entry asset 완료로 표시하지 않는다.

## 제안 작업 순서

### 1. M1 애니메이션 세트와 계약 (제안 TASK-007)

- 여섯 행동의 투명 WebP 프레임과 manifest를 준비한다. 프레임은 공통 256 × 256 캔버스·foot baseline을 사용하고, 각 행동의 frame 수, fps, loop 여부를 명시한다.
- Browser render 약 96 CSS px에서 형태·색·발 위치가 행동 전환 때 튀지 않는지 확인한다.
- Home Enter/Exit, interaction reaction, 추가 캐릭터는 이 작업에 넣지 않는다.
- 검증: manifest와 에셋의 경로·프레임 수·baseline 자동 검사, 실제 Chrome 렌더 육안 확인.

### 2. 순수 Behavior selector와 시간 규칙 (제안 TASK-008)

- ROAMING에서 IDLE, LOOK, WALK, SIT, SLEEP, GROOM 후보를 고르고 지속 시간을 결정하는 순수 함수를 만든다.
- 현재 시각과 난수원을 주입한다. 최근 세 행동의 반복 감쇠(최근 1회 0.50, 2회 0.20)를 적용하고, 같은 행동 세 번 연속 선택을 정상 경로에서 억제한다.
- 첫 단계의 Momo CURIOUS 설정만 사용한다. Needs 감소, Relationship 보상, 사용자 반응은 M4·M2 범위로 남긴다.
- 검증: seeded RNG 단위 테스트로 후보 필터, 가중치, 시간 경계, 반복 억제를 재현한다.

### 3. 이동·viewport 좌표 런타임 (제안 TASK-009)

- WALK 목표와 도착 처리를 Pet World 좌표로 계산하고 CSS `translate3d()`로 움직인다. sprite frame 전환과 위치 이동을 분리한다.
- 현재 viewport에서 x를 clamp하고 resize·탭 전환 때 저장된 `normalizedX`로 유효한 위치를 복원한다.
- 초기 Curious Cat 속도 35~45 px/s 및 행동별 변주 ±10~15%는 설정값으로 둔다. 매 프레임 host DOM layout 조회는 금지한다.
- 검증: 순수 좌표 테스트, 좁은 viewport·resize·탭 변경 E2E, 페이지 클릭·스크롤 통과 확인.

### 4. Browser World 행동 재생 통합 (제안 TASK-010)

- selector의 결정과 여섯 sprite 애니메이션을 연결하고 행동 종료 후 다음 자율 행동으로 이어지게 한다.
- Content Script는 렌더링과 transient frame 처리를 맡고, 장기 상태는 기존 단일 PetState 경계를 유지한다. 중복 content script·pagehide·extension reload 시 timer와 listener를 정리한다.
- 일정이 부족해도 정적 overlay나 상태 복원 경로를 약화하지 않는다.
- 검증: 행동 순환 smoke, extension/page reload와 tab change 후 한 마리만 표시되는지 확인, extension 오류 0건.

### 5. M1 통합 QA와 관찰 (제안 TASK-011)

- 자동 build, lint, typecheck, unit, E2E와 지원 사이트 회귀 매트릭스를 실행한다.
- 10분 실제 브라우징 관찰에서 자율 행동 6종의 선택·재생, 같은 sequence의 두드러진 반복 여부, 콘텐츠 가림·입력 방해를 기록한다.
- 탭 전환과 viewport 변경 후 유효한 행동·위치로 돌아오는지 확인한다. 시각적 자연스러움은 자동 테스트 통과만으로 승인하지 않는다.

## M1 완료 조건

M1 roadmap의 네 종료 기준이 모두 증거로 충족되어야 한다: 여섯 행동의 선택·재생, 이동의 viewport/resize/normalizedX 유효성, 10분 관찰에서 반복감이 두드러지지 않음, 탭 전환 후 행동·위치 복귀. 이후에만 M2 직접 상호작용 작업을 연다.

이 문서는 작업 분해 제안이며 TASK-007~011은 아직 Project OS backlog에 등록되지 않았다. 구현 중 PetState schema migration, 새로운 영속 상태 소유자, 또는 제품 범위 변경이 필요해지면 별도 Human Gate에서 결정한다.
