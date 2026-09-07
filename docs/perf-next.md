# Performance next — GPU filters, blends, cache, memory

**Branch:** `feature/perf-gpu-adj`
**Parent:** master @ after PR #25 (`docs/perf-spike.md`)

## Goals (priority order)

1. **Layer filters on GPU** — move common CSS-like filters (blur is hard; start with brightness/contrast/hue-rotate/saturate/grayscale/invert/sepia already used as layer.filters) onto the WebGL path so `can_render_layers` no longer falls back for those stacks.
2. **More blend modes** — soft-light, hard-light, color-dodge (and easy cousins) via the existing dst-snapshot shader path.
3. **Dirty-rect / cache polish** — reuse last WebGL composite bitmap on viewport-only frames (pan/zoom) instead of replaying the full layer stack every time.
4. **Memory budget UI** — lightweight HUD or Details readout of approximate layer bitmap + texture cache bytes; warn before OOM on 4K stacks.

## Out of scope

- WebGPU compositor
- React rewrite
- Large fixture commits

## This PR (first slice)

- Plan doc (this file)
- GPU path for **layer.filters** that map to the same shader ops as adjustments (brightness, contrast, hue-rotate, saturate, grayscale, invert, sepia) applied when sampling the layer texture — keep Canvas2D fallback for blur and unknown filters
- Expand `can_render_layers` accordingly
- Also: hard-light + color-dodge blend modes

## Smoke

- Raster layer with brightness/contrast (or hue-rotate) filter stays on WebGL
- Blur filter still forces Canvas2D
- PSD open/save unchanged
