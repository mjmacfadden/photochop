# Performance next — GPU filters, blends, cache, memory

**Branch:** `feature/perf-gpu-adj`
**Parent:** master @ after PR #25 (`docs/perf-spike.md`)
**PR:** #26

## Goals (priority order)

1. **Layer filters on GPU** — move common CSS-like filters onto the WebGL path so `can_render_layers` no longer falls back for those stacks.
2. **More blend modes** — soft-light, hard-light, color-dodge (and easy cousins) via the existing dst-snapshot shader path.
3. **Dirty-rect / cache polish** — reuse last WebGL composite bitmap on viewport-only frames (pan/zoom) instead of replaying the full layer stack every time.
4. **Memory budget UI** — lightweight HUD or Details readout of approximate layer bitmap + texture cache bytes; warn before OOM on 4K stacks.

## Out of scope

- WebGPU compositor
- React rewrite
- Large fixture commits

## What landed (this PR)

| Item | Status |
|------|--------|
| Plan doc (this file) | Done |
| Bake CSS color `layer.filters` (brightness, contrast, hue-rotate, saturate, grayscale, invert, sepia) on texture upload | Done |
| Bake **blur** + **shadow** (`drop-shadow`) with padded bake canvas so bleed is not clipped; expand draw quad via existing `texInfo.pad` | Done |
| Bake **outer_glow** as CSS `drop-shadow(0 0 r color)` with padding | Done |
| Bake **stroke** + **inner_glow** via Canvas2D multipass on upload (keeps stack on WebGL) | Done |
| hard-light + color-dodge blends | Done |
| soft-light + color-burn + exclusion blends | Done |
| **source-atop** clipping on GPU (Porter-Duff vs FB); Canvas2D fallback when clip base has alpha-expanding filters (blur/shadow/outer_glow/stroke) | Done |
| WebGL viewport-only reuse (`invalidate({ viewport: true })` → skip `render_layers` when full-scale composite is valid) | Done |
| Memory budget UI (status-bar Mem MB; soft warn ≥256 MB + toast; hint to purge undos / flatten) | Done |
| Pure GPU separable blur (no Canvas2D bake) | **Deferred** |

## Why blur/shadow/glow bake (not a full GPU blur pass)

True multi-pass Gaussian blur needs extra FBOs, separable H/V passes, and radius-dependent kernel work. Drop-shadow / outer-glow additionally need offset + tint + composite-under. PhotoChop already applies these as **CSS `filter`** on Canvas2D; baking that same filter into the upload texture (with padding so the Gaussian/shadow bleed is not clipped) keeps the **stack on the WebGL compositor** without a second blur pipeline. Stroke and inner glow are custom multipass Canvas2D effects baked the same way (layer-local), not a single CSS filter string.

## source-atop correctness note

GPU source-atop samples the current framebuffer alpha (Porter-Duff). That matches Canvas2D for simple clip groups when the clip base silhouette matches the FB contribution. If the clip **base** has blur / drop-shadow / outer_glow / stroke baked in, FB alpha is larger than the true clip silhouette — `can_render_layers` returns false and Canvas2D takes over.

## Smoke

- Raster layer + brightness/contrast (or hue-rotate) filter stays on WebGL
- Blur / drop-shadow / outer_glow stay on WebGL (padded bake); stroke + inner_glow stay on WebGL (multipass bake)
- soft-light / color-burn / exclusion / hard-light / color-dodge look sane vs Canvas2D
- Simple source-atop clip (no spatial filters on base) stays on WebGL; clip base + drop-shadow falls back to Canvas2D
- Pan / navigator move with WebGL stack does **not** replay every layer (reuse offscreen composite); layer edit still rebuilds
- Status bar shows Mem MB; push layers toward ≥256 MB → soft warn styling + toast
- PSD open/save unchanged
- Hard-reload twice; SW key `photochop-shell-v22`

## SW

Bump `photochop-shell-v21` → `v22` with this land (`dist/bundle.js` / `dist/styles.css` changed).
