# M1 Momo Browser sprite candidates

Status: **visual concept approved and packaged for M1, not yet wired into the overlay**. The user approved the six animation concepts after reviewing the Chrome playback preview on 2026-10-05. M1 is active, but this approval and packaging do not complete in-context extension QA.

The six 2 × 2 generated concept sheets in `art/drafts/m1-momo/` are the preserved sources. `npm run art:export:momo` reproducibly exports 24 transparent 512 × 512 PNG master frames to `art/masters/m1-momo/browser/` and 24 transparent 256 × 256 lossless WebP frames to `browser/`. The output manifest records frame counts, draft playback rates, loop flags, and the shared foot baseline at y = 220. The script never changes the source sheets or the installed placeholder.

The export removes pixels with alpha below 32, which accounts for most red/yellow stray color in the generated transparent edge. It then crops each pose to visible bounds, scales all cells by the same factor, and places the lowest visible pixel at the 512px master baseline y = 440. This is a technical matte/placement pass, not a hand-painted correction of anatomy or motion.

`preview-light.png` and `preview-dark.png` show the six behaviors, top to bottom in manifest order, with frames 0–3 left to right at the intended 96 CSS px display size. Both backgrounds should be checked because colored edge residue is more visible against dark pages. Automated checks in `tests/momoAssets.test.ts` verify the files, dimensions, alpha, complete frame sets, and baseline.

Open `preview.html` directly in Chrome to watch all six candidates at their provisional rates, side by side on light and dark backgrounds. Use **일시정지/재생** to inspect a pose and **처음부터** to restart. `npm run qa:momo-animation` runs the source preview in an isolated headless system Chrome profile and writes `chrome-qa.json` plus two screenshots.

`npm run art:package:momo` copies the approved 24 frames into `src/assets/pets/momo/browser/` and writes `src/assets/pets/momo/animations.json` with frame order, fps, loop, and baseline. It refuses to overwrite a differing packaged asset. `npm run build` includes and checks this contract in `dist/`. After building, `npm run qa:momo-runtime` loads the **dist** frames in the same 96 CSS px light/dark Chrome preview, checks all six cycles and page errors, and writes `chrome-runtime-qa.json` plus two `chrome-runtime-*.png` screenshots. This is packaged-asset playback QA, **not** an in-context extension test.

The six-concept visual direction is approved and the files are packaged. Behavior transitions and 10-minute real browsing in Chrome remain later M1 work. The isolated playback smoke and concept approval do not prove M1 completion. The current extension continues to use `src/assets/pets/momo/browser/idle-placeholder.webp` until runtime integration.
