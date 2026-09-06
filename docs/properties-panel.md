# Properties panel

## What it is
The right-sidebar **Adjustments** block is tabbed (same chrome as Color / Swatches):

- **Adjustments** — create adjustment layers (icon grid).
- **Properties** — edit parameters for the **selected adjustment layer**, or **Type tool options** for a **selected text layer**.

## Behavior

### Adjustments
- **Add Adjustment** (Adjustments grid, Layer → New Adjustment Layer, or status-bar menu) → creates the layer, selects it, and opens the **Properties** tab with that type’s controls. **No modal/popup.**
- **Select** an existing adjustment layer (layers panel row, thumb, or “Edit Adjustment…”) → Properties tab focuses with that type’s sliders + number inputs. If the Adjustments block was collapsed/hidden, it is auto-shown.
- Dragging a slider / typing a value updates the layer **live** (document invalidate + render). Releasing / committing records a single `Update_layer_action` for undo/redo (same pattern as layer opacity).
- **Properties is the only UI for adjustment settings** on create and on edit/select. The old adjustment modal/dialog is retired. `edit(id, { force_modal: true })` is accepted for API compatibility but **ignored** (no popup).

### Text / Type tool options
- When a **text layer** is selected **and** the Properties tab is already open (or the user opens Properties with text selected), Properties shows the same controls as the Type tool options bar.
- **Do not** auto-show Properties just because the Type tool is selected, or just because a text layer was selected. Unlike adjustments, text never forces the tab open.
- Controls are **two-way bound** with the Type options bar (and `config.TOOLS` text attributes): changing either side updates the other. The Type options bar itself is unchanged.
- Selecting a non-adjustment / non-text layer (or nothing relevant) → placeholder: **“Select an adjustment or text layer”** (tab content refreshes; tab is not forced away).

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

## Type controls mirrored in Properties
Same attributes as the Type tool options bar (`config.TOOLS` → `text`):

| Control | Notes |
|---------|--------|
| Font | family list (Google / system / custom) |
| Size | pt (supports fractional input step) |
| Weight | faces for current family |
| Style | Bold, Italic, Underline, Strikethrough toggles |
| Fill | color |
| Align | Left / Center / Right / Justify (Justify disabled for Point text) |
| Kerning | number |
| Leading | number |
| Mode | Point / Paragraph |

## Still placeholder / not in this PR
- **Levels** (and other Photoshop-style adjustments not yet in the app).
- Generic Inspector for every other layer type (position, styles, masks, etc.) — use Layer Details / existing UIs.

## Smoke steps (when back at the machine)
1. Open an image; confirm Adjustments block shows **Adjustments | Properties** tabs.
2. Click Brightness in Adjustments → new layer selected, Properties tab opens with Brightness/Contrast sliders (**no popup**).
3. Drag Brightness → canvas updates live; Undo restores prior params.
4. Select Background → Properties shows “Select an adjustment or text layer”.
5. Re-select the adjustment layer (row or thumb) → Properties tab opens/focuses with matching controls.
6. Hide/collapse the Adjustments block, then select/create an adjustment → block unhides and Properties shows.
7. Status-bar adjustment menu → Gaussian Blur / Threshold → Properties shows the right controls; no modal.
8. Create/select a **text** layer with Properties **closed** (Adjustments tab, or block collapsed) → Properties must **not** auto-open. Switch to Type tool → still must not auto-open Properties.
9. Open Properties with a text layer selected → Type controls appear (Font, Size, Weight, Style, Fill, Align, Kerning, Leading, Mode).
10. Change Size in Properties → canvas + Type options bar update; change Font in options bar → Properties Font/Weight update.
11. Point text: Justify disabled in Properties (and options bar). Switch Mode to Paragraph → Justify enabled.
12. Confirm Color/Swatches tabs and Layers panel still behave as before.
