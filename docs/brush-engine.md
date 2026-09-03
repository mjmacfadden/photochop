# Hokusai brush engine (Vantage Point)

Vantage Point integrates **[Hokusai](https://github.com/reearth/hokusai)** via `hokusai-wasm`.

## Preset picker

| Preset | Behavior |
|--------|----------|
| **Classic** | Existing miniPaint dab brush (no WASM). |
| **Paint** | Hokusai + classic/brush.myb |
| **Pencil** | Hokusai + classic/pencil.myb |
| **Ink** | Hokusai + classic/pen.myb |

When Paint / Pencil / Ink is selected, strokes go through Hokusai onto the active raster layer tmp canvas. Classic keeps the old path.

## License / attribution

- Hokusai hokusai-wasm: MIT OR Apache-2.0. Upstream github.com/reearth/hokusai
- Brush fixtures .myb: mypaint-brushes CC0 1.0. github.com/mypaint/mypaint-brushes
- See src/js/libs/hokusai/THIRD_PARTY_NOTICES.md.

## Layout

Files live under src/js/libs/hokusai/: engine.js, presets.json, vendored wasm glue + binary, brushes myb files, notices.

## WASM strategy

Prebuilt artifacts are committed under src/js/libs/hokusai/. No Rust needed for normal app builds.

## Webpack
- wasm files use asset/resource
- myb and presets.json use asset/source
- hokusai_wasm.js is excluded from babel-loader
- engine.js passes the emitted wasm URL into init()

## How strokes work
1. Read Brush tool preset attribute.
2. Classic keeps the dab path.
3. Paint/Pencil/Ink lazy-load the engine, size the surface to the layer, load myb, map color and size.
4. Pressure from PointerEvent when present; else 0.5. Tilt via sin of degrees.
5. Composite stroke pixels onto the layer tmp canvas; one Bundle_action per stroke on mouseup.

## Adding a preset
1. Add a CC0 myb under brushes/.
2. Import it in engine.js MYB_BY_ID.
3. Update presets.json.
4. Add the label to config.js Brush preset.values.
5. Rebuild the app bundle.

## Known limits (v1)
- Raster layers only.
- Engine pixels composite over white; alpha is approximated from distance-from-white.
- Wet smudge does not sample existing layer pixels in stock bindings.
- No full brush browser UI; no ABR.
- Mask painting stays on the Classic path.
- One undo bundle per stroke.

## Upstream
- Demo: https://reearth.github.io/hokusai/
- Crate docs: https://docs.rs/hokusai-wasm/
