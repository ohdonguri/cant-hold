# Grassland and fantasy sprite pass · 2026-09-11

Status: local review, not deployed. Only stage 1 uses the painted terrain. Other 19 stages retain procedural prototypes. All stages use the new monster family: 8 bases plus 16 side/rear PNGs. Right mirrors the left profile. Legacy files remain outside the active family. See enemy-directions-2026-09-11/README.md for prompts and verification.

Generated with built-in image_gen using imagegen skill. Images inspected; enemy PNG alpha verified; resized mechanically to 256×256 with sips, no background removal scripts.

Verification: test-driven-development added failing monster-family and terrain-loading regressions before code changes; all pass. systematic-debugging traced three old hard-coded test paths and one-frame verifier art-clock drift, then fixed test fixtures without changing combat. requesting-code-review found no critical/important issue; its optional direction-loading test gap was strengthened by loading any existing direction files. verification-before-completion reran art checks, 20 seeded HEAD comparisons, seedcheck, full npm test (existing four KNOWN issues), build, screenshots (no page errors), and original/built pixel parity (identical).

## Monster motion follow-up

Existing PNGs are animated through Canvas transforms, not new sprite-sheet frames or an animation library. Grunt/armored/elite have weighted walking sway; swift leaps and leans into horizontal travel; warded floats; regen/immune squash and stretch; swarm hops with independent phases. Fixed ground shadows separate the sprites from the road. Health/status bars remain anchored to gameplay positions.

The pose is a pure function of distance, species and ID. Slow changes pose progression through actual speed; freeze/stun/pause hold the pose without restarting the cycle. No animation timer, RNG, movement or collision changes. TDD tests cover changing poses, independent swarm timing, renderer transforms and real update freeze/resume; direction tests now count negative-X scale only, excluding positive squash/stretch. A scoped code review found no critical/important issue.

## Saved assets

- Terrain: `assets/terrain/grassland.png`, `assets/terrain/earth-road.png`
- Monsters: `assets/sprites/enemies/fantasy/{grunt,armored,warded,swift,regen,immune,swarm,elite}.png`
- Existing approved monster source: `concepts/enemies-redesign-2026-09-10/roster-concept.png`
- Style reference: `concepts/towers-fantasy-redesign/roster-concept.png`
- Grunt, armored, warded, regen, immune, elite recovered from previous approved generation outputs, not redesigned again.

## Exact prompts for this pass

### swift

Reference: `concepts/enemies-redesign-2026-09-10/roster-concept.png`

Create a production cutout sprite of ONLY the yellow golden long-eared hare-lizard swift creature at TOP RIGHT of reference. Preserve exact approved design, left-facing running pose, crisp chunky pixel art, black eye, cream chest, two long swept-back ears, thin tail, four limbs. Single creature centered square, whole object fills 88 percent canvas; all extremities visible. TRUE transparent ALPHA PNG, fully removed background, no floor shadow, no checkerboard, no text, no panels, no other creatures.

### swarm

Reference: `concepts/enemies-redesign-2026-09-10/roster-concept.png`

Create a production cutout sprite of ONLY ONE small cyan droplet-shaped grub creature from BOTTOM ROW THIRD COLUMN of reference. Preserve exact approved design, cyan faceted teardrop head, black eyes, tiny stubby feet, crisp chunky pixel art. ONE creature not a group, centered square, object fills 85 percent canvas. TRUE transparent ALPHA PNG, fully removed background, no floor shadow, no checkerboard, no text, no panels, no other creatures.

### grassland

Reference: `concepts/towers-fantasy-redesign/roster-concept.png`

Use case: stylized-concept. Asset type: production top-down portrait game environment background PNG, 1024x1536. Reference is STYLE ONLY, especially its bottom-right environment vignette. Create a beautifully crafted pixel-art mossy meadow forest clearing matching the towers' crisp faceted stone, rich controlled pixel clusters and directional lighting. TOP DOWN orthographic flat ground, no horizon, no sky, no perspective vanishing point, no isometric diamond. The central 80% width and central 72% height must be unobstructed calm dark muted moss/short grass, subtle natural patches, no big objects there: actual paths and towers will be overlaid by game. Detailed mossy rocks, gnarled roots, ferns, clustered bushes, dark evergreen canopy and tiny cream wildflowers ONLY around outermost 10% left/right and 14% top/bottom border. Organic asymmetric composition, dappled late afternoon light, dark teal forest shadows and subdued olive/sage floor, tasteful warm stone highlights. Intricate handcrafted pixel art not blurry digital painting. Quiet playable interior, gorgeous natural border. NO paths, NO roads, NO tiles/grid/checkerboard, NO buildings/towers/characters/UI/text, no cartoon triangle mountains, no framed border.

### road

Reference: `concepts/towers-fantasy-redesign/roster-concept.png`

Use case: stylized-concept. Asset type: seamless top-down game dirt road material texture, square PNG. Reference STYLE ONLY bottom-right environment vignette. Entire image is a flat continuous worn earth road surface: subdued gray-brown compacted dirt with sparse embedded weathered flat slate pebbles, subtle wheel-worn grain. Crisp premium hand-placed pixel clusters matching the fantasy tower stone textures. Small-scale organic detail, low contrast and medium dark value so bright colorful monsters read clearly. Orthographic top down. Fill entire square edge-to-edge with same dirt material, no grass, no border, no path outline, no curb, no plants, no major large stones, no grid, no regular bricks, no text, no objects, no perspective.
