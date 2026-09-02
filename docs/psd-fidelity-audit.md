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
| Outer Glow | **Supported** → `outer_glow` (size, opacity, color) | **Missing** | VP UI exists (`styles.js` / `effects/common/outer_glow.js`) |
| Inner Glow | **Supported** → `inner_glow` | **Missing** | Same |
| Stroke | **Supported** → `stroke` (size, opacity, color) | **Missing** | Position / fillType not mapped on import |
| Bevel & Emboss | **Missing** | **Missing** | Not in converter |
| Satin / Overlay (color/gradient/pattern) | **Missing** | **Missing** | ag-psd may expose some; we ignore |
| Effects master disable | **Partial** (`effects.disabled` → skip all) | N/A | Per-effect `enabled: false` skipped on import |

**Export gap:** only drop shadow is written back. Import creates filters that VP can render, but save drops glow/stroke metadata.

---

## 2. Adjustment layers

| PSD / VP type | Import | Export | Notes |
|---------------|--------|--------|-------|
| brightness/contrast | **Supported** → `adjustment_type: brightness` + `brightness`/`contrast` params | **Supported** | Uses `params.value` + `params.contrast` |
| contrast (VP-only type) | N/A (created in app) | **Supported** → brightness/contrast with brightness 0 | |
| hue/saturation | **Partial** → either `hue-rotate` *or* `saturate` (never both; hue≠0 wins) | **Missing** | Roadmap Phase B explicitly calls this out |
| invert | **Supported** | **Supported** | |
| threshold | **Supported** | **Supported** | |
| black & white | **Partial** → `grayscale` (no channel mix) | **Supported** as `black & white` | Lossy vs PS B&W |
| levels / curves / exposure / color balance / photo filter / vibrance / etc. | **Missing** (default stub → brightness 0) | **Missing** | Silent no-op on unknown `adj.type` |
| sepia / blur (VP-native) | N/A | **Missing** | Exist in `layer/adjustment.js` UI only |

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
| Bundle `asLayers` inserts | **Open** | `load_psd(..., { asLayers: true })` loops `Insert_layer_action` per layer (psd.js ~220–225); `open.js` “Open as Layer” path. Undo = N steps, not one. Elsewhere `Bundle_action` is the pattern. |
| Avoid `safeToDataURL` when canvas `link` exists | **Open** | Raster path always sets `link: canvas` **and** `data: safeToDataURL(canvas)` (convert + composite fallback). Dual bitmap + dataURL spikes memory (roadmap §7). |

---

## 5. Import / Export summary

### Import

| Area | Supported | Partial | Missing |
|------|-----------|---------|---------|
| Structure | Groups, order, opacity, visibility, masks, text styleRuns | Blend map (lossy modes) | Smart objects, vectors/paths, CMYK/16-bit honesty UX |
| FX | Drop shadow, outer/inner glow, stroke (basic params) | Stroke position; multi-shadow OK | Bevel, satin, overlays |
| Adjustments | Brightness/contrast, invert, threshold | Hue/sat (split), B&W→grayscale | Levels, curves, exposure, etc. |
| Clipping | Flag read | Overwrites blend into `source-atop` | True clip+blend |

### Export

| Area | Supported | Partial | Missing |
|------|-----------|---------|---------|
| Structure | Nested groups, masks, text, composite via `app.Layers` | Lossy blend set | Smart objects |
| FX | Drop shadow | — | Outer/inner glow, stroke, other FX |
| Adjustments | Brightness/contrast, invert, threshold, grayscale→B&W | — | Hue-rotate, saturate, sepia, blur |
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

## 9. Key paths

| Path | Role |
|------|------|
| `src/js/libs/psd.js` | Import/export, FX/adjustment converters |
| `src/js/modules/layer/styles.js` | VP FX UI (shadow, glows, stroke) |
| `src/js/modules/layer/adjustment.js` | VP adjustment types |
| `src/js/modules/file/open.js` | `asLayers: true` call site |
| `docs/VANTAGE_POINT_ROADMAP.md` | Phase A/B checklist |

*Audit only — no Photoshop claims.*
