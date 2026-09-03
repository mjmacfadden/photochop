# Brush engine (Vantage Point)

Vantage Point paints with two engines behind a shared **Brush Library**:

1. **Classic** — miniPaint-style dab / soft-stamp (no WASM).
2. **Hokusai** — [Hokusai](https://github.com/reearth/hokusai) via `hokusai-wasm` for painterly presets.

## Brush Library UI

When the Brush tool is active, the options bar shows a **Brushes** control (stroke thumbnail + name). Clicking opens a flyout inspired by Procreate / Photoshop / Krita:

- Category tabs: All / Classic / Paint / Pencil / Ink / Airbrush / Marker
- Grid with **stroke preview** + name + engine badge
- Click applies size / opacity / hardness / pressure defaults
- Size + Opacity stay on the options bar

Implementation: `src/js/core/gui/gui-brush-library.js` + CSS in `src/css/layout.css`.

## Custom brush format (vpbrush JSON)

Presets live under `src/js/libs/brushes/` (not ABR).

- Manifest: `src/js/libs/brushes/library.json`
- Loader: `src/js/libs/brushes/library.js`
- Tips / previews: `images/brushes/tips/`, `images/brushes/previews/`
- Regenerate: `bash scripts/generate-brush-assets.sh`

`engine: "classic"` uses the dab path. `engine: "hokusai"` maps `hokusai` to Paint/Pencil/Ink `.myb`. Legacy Classic/Paint/Pencil/Ink aliases still resolve.

## Shipped library (12 brushes)

| Category | Brushes |
|----------|---------|
| Classic | Round, Soft Round |
| Paint | Paint, Heavy Paint (Hokusai) |
| Pencil | Sketch (Hokusai), Soft Pencil (Classic) |
| Ink | Fineliner, Ink Brush (Hokusai) |
| Airbrush | Soft Airbrush, Spray (Classic) |
| Marker | Chisel Marker, Felt Tip (Classic) |

## License / attribution

- Hokusai hokusai-wasm: MIT OR Apache-2.0. Upstream github.com/reearth/hokusai
- Brush fixtures .myb: mypaint-brushes CC0 1.0. github.com/mypaint/mypaint-brushes
- See src/js/libs/hokusai/THIRD_PARTY_NOTICES.md.

## Layout

- src/js/libs/brushes/: library.json, library.js
- src/js/libs/hokusai/: engine.js, wasm, .myb, presets.json
- images/brushes/tips/ and images/brushes/previews/

## WASM strategy

Prebuilt artifacts are committed under src/js/libs/hokusai/. No Rust needed for normal app builds.

## Webpack
- wasm files use asset/resource
- myb and presets.json use asset/source
- hokusai_wasm.js is excluded from babel-loader
- engine.js passes the emitted wasm URL into init()

## How strokes work / flash fix
1. Read Brush Library preset id from the Brush tool attribute.
2. Classic keeps the dab path; Hokusai presets lazy-load WASM.
3. During stroke: set link_canvas once; only render_interactive_layer (rAF-throttled); never Base_layers.render() on move.
4. Hokusai uses dirty-AABB whiteBgToStraightRgba + dirty-rect composite; queues events while session starts.
5. One Bundle_action per stroke on mouseup, then clear link_canvas.

## Adding a preset
1. Add a CC0 myb under brushes/.
2. Import it in engine.js MYB_BY_ID.
3. Update presets.json.
4. Add the label to config.js Brush preset.values.
5. Rebuild the app bundle.

## Known limits
- Raster layers only.
- Engine pixels composite over white; alpha approximated (dirty-rect optimized).
- Wet smudge does not sample existing layer pixels in stock bindings.
- No ABR import.
- Mask painting stays on the Classic path.
- One undo bundle per stroke.
- Interactive fast path requires a top-most normal layer.

## Upstream
- Demo: https://reearth.github.io/hokusai/
- Crate docs: https://docs.rs/hokusai-wasm/
