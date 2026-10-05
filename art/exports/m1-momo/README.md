# M1 Momo Browser sprite candidates

Status: **candidate, not wired into the extension**. Visual direction was approved for cleanup on 2026-10-05; this does not activate M1 or complete its asset entry QA.

The six 2 × 2 generated concept sheets in `art/drafts/m1-momo/` are the preserved sources. `npm run art:export:momo` reproducibly exports 24 transparent 512 × 512 PNG master frames to `art/masters/m1-momo/browser/` and 24 transparent 256 × 256 lossless WebP frames to `browser/`. The output manifest records frame counts, draft playback rates, loop flags, and the shared foot baseline at y = 220. The script never changes the source sheets or the installed placeholder.

The export removes pixels with alpha below 32, which accounts for most red/yellow stray color in the generated transparent edge. It then crops each pose to visible bounds, scales all cells by the same factor, and places the lowest visible pixel at the 512px master baseline y = 440. This is a technical matte/placement pass, not a hand-painted correction of anatomy or motion.

`preview-light.png` and `preview-dark.png` show the six behaviors, top to bottom in manifest order, with frames 0–3 left to right at the intended 96 CSS px display size. Both backgrounds should be checked because colored edge residue is more visible against dark pages. Automated checks in `tests/momoAssets.test.ts` verify the files, dimensions, alpha, complete frame sets, and baseline.

Remaining before runtime promotion: inspect the animation **in motion** at 96 CSS px in Chrome, especially the walk loop and sleep ear-twitch/whiskers; adjust pacing and any anatomy or edge defects found; then obtain visual QA approval. These candidates are not yet proof of a natural loop or M1 completion. The current extension continues to use `src/assets/pets/momo/browser/idle-placeholder.webp`.
