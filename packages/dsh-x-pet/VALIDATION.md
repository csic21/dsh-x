# Pet validation status

## Compatibility target

- Plugin: `dsh-x-pet@0.8.0`
- Official DSH runtime: `0.2.1-rc.2`
- Codex pet contract: sprite atlas 1536 wide, 192×208 per cell, 9 rows (1536×1872) or 11 rows (1536×2288), transparent background, local pet packages under `${CODEX_HOME:-~/.codex}/pets/<name>/` with `pet.json` and `spritesheet.webp`.

The Codex rows, frame counts, per-frame durations, the slowed idle loop, the three-times-then-idle fallback for one-shot states, the 16 look directions at 22.5° and the `background-position` geometry are implemented from the published Codex pet contract. No Codex artwork is copied into this package; the bundled pet is drawn procedurally by `scripts/pet-atlas.py`.

## Passed locally

- Frame table: row per state, frames per row, and every frame duration equal to the Codex contract.
- Playback: idle runs at 1/6 speed and loops; a one-shot state plays three times and then settles into the idle loop; an explicit loop repeats the state; reduced motion shows one frame.
- Look directions: 16 clockwise steps of 22.5°, rows 9 and 10, with a deadzone that falls back to idle.
- Geometry: background positions spread the cells evenly; a sheet height of 1872 or 2288 selects 9 or 11 rows and every other height is refused.
- Store: the bundled sheet is a valid Codex sheet; local pets are read from the Codex pets folder; a manifest with a foreign id, a sheet that is not a pet atlas, and a manifest that tries to escape its folder are all skipped; the selection and the dragged position are stored under the official profile directory and survive a restart.
- Routes: the connection envelope is validated, unknown fields and a wrong method are refused, a failing handler answers with a failure instead of throwing, and the atlas route answers with image bytes rather than JSON.
- Compiled Client registration: the frame registers in `shell.overlay` with its own id, and the rendered state follows the session facts (running, waiting, review, idle).

## Not verified here

- Packaged Desktop behaviour: the plugin is verified as Web-side source, unit tests and a JSDOM mount of the built client. A packaged Desktop run has not been recorded in this repository.
- Rendering appearance in a real browser: no browser control was available in this environment, so the visual result of the frame, the picker and the sprite sheet is not claimed as verified.
