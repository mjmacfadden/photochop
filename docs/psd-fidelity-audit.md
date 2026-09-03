# PSD Fidelity Audit (Phase A leftovers + FX/adjustments)

**Branch:** `feature/psd-fidelity`  
**Date:** 2026-09-02 (America/Chicago)  
**Scope:** Code audit of `src/js/libs/psd.js` (+ layer styles / adjustment modules). **No Photoshop verification claimed.**  
**Ground truth:** `ag-psd` read/write via `load_psd` / `export_psd`; VP open→edit→save→reopen is the offline oracle until PS tomorrow.

---

## 1. Layer effects / FX

| Effect | Import (`convert_psd_effects_to_filters`) | Export (`export_layer_to_psd`) | Notes |
|--------|-------------------------------------------|--------------------------------|-------|
| Drop Shadow | **Supported** → filter `shadow` (angle→x/y, size, opacity, color) | **Supported** (`shadow` / `drop-shadow` → `effects.dropShadow[]`) | Best round-trip of the FX set |
| Outer Glow | **Supported** → `outer_glow` (size, opacity, color) | **Supported** | Round-trip via Layer Style |
| Inner Glow | **Supported** → `inner_glow` | **Supported** | Same |
| Stroke | **Supported** → `stroke` (size, opacity, color, **position**) | **Supported** | Position outside/inside/center |
| Bevel & Emboss | **Missing** | **Missing** | Not in converter |
| Satin / Overlay (color/gradient/pattern) | **Missing** | **Missing** | ag-psd may expose some; we ignore |
| Effects master disable | **Partial** (`effects.disabled` → skip all) | N/A | Per-effect `enabled: false` skipped on import |

**Export:** drop shadow, outer/inner glow, and stroke write back (as of Landed).

---

## 2. Adjustment layers

| PSD / VP type | Import | Export | Notes |
|---------------|--------|--------|-------|
| brightness/contrast | **Supported** → `adjustment_type: brightness` + `brightness`/`contrast` params | **Supported** | Uses `params.value` + `params.contrast` |
| contrast (VP-only type) | N/A (created in app) | **Supported** → brightness/contrast with brightness 0 | |
| hue/saturation | **Supported** → `hue-saturation` (hue+sat+lightness from `master`) | **Supported** | Legacy `hue-rotate` / `saturate` still export |
| invert | **Supported** | **Supported** | |
| threshold | **Supported** | **Supported** | |
| black & white | **Partial** → `grayscale` (no channel mix) | **Supported** as `black & white` | Lossy vs PS B&W |
| exposure | **Supported** → `exposure` (exposure/offset/gamma) | **Supported** | ag-psd `exposure`, `offset`, `gamma`; canvas `c*2^e+offset` then `pow(c,1/γ)` |
| levels / curves / color balance / vibrance / etc. | **Missing** (default stub → brightness 0) | **Missing** | Silent no-op on unknown `adj.type` |
| sepia (VP-native) | **Partial** ← photo filter approx | **Supported** → photo filter | Density ↔ sepia value |
| blur | N/A (Effects → Common Filters → Gaussian Blur) | N/A | Removed from adjustments; no PSD adj export |

---

## 3. Clipping + blend coexistence

**Current model:** clipping and blend share one field.

- Import: `isClipping ? composition = 'source-atop' : blendMode` (leaf + group).
- Export: `clipping = (composition === 'source-atop')`; `blendMode = COMPOSITION_TO_PSD[composition] || 'normal'`.
- `COMPOSITION_TO_PSD['source-atop'] = 'normal'` with comment “Handled via clipping: true”.

**Result:** a clipped layer that also used Multiply/Screen/etc. loses the blend on import (forced to source-atop). On export, clipped layers always write blendMode `normal`. This is the documented Phase B blocker (roadmap §2.2 / §5).

**Also:** several PS blends map lossily on import (`linear burn`→`multiply`, `vivid light`/`linear light`/`hard mix`→`hard-light`, `subtract`/`divide`→`difference`). Those map back only if VP still holds a Canvas2D-native mode.

---

## 4. Phase A leftovers (roadmap)

| Item | Status in code | Detail |
|------|----------------|--------|
| Groups nested import/export | **Done** | `import_psd_nodes` + `build_psd_children_tree` |
| Bundle `asLayers` inserts | **Done** | Single `Bundle_action('open_psd_as_layers', …)`. |
| Avoid `safeToDataURL` when canvas `link` exists | **Done** | Raster + composite fallback set `data: null` when `link` is present. |

---

## 5. Import / Export summary

### Import

| Area | Supported | Partial | Missing |
|------|-----------|---------|---------|
| Structure | Groups, order, opacity, visibility, masks, text styleRuns | Blend map (lossy modes) | Smart objects, vectors/paths, CMYK/16-bit honesty UX |
| FX | Drop shadow, outer/inner glow, stroke (basic params) | Stroke position; multi-shadow OK | Bevel, satin, overlays |
| Adjustments | Brightness/contrast, invert, threshold, exposure, hue/sat | B&W→grayscale; sepia↔photo filter | Levels, curves, vibrance, etc. |
| Clipping | Flag read | Overwrites blend into `source-atop` | True clip+blend |

### Export

| Area | Supported | Partial | Missing |
|------|-----------|---------|---------|
| Structure | Nested groups, masks, text, composite via `app.Layers` | Lossy blend set | Smart objects |
| FX | Drop shadow | — | Outer/inner glow, stroke, other FX |
| Adjustments | Brightness/contrast, invert, threshold, grayscale→B&W, hue/sat, sepia, exposure | — | Levels/curves/etc. (blur is Effects-only) |
| Clipping | `clipping: true` when composition is source-atop | Always pairs with blendMode normal | Coexistent non-normal blend |

