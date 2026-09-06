# Properties panel (adjustment params)

## What it is
The right-sidebar **Adjustments** block is now tabbed (same chrome as Color / Swatches):

- **Adjustments** — create adjustment layers (icon grid).
- **Properties** — edit parameters for the **selected adjustment layer**.

This PR is **adjustments only**. A generic Inspector for every layer type is intentionally out of scope.

## Behavior
- **Add Adjustment** (Adjustments grid, Layer → New Adjustment Layer, or status-bar menu) → creates the layer, selects it, and opens the **Properties** tab with that type’s controls. **No modal/popup.**
- **Select** an existing adjustment layer (layers panel row, thumb, or “Edit Adjustment…”) → Properties tab focuses with that type’s sliders + number inputs. If the Adjustments block was collapsed/hidden, it is auto-shown.
- Select a non-adjustment layer (or nothing relevant) → placeholder: **“Select an adjustment”** (tab content refreshes; tab is not forced away).
- Dragging a slider / typing a value updates the layer **live** (document invalidate + render). Releasing / committing records a single `Update_layer_action` for undo/redo (same pattern as layer opacity).
- **Properties is the only UI for adjustment settings** on create and on edit/select. The old adjustment modal/dialog is retired. `edit(id, { force_modal: true })` is accepted for API compatibility but **ignored** (no popup).

## Wired adjustment types
From `layer/adjustment` `ADJUSTMENT_TYPES`:

| Type | Params |
|------|--------|
| brightness | brightness %, contrast % |
| contrast | percentage |
| hue-saturation | hue, saturation, lightness |
| hue-rotate (legacy) | degree |
| saturate (legacy) | percentage |
| grayscale | percentage |
| sepia | percentage |
| invert | percentage |
| exposure | exposure, offset, gamma |
| blur | radius (px) |
| threshold | threshold level |

## Still placeholder / not in this PR
- **Levels** (and other Photoshop-style adjustments not yet in the app).
- Non-adjustment layer properties (position, type, styles, masks, etc.) — use Layer Details / existing UIs.

## Smoke steps (when back at the machine)
1. Open an image; confirm Adjustments block shows **Adjustments | Properties** tabs.
2. Click Brightness in Adjustments → new layer selected, Properties tab opens with Brightness/Contrast sliders (**no popup**).
3. Drag Brightness → canvas updates live; Undo restores prior params.
4. Select Background → Properties shows “Select an adjustment”.
5. Re-select the adjustment layer (row or thumb) → Properties tab opens/focuses with matching controls.
6. Hide/collapse the Adjustments block, then select/create an adjustment → block unhides and Properties shows.
7. Status-bar adjustment menu → Gaussian Blur / Threshold → Properties shows the right controls; no modal.
8. Confirm Color/Swatches tabs and Layers panel still behave as before.
