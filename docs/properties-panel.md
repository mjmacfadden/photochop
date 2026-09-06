# Properties panel (adjustment params)

## What it is
The right-sidebar **Adjustments** block is now tabbed (same chrome as Color / Swatches):

- **Adjustments** — create adjustment layers (icon grid).
- **Properties** — edit parameters for the **selected adjustment layer**.

This PR is **adjustments only**. A generic Inspector for every layer type is intentionally out of scope.

## Behavior
- Select an adjustment layer (layers panel, thumb, or create from Adjustments / status bar) → Properties shows that type’s sliders + number inputs (Brightness/Contrast, Hue/Saturation, Exposure, Threshold, Blur, etc.).
- Select a non-adjustment layer (or nothing relevant) → placeholder: **“Select an adjustment”**.
- Dragging a slider / typing a value updates the layer **live** (document invalidate + render). Releasing / committing records a single `Update_layer_action` for undo/redo (same pattern as layer opacity).
- **Properties is the source of truth** when editing. Double-click / “Edit Adjustment…” / create-then-edit opens the Properties tab instead of the old modal dialog. The modal remains as a fallback via `edit(id, { force_modal: true })` if Properties GUI is unavailable.

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
- No automatic switch to Properties on every single-click select (only when creating/editing); selecting an adjustment still refreshes Properties content if that tab is open.

## Smoke steps (when back at the machine)
1. Open an image; confirm Adjustments block shows **Adjustments | Properties** tabs.
2. Click Brightness in Adjustments → new layer selected, Properties tab opens with Brightness/Contrast sliders.
3. Drag Brightness → canvas updates live; Undo restores prior params.
4. Select Background → Properties shows “Select an adjustment”.
5. Re-select the adjustment layer; open Properties tab → controls match current params.
6. Status-bar adjustment menu → Gaussian Blur / Threshold → Properties shows the right controls.
7. Confirm Color/Swatches tabs and Layers panel still behave as before.
