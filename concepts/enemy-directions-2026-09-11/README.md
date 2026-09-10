# Directional monster sprites

Built-in image_gen / imagegen skill. Original generated images retained here; normalized 256x256 RGBA production sprites go in assets/sprites/enemies/fantasy. Side faces left; right mirrors it. Rear faces up/away. Swift original left-profile is reused as swift-side.png, swift-down-v2 supplies the new base.

Status: all sixteen direction slots integrated. The six remaining sprites were cleaned with built-in imagegen and normalized to 256px with sips, preserving alpha. No opaque originals are used. All 24 base/directional PNGs have actual transparent pixels; corner alpha is at most 1/255 (near-transparent resampling residue).

Tests: complete directional asset checks and build pass. All 20 seeded battles match HEAD, including RNG call counts. In-app first and second stage screenshots inspected. No deploy/commit.

## Final transparency cleanup prompt (all six)

Built-in imagegen, edit targets: armored-up-v2, swift-up, regen-side, regen-up, immune-side, immune-up. Outputs: corresponding `*-clean.png` in this directory. Production paths: `assets/sprites/enemies/fantasy/{name}.png`.

Create a clean transparent PNG cutout of this exact pixel-art creature. Keep the same pose, facing direction, colors and design. Remove the entire background, including all white and gray checkerboard areas outside the creature. Return a single isolated sprite with genuine alpha transparency. No backdrop or ground shadow.

## Exact generation prompts

### grunt-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: small beige pebble creature with stubby stone arms and feet. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### grunt-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: small beige pebble creature with stubby stone arms and feet. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### armored-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: bulky slate-steel knight golem carrying huge steel shield in FRONT of its body; shield must turn with body, not remain facing camera. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### armored-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: bulky slate-steel knight golem carrying huge steel shield in FRONT of its body; shield must turn with body, not remain facing camera. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### warded-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: floating diamond violet crystal wraith, central dark core, pointed faceted side shards. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### warded-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: floating diamond violet crystal wraith, central dark core, pointed faceted side shards. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### swift-down

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: golden long-eared hare lizard with cream chest and slender tail. Redraw this SAME creature from FRONT/DOWN VIEW walking TOWARD viewer toward BOTTOM edge. Face, cream chest, symmetrical forward feet visible, ears swept behind; NOT the original left-facing profile. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### swift-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: golden long-eared hare lizard with cream chest and slender tail. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### regen-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: round green translucent healing slime with two-leaf sprout and glowing plus emblem on FRONT only. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### regen-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: round green translucent healing slime with two-leaf sprout and glowing plus emblem on FRONT only. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### immune-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: orange capsule creature with cream collar and feet, ring-slash symbol on FRONT only. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### immune-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: orange capsule creature with cream collar and feet, ring-slash symbol on FRONT only. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### swarm-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: one tiny cyan teardrop grub with stubby feet. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### swarm-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: one tiny cyan teardrop grub with stubby feet. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### elite-side

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: broad red rock golem with three crownlike spikes, dark joints and giant fists. Redraw this SAME creature from LEFT-FACING SIDE PROFILE, looking and walking toward LEFT edge of image. Head/eyes point left, clear side silhouette, far eye hidden. This is NOT a front pose with a turned face. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

### elite-up

Use case: identity-preserve. Asset: one production directional pixel-art game sprite. Reference is the exact approved character design: broad red rock golem with three crownlike spikes, dark joints and giant fists. Redraw this SAME creature from REAR/BACK VIEW facing NORTH, walking AWAY from viewer toward TOP edge. Show back of head and back of body. NO eyes or face visible, no front emblems visible. Preserve species silhouette and materials. Same camera elevation (slightly top-down), same proportions, pixel cluster size, outline, material, palette and top-left lighting as reference. Entire creature centered within a square, occupied bounding box about 85% of image, feet/bottom at 90% height, no extremity cut off. ONE character, ONE view only. Genuine transparent ALPHA PNG cutout, no background, no checkerboard, no ground plane or shadow, no text, no extra objects. Do not redesign the creature or add accessories.

## Follow-up prompts

Swift front retry: Draw the same yellow fantasy rabbit-lizard character viewed from the front, facing the viewer, as a pixel art game sprite. Keep the long ears, golden body, cream chest and thin tail. One complete character centered on a transparent background. No text.

Armored rear correction: back armor plates, back of helmet, shield occluded ahead of torso, no face. Two transparent-background attempts still returned RGB; candidates retained as armored-up-v2.png and armored-up-alpha.png. Use v2 for approved shape.
