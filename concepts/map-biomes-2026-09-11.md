# Seven biome map renewal

Approved scope: reuse seven biome families across all 20 stages. Preserve routes, placement and combat. Existing grassland/earth-road retained. Six new backgrounds generated with built-in imagegen using grassland as a style/composition reference. Runtime overlays vary stage lighting and road surface; original PNGs stay intact.

Production files: assets/terrain/{grassland,canyon,wetland,alpine,ruins,fortress,wasteland}.png and earth-road.png.

Verification complete: terrain-check covers all 20 stage/family render assignments and failed-image fallback; art-check --compare-head proves identical 20 seeded battle outcomes and RNG usage; crossbow-check passes; build passes; verify-build reports identical original/built state and rendering. All 20 real stage screenshots visually inspected in /tmp/canthold-all-maps.png, no page errors. Renewed canyon inspected with active towers/enemies in the in-app preview. No commit, push or deployment. Full npm test was not rerun for this asset pass; the prior run had an unrelated stochastic balance failure (S9 5/16).

## Exact prompts

### canyon

undefined

### wetland

undefined

### alpine

undefined

### ruins

undefined

### fortress

undefined

### wasteland

undefined