---

## 6. What we can verify WITHOUT Photoshop

Vantage Point **open → edit → save PSD → reopen in VP** (and visual/compositor checks):

1. **Drop shadow** round-trip (params survive reopen; render looks consistent).
2. **Outer/inner glow + stroke** *import* from fixtures written by ag-psd/Photopea (if we have files); after export, confirm they are **lost** until export parity lands — still a VP-verifiable regression test once we add export.
3. **Brightness/contrast, invert, threshold, grayscale** adjustment create → export → reopen type/params.
4. **Hue-rotate / saturate** create in VP → export → reopen: expect **loss** today (documents the gap).
5. **`asLayers` undo:** Open PSD as layers → one Undo should not leave half the stack (fails today).
6. **Memory/behavior:** large PSD open without forcing `data` dataURL when `link` canvas is present (after fix: heap / layer model inspection).
7. **Clipping-only** layers: `source-atop` export → reopen still clipped.
8. **Clip + non-normal blend** fixture: confirm blend is dropped on import (documents debt; full fix needs model change, still VP-testable with synthetic layers).
9. **Groups** nested visibility/opacity/pass-through flags round-trip in VP (already implemented; re-smoke).

---

## 7. What MUST wait for Photoshop (tomorrow)

- Pixel/composite parity vs Adobe renderer (FX softness, blend math, adjustment curves).
- Whether ag-psd-written glow/stroke/adjustment descriptors open cleanly in PS (library write fidelity).
- Font substitution / text metrics vs PS.
- Smart object preservation behavior in PS (explicitly out of this branch’s coding scope).
- CMYK / 16-bit / PSB open warnings vs silent flatten.

Do **not** mark any item in §6 as “Photoshop verified.”

---

## 8. Recommended fix order (next 1–3 coding tasks)

Smallest high-impact first; **all VP-verifiable** (no PS required):

1. **Skip `safeToDataURL` when `link` canvas already exists** on raster (and composite fallback) import — keep `data` null/omit unless something downstream requires a dataURL. Quick win: memory + import speed; verify by opening a multi-layer PSD and checking layer objects / heap.
2. **Bundle `asLayers` inserts** into one `Bundle_action('open_psd_as_layers', …)` wrapping the `Insert_layer_action` list — verify single Undo removes the whole import.
3. **Effects export parity for filters VP already has:** map `outer_glow` / `inner_glow` / `stroke` → `psdLayer.effects` (mirror drop-shadow export shape). Verify: add FX in VP → export PSD → reopen in VP → filters restored.

**Next after those (still VP-first, slightly larger):**

4. Export `hue-rotate` / `saturate` → PSD `hue/saturation` (and tighten import to preserve both channels when possible).  
5. Clipping + blend coexistence: separate `clipping` boolean from `composition` (model + compositor + psd.js).

**Out of scope for this pass:** smart objects.

---

---

## Landed (2026-09-02, VP / Photopea-first)

Branch work after the initial audit. **Photopea is the interim oracle; Photoshop verification still tomorrow.**

### Phase A
- **Skip `safeToDataURL` when raster `link` canvas exists** — import sets `data: null` for layered rasters and the composite fallback (keeps `link`).
- **Bundle `asLayers` inserts** — `open_psd_as_layers` `Bundle_action` wraps all `Insert_layer_action`s (single Undo).

### Effects
- **Export** `outer_glow` → `effects.outerGlow`, `inner_glow` → `effects.innerGlow`, `stroke` → `effects.stroke[]` (same ag-psd shapes as import / drop-shadow export).
- **Stroke `position`** (outside / inside / center) imported + exported when present; Layer Style UI already stored it (size range widened to 100px).

### Adjustments
- **Hue/Saturation** unified type `hue-saturation` (params: `hue` −180…180, `saturation` −100…100, `lightness` −100…100). Compositor: CSS `hue-rotate` + `saturate` (+ `brightness` for lightness).
- **PSD import** maps `hue/saturation` `master` (and legacy top-level) to **both** channels (no longer hue≠0 drops sat).
- **PSD export** writes `hue/saturation` from `hue-saturation` **and** legacy `hue-rotate` / `saturate` layers.
- **Sepia** exports as `photo filter` (warm brown + density); `photo filter` imports approximate as `sepia`.
- **Blur** — removed from New Adjustment Layer; lives under **Effects → Common Filters → Gaussian Blur** (destructive layer filter). No PSD adjustment export.
- **Exposure** — first-class adjustment (`exposure` / `offset` / `gamma`); canvas compositor (not CSS); PSD import/export via ag-psd `type: 'exposure'`.

### Still open / unchanged
- Clipping + blend coexistence (model change).
- Bevel / satin / overlays; levels / curves / vibrance / etc.
- Smart objects (out of scope).
- Pixel parity vs Photoshop renderer.

## 9. Key paths

| Path | Role |
|------|------|
| `src/js/libs/psd.js` | Import/export, FX/adjustment converters |
| `src/js/modules/layer/styles.js` | VP FX UI (shadow, glows, stroke) |
| `src/js/modules/layer/adjustment.js` | VP adjustment types |
| `src/js/modules/file/open.js` | `asLayers: true` call site |
| `docs/VANTAGE_POINT_ROADMAP.md` | Phase A/B checklist |

*Audit only — no Photoshop claims.*
