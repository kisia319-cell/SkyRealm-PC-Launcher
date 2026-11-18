# SkyRealm Game 0.20.50.159

## Visual restoration
- Fixed ordinary-world rendering: all five settlements, their houses, gardens, street lamps, trees, caravans, caches and NPCs now appear in the normal world as well as the trade world.
- Increased natural tree density while keeping paths, village footprints and building areas clear. Existing felled-tree regrowth remains intact.
- Rebuilt grass, forest, jungle, snow, desert, blight and volcanic ground tiles with gradients, organic colour patches, grass blades, stones, snow highlights and biome-specific details. Removed the hard square tile outlines that made the terrain look like a flat grid.
- Added detailed dirt-path texture with gravel, dirt variation and natural wear.
- Enlarged the player visual and improved face/eye visibility, arms, sleeves, hair highlights, clothing seams and shading.

## Safety
- Only rendering and deterministic world-decoration density were changed. Player movement, WASD handling, collision and physics code were not modified.
- Existing world saves remain readable; no save reset is required.