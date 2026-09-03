# Brush engine (Vantage Point)

Vantage Point paints with two engines behind a shared **Brush Library**:

1. **Classic / stamp** — tip-PNG dabs (or procedural round/soft fallback). No WASM.
2. **Hokusai** — [Hokusai](https://github.com/reearth/hokusai) via `hokusai-wasm` for painterly presets.

## Brush Library UI

When the Brush tool is active, the options bar shows a **Brushes** control (stroke thumbnail + name). Clicking opens a flyout inspired by Procreate / Photoshop / Krita:

- Category tabs: All / Classic / Paint / Pencil / Ink / Airbrush / Marker
- Grid with **stroke preview** + name + engine badge
- Click applies size / opacity / hardness / pressure defaults
- Size + Opacity stay on the options bar

implementation: `src/js/core/gui/gui-brush-library.js` + CSS in `src/css/layout.css`.

## Custom brush format (vpbrush JSON)

Presets live under `src/js/libs/brushes/` (not ABR).

- Manifest: `src/js/libs/brushes/library.json`
- Loader: `src/js/libs/brushes/library.js`
- Tips / previews: `images/brushes/tips/`, `images/brushes/previews/`
- Regenerate tips + previews: `bash scripts/generate-brush-assets.sh`
  - Tips: ImageMagick shapes with proper alpha
  - Classic/stamp previews: `scripts/stamp-brush-previews.mjs` stamps the tip along a curve
  - Hokusai previews: illustrative IM stroke curves (not live WASM captures)

### Preset fields

| Field | Meaning |
|-------|--------|
| `id` / `name` / `category` | Identity + picker grouping |
| `engine` | `"classic"`, `"stamp"`, or `"hokusai"` |
| `tip` | Path to tip PNG (alpha = shape). Used when `engine` is `classic` or `stamp` |
| `hokusai` | Paint / Pencil / Ink `.myb` id when `engine` is `hokusai` |
| `size` / `opacity` / `flow` | Defaults; `size.pressure` / `opacity.pressure` opt-in |
| `hardness` | 0–100; on tip stamps applies a radial soft mask |
| `spacing` | Fraction of brush diameter between dabs (e.g. `0.25`) |
| `preview` | Stroke thumbnail path for the picker |

`engine: "classic"` or `"stamp"` with a `tip` stamps that PNG (foreground-tinted). Without a ready tip image, Classic falls back to procedural round / soft dabs. `engine: "hokusai"` maps `hokusai` to Paint/Pencil/Ink `.myb`. Legacy Classic/Paint/Pencil/Ink aliases still resolve.

## Shipped library (12 brushes)

| Category | Brushes |
|--------|--------|
| Classic | Round, Soft Round (tip-stamped) |
| Paint | Paint, Heavy Paint (Hokusai) |
| Pencil | Sketch (Hokusai), Soft Pencil (tip-stamped) |
| Ink | Fineliner, Ink Brush (Hokusai) |
| Airbrush | Soft Airbrush, Spray (tip-stamped) |
| Marker | Chisel Marker, Felt Tip (tip-stamped) |

## Tip stamping (classic path)

For each dab:

1. Load + cache the tip `Image` from `brush.tip`
2. Scale to brush size; tint with `source-in` fill of the foreground color (alpha preserved)
3. If hardness < 100, multiply alpha by a radial falloff (`destination-in`)
4. Draw with stroke opacity × flow (and optional opacity pressure)
5. Space dabs along the stroke at `spacing × diameter`

Pressure: when `size.pressure` (or the options-bar Pressure toggle) is on, size scales with pointer pressure. Flash fix stays intact — interactive-only `render_interactive_layer` + rAF; no full `Base_layers.render()` during the stroke.

## License / attribution

- Hokusai hokusai-wasm: MIT OR Apache-2.0. Upstream github.com/reearth/hokusai
- Brush fixtures .myb: mypaint-brushes CC0 1.0. github.com/mypaint/mypaint-brushes
- See src/js/libs/hokusai/THIRD_PARTY_NOTICES.md.

## Layout

- src/js/libs/brushes/: library.json, library.js
- src/js/libs/hokusai/: engine.js, wasm, .myb, presets.json
- images/brushes/tips/ and images/brushes/previews/
- scripts/generate-brush-assets.sh, scripts/stamp-brush-previews.mjs

## WASM strategy

Prebuilt artifacts are committed under src/js/libs/hokusai/. No Rust needed for normal app builds.

## Webpack
- wasm files use asset/resource
- myb and presets.json use asset/source
- hokusai_wasm.js is excluded from babel-loader
- engine.js passes the emitted wasm URL into init()
- Tip/preview PNGs are static files under `images/` (served from the app root)

## How strokes work / flash fix
1. Read Brush Library preset id from the Brush tool attribute.
2. Classic/stamp uses tip PNGs (or procedural fallback); Hokusai presets lazy-load WASM.
3. During stroke: set link_canvas once; only render_interactive_layer (rAF-throttled); never Base_layers.render() on move.
4. Hokusai uses dirty-AABB whiteBgToStraightRgba + dirty-rect composite; queues events while session starts.
5. One Bundle_action per stroke on mouseup, then clear link_canvas.

## Adding a preset

### Tip-stamped classic / stamp brush
1. Add a tip PNG under `images/brushes/tips/` (black RGB, alpha = shape), or extend `scripts/generate-brush-assets.sh`.
2. Add an entry to `src/js/libs/brushes/library.json` with `engine: "classic"` or `"stamp"`, `tip`, size/opacity/flow/hardness/spacing, and a `preview` path.
3. Add the id to `config.js` Brush `preset.values`.
4. Run `bash scripts/generate-brush-assets.sh` to refresh tip/preview assets.
5. Rebuild the app bundle (`npm run build`).

### Hokusai (myb) brush
1. Add a CC0 `.myb` under `src/js/libs/hokusai/brushes/` (or the fixtures folder used by the engine).
2. Import it in `engine.js` `MYB_BY_ID`.
3. Update `presets.json` if needed.
4. Add a library.json entry with `engine: "hokusai"` and `hokusai: "Paint"|"Pencil"|"Ink"` (or the myb id).
5. Add the id to `config.js` Brush `preset.values`.
6. Rebuild the app bundle.

## Known limits
- Raster layers only.
- Engine pixels composite over white; alpha approximated (dirty-rect optimized).
- Wet smudge does not sample existing layer pixels in stock bindings.
- No ABR import.
- Mask painting stays on the Classic path.
- One undo bundle per stroke.
- Interactive fast path requires a top-most normal layer.
- Tip images must finish loading before the first dab uses them (preloaded on Brush tool load; procedural fallback until ready).
- Stroke previews for classic brushes are tip-stamped along a curve (not live engine captures); Hokusai previews remain illustrative.

## Upstream
- Demo: https://reearth.github.io/hokusai/
- Crate docs: https://docs.rs/hokusai-wasm/
