# Pet Asset Pipeline

Status: Baseline

## Rendering Choice

Pet character는 transparent raster sprite로 제작하고 Runtime 3D는 사용하지 않는다. UI와 Home furniture는 SVG를 사용할 수 있다. 이동은 sprite frame 안에서 만들지 않고 CSS transform으로 처리한다.

## Master and Export

- Art master: 512 × 512, RGBA, transparent background
- Runtime frame: 256 × 256, RGBA WebP
- Browser render: Cat 약 96 CSS px, Dog 약 104 CSS px
- Home render: 약 128~160 CSS px

Browser와 Home은 같은 master에서 export해 형태와 색의 일관성을 유지한다.

## Alignment

모든 frame은 동일한 256 × 256 canvas와 foot baseline을 사용한다. 애니메이션 사이에서 anchor와 baseline이 바뀌어 캐릭터가 위아래로 튀면 안 된다.

각 animation manifest는 최소한 id, frame 수, fps, loop 여부, baseline을 가진다.

```json
{
  "id": "walk",
  "frames": 6,
  "fps": 9,
  "loop": true,
  "baseline": 220
}
```

## Frame Rates

- Idle: 6 fps
- Walk: 8~10 fps
- Groom: 8 fps
- Play: 10~12 fps
- Special: 10~12 fps

Cozy style을 위해 무조건 높은 sprite fps를 사용하지 않는다. Browser의 CSS movement는 별도의 60 fps rendering path를 사용할 수 있다.

## Delivery Order

전체 production set 전에 Momo의 Idle, Walk, Sit, Look, Sleep, Home Enter, Home Exit 일곱 animation만 제작해 M0~M3의 매력과 전환을 검증한다.

Vertical Slice production set 후보:

1. idle
2. blink/look
3. walk
4. sit
5. yawn
6. sleep
7. groom
8. look_user
9. pet_reaction
10. eat
11. play
12. happy
13. go_home
14. come_out

첫 일곱 animation으로 실제 브라우저에서 매력적인 존재감을 만들지 못하면 나머지 production을 확대하지 않는다.

## Repository Layout

```text
assets/
└─ pets/
   └─ momo/
      ├─ manifest.json
      ├─ browser/
      │  ├─ idle.webp
      │  ├─ walk.webp
      │  └─ ...
      └─ home/
         └─ ...
```

M0 구현을 시작할 때 production art가 준비되지 않았다면 baseline과 투명 영역을 지키는 명시적 placeholder를 사용한다. Placeholder는 기능 완료를 위한 임시물이며 M1 entry 전에 교체 여부를 확인한다. 이 확인은 제품 방향을 바꾸지 않으므로 Human Gate가 아니다.
