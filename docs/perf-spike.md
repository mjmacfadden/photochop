# Performance spike — plan & discipline

**Branch:** `feature/perf-spike`  
**Goal:** Measure first, then land low-risk architectural wins. Do **not** start WebGPU or a React rewrite on this spike. Do **not** break PSD open/save.

Related: root `PERFORMANCE.md` (completed worklog).

---

## Plan order

1. **Measure 2K/4K fixtures** — establish baseline open / composite / pan-zoom / brush numbers before optimizing.
2. **PSD memory + lazy `ag-psd`** — keep PSD out of the critical boot path; avoid dual canvas + dataURL on import.
3. **WebGL mask/blend slice** — only after (1)–(2) show mask/blend paths dominate frame time.
4. **Interactive quality tier** — lower-fidelity interactive composite while dragging; full quality on commit (landed — half-res while dragging).

---

## What landed in the foundation PR

| Item | Status |
|------|--------|
| `docs/perf-spike.md` (this plan) | Done |
| `scripts/perf-baseline.mjs` (Node checklist + browser console helpers) | Done |
| Dynamic `import()` of `psd.js` from File Open / Save | Done |
| Dynamic `import()` of `ag-psd` on first PSD open/save (`ensure_ag_psd`) | Done |
| Confirm import uses live canvas `link` + `data: null` (no `toDataURL` dual bitmap) | Done (removed unused `safeToDataURL`) |
| `[PSD][perf]` `performance.now()` logs around ag-psd load / parse / write | Done |
| Service worker `CACHE_NAME` bump | Done — foundation `v16` → `v17`; mask-blend `v17` → `v18`; this land `v18` → `v19` (shell `dist/bundle.js` changed) |
| WebGL mask/blend slice | Done (partial) — mask sampling + multiply/screen/overlay shaders; see below |
| Interactive quality tier | **DONE** — half-res WebGL while Move/transform/crop drag; full on idle |
| WebGPU / React rewrite | Out of scope |

## How to measure

### A. Node harness

Run:

    node scripts/perf-baseline.mjs
    node scripts/perf-baseline.mjs path/to/fixture.psd

Node cannot run the editor compositor (DOM canvas + webpack app graph). The script prints a checklist, prints browser console helpers to copy-paste, and — if you pass a .psd — times a Node-side ag-psd readPsd with useCanvas:false (parse-only; no bitmap decode). Treat that as a lower bound for parse cost, not full open cost.

### B. Browser console helpers

After `npm run server` (or production shell), open DevTools console and paste the helpers emitted by `scripts/perf-baseline.mjs` (section "Browser console helpers").

Useful calls once pasted:

- `__pcPerf.timeRender()` — force and time `Layers.render(true)`
- `__pcPerf.mem()` — Chrome `performance.memory` snapshot when available

PSE open/save already logs `[PSD][perf]` with `agPsdLoadMs` / `parseMs` / `writeMs`.

### C. Chrome Performance panel — named scenarios

Record with CPU 4x slowdown optional for laptop-class stress. Capture Memory separately for PSD open.

| Scenario ID | Steps | What to note |
|------------|-------|-----------|
| `S1_boot` | Cold load editor shell (empty doc) | Main-thread long tasks; bundle.js + CSS; confirm ag-psd / psd chunks not loaded |
| `S2_open_2k0` | File Open a ~2K PSD (or create 2048x2048, N layers) | Time to first paint after open; heap delta; [PSD][perf] |
| `S3_open_4k` | Same for ~4K | Same metrics; watch OOM / GC |
| `S4_composite_idle` | After open, pan/zoom only | Idle frames should be near-zero render (demand-driven) |
| `S5_composite_force` | Run `__pcPerf.timeRender()` x5 | Median Layers.render(true) ms |
| `S6_brush` | Brush stroke on raster layer | Input latency / frame drops |
| `S7_mask_blend` | Toggle layer mask / non-normal blend | Cost vs normal layers (feeds step 3) |

Record results in a short table (date, machine, Chrome version, fixture name, ms / MB). Prefer fixtures under a local `fixtures/` folder (gitignored if large); do not commit multi-MB PSDS without agreement.

### Suggested fixture set (local)

- `fixtures/perf-2k-flat.psd` — single raster ~2048^2
- `fixtures/perf-2k-layers.psd` — 10-30 layers + 1-2 masks
- `fixtures/perf-4k-layers.psd` — same structure at ~4096^2

---

## Service worker `CACHE_NAME` bump discipline

File: `service-worker.js` — current name pattern `photochop-shell-vNN`.

**Bump `CACHE_NAME` whenever published app-shell assets change in a way users must receive** (typically `dist/bundle.js`, `dist/styles.css`, `index.html`, or `APP_SHELL` entries). The activate handler deletes prior `photochop-shell-*` keys != current name.

Rules:

1. **One bump per release that changes shell bytes** — do not bump on pure docs/script PRs that do not alter precached URLs.
2. **Bump in the same commit** that changes `dist/` or other `APP_SHELL` paths destined for production.
3. **Never** reuse an old `vNN` after it has shipped — clients may keep a stale cache entry.
4. **Do not** precache user documents, PSD fixtures, or third-party CDNs.
5. After bumping, smoke: hard-reload twice; confirm Network shows updated shell and old cache key is gone (Application → Cache Storage).

This foundation PR bumps SW because committed `dist/bundle.js` (APP_SHELL) changed with lazy PSD chunks. When a later perf PR ships new `dist/` chunks (e.g. `ag-psd` async chunk hashed into runtime), bump then if the production deploy updates precached shell files. Webpack async chunks load via `publicPath` and are **not** listed in `APP_SHELL` today — first PSD open still hits network/disk for the chunk; that is expected.

---

## What landed in the WebGL mask/blend slice

| Item | Status |
|------|--------|
| Document-space mask sampling in WebGL frag shader (luminance; outside rect hides) | Done |
| Linked-mask rotation (inverse-rotate around layer center) | Done |
| multiply / screen / overlay via shader + `copyTexImage2D` dst snapshot | Done |
| `can_render_layers` allows masks + GPU blends + supported adjustments | Done |
| GPU adjustments (brightness/contrast, hue-sat, exposure, grayscale, invert, sepia, threshold) | **DONE** (source-over; Canvas2D fallback otherwise) |
| WebGL blends darken / lighten / difference | **DONE** |
| Other blend / Porter-Duff (soft-light, hard-light, color-dodge, source-atop, …) | **DEFERRED** → next branch |
| Layer filters on GPU | **DEFERRED** → next branch |

**Smoke for Mike:** open a doc with masks + multiply/screen/overlay/darken; add brightness or hue-sat adj (source-over) — stay on WebGL. Drag Move on a large layer — softer while dragging, sharp on release. Toggle a layer filter or source-atop clip — expect Canvas2D fallback. Hard-reload twice after deploy; SW key should be `photochop-shell-v19`.

## Deferred (explicit)

- Remaining blend modes (soft-light, hard-light, color-dodge, …) + source-atop clipping on GPU
- Layer filters (effect stack) on GPU
- Dirty-rect / WebGL composite cache polish (viewport-only reuse)
- Memory budget UI
- WebGPU compositor
- React (or other) UI rewrite
- Histogram/worker follow-ons beyond what `PERFORMANCE.md` already shipped
- Committing large binary fixtures

## Next steps

See `docs/perf-next.md` on `feature/perf-gpu-adj` after this PR merges: remaining GPU filters/blends, dirty-rect/cache polish, memory budget UI.

Measure → decide → only then deepen the compositor.
