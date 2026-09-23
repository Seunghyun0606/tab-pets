# Initial Product Plan

Status: Baseline  
Stage: First playable prototype  
Last structured: 2026-09-24

## Purpose

이 문서는 최초 기획안에서 제품 범위와 검증 기준만 보존한 기준 문서다. 화면 동작은 `specs/ux/experience-flows.md`, Pet Brain 규칙은 `specs/feature/pet-brain.md`, 구현 경계는 `specs/architecture/` 문서를 따른다.

## Validation Hypothesis

검증할 질문은 하나다.

> 웹을 사용하다가 화면 구석에서 작은 펫이 스스로 행동하는 것만으로도 사용자가 애착과 호기심을 느끼는가?

프로토타입은 콘텐츠의 양이나 경제 시스템의 유지율을 검증하지 않는다. 핵심 경험이 자연스럽다는 근거를 얻기 전에는 캐릭터와 애니메이션의 수를 늘리지 않는다.

## First Playable Journey

1. 사용자가 Chrome에서 일반 웹페이지를 연다.
2. Momo가 화면 아래쪽에 등장해 걷고, 앉고, 둘러보고, 잔다.
3. Momo가 커서를 바라보고 클릭에 반응한다.
4. 사용자가 Momo를 쓰다듬거나 집으로 부른다.
5. Momo가 화면 밖으로 걸어가고 Side Panel의 Home으로 들어온다.
6. 사용자는 Bowl, Bed, Toy로 먹이기, 쉬기, 놀아주기를 한다.
7. 사용자가 Momo를 내보내면 Home을 나가 Browser World에 다시 등장한다.
8. 이 전체 과정에서 같은 펫의 상태가 유지된다.

## First Playable Scope

- Pet: Momo 한 마리
- Browser behavior: Idle, Look, Walk, Sit, Sleep, Groom
- Direct interaction: Pet, Call Home
- Home: Room, Door, Bed, Bowl, Toy
- Care values: Energy, Satiety, Fun
- Transition: Home In, Home Out
- Persistence: 브라우저 재시작과 탭 변경 이후에도 한 펫의 상태 유지

Play와 Cursor reaction은 핵심 흐름을 손상하지 않는 범위에서 뒤 Milestone에 추가할 수 있다.

## Mandatory Cut Line

일정이 부족해도 다음은 제거하지 않는다.

- 안전한 Pet Overlay
- 자율 행동
- 짧은 직접 상호작용
- Pet Home
- Call Home과 Send Out
- 영속 상태

다음은 Vertical Slice 검증 전에는 범위에 넣지 않는다.

- 두 번째 펫과 Dog
- 세 가지 성격의 완전한 콘텐츠
- 다단계 Relationship 콘텐츠
- 여러 Rare Behavior
- Furniture customization, Outfit
- Currency, Shop, Mission, Achievement, Collection, Statistics, Memories

## Validation Protocol

기능 검증은 자동화 가능한 안정성과 사람이 판단해야 하는 감각을 분리한다.

자동 검증 대상:

- Extension load와 Side Panel open
- Content Script와 Pet root 표시
- Pet click 후 interaction 표시
- Call Home 후 presence가 Home으로 수렴
- reload, tab change, viewport resize 이후 상태와 위치의 유효성

Human Visual QA 대상:

- 펫이 너무 자주 움직이지 않는가
- 웹 콘텐츠를 가리거나 일을 방해하지 않는가
- 행동 순서가 기계적으로 반복되어 보이지 않는가
- 펫을 클릭해 보고 싶은가
- 집으로 부르고 다시 내보내는 과정이 자연스러운가
- 10분 뒤에도 계속 켜 두고 싶은가

최종 질문에 긍정적인 신호가 있을 때만 콘텐츠 확장으로 진행한다.

## Expansion Order After Validation

1. Behavior variety
2. Personality
3. Care Tempo
4. Relationship
5. Furniture-linked behavior
6. Second pet
7. Rare events
8. Customization
9. Collection
10. Economy

장기적으로 축적할 제품 자산은 Behavior Definition Library, Animation Library, Personality Weight Model, Contextual Reaction System, Character Writing이다.
