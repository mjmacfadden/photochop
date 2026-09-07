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
| hard-light + color-dodge blends | Done |
| soft-light + color-burn + exclusion blends | Done |
| WebGL viewport-only reuse (`invalidate({ viewport: true })` → skip `render_layers` when full-scale composite is valid) | Done |
| Memory budget UI | **Deferred** |
| Pure GPU separable blur (no Canvas2D bake) / inner-outer glow / stroke on GPU | **Deferred** |
| source-atop clipping on GPU | **Deferred** |

## Why blur/shadow bake (not a full GPU blur pass)

True multi-pass Gaussian blur needs extra FBOs, separable H/V passes, and radius-dependent kernel work. Drop-shadow additionally needs offset + tint + composite-under. PhotoChop already applies these as **CSS `filter`** on Canvas2D; baking that same filter into the upload texture (with padding so the Gaussian/shadow bleed is not clipped) keeps the **stack on the WebGL compositor** without a second blur pipeline. Inner/outer glow and stroke stay Canvas2D — they are custom multi-canvas effects, not a single CSS filter string.

## Smoke

- Raster layer + brightness/contrast (or hue-rotate) filter stays on WebGL
- Blur / drop-shadow filter stays on WebGL (padded bake); inner/outer glow still Canvas2D
- soft-light / color-burn / exclusion / hard-light / color-dodge look sane vs Canvas2D
- Pan / navigator move with WebGL stack does **not** replay every layer (reuse offscreen composite); layer edit still rebuilds
- PSD open/save unchanged
- Hard-reload twice; SW key `photochop-shell-v21`

## SW

Bump `photochop-shell-v20` → `v21` with this land (`dist/bundle.js` changed).
