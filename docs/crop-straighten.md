# Crop Straighten

Photoshop-like straighten while the **Crop** tool is active (`fix/crop-tool`).

## User steps

1. Open an image and activate the **Crop** tool (full-canvas crop + shield).
2. On the options bar, click the **Straighten** toggle (rotate icon) — a toast prompts you to draw a line.
3. Drag a reference line along a horizon, building edge, or other feature that should be horizontal or vertical.
4. On mouse-up:
   - The document rotates so the line snaps to the **nearest axis** (horizontal or vertical).
   - The canvas expands to fit the rotated content.
   - The crop rectangle re-fits to cover the (aspect-aware) canvas.
   - Straighten mode disarms automatically (one-shot, like PS).
5. Optionally nudge **Angle** (−45°…45°, 0.1° steps) on the options bar to apply an additional rotation.
6. Adjust the crop handles / aspect as usual, then **Enter** / **Commit Crop** (still destructive). **Escape** cancels straighten arming or resets the crop rect.

## Behavior notes

- Image layers are **baked** (pixels rotated, `rotate` reset to 0) so Commit Crop still works.
- Text / shape / other positioned layers get geometric `x/y` + `rotate` updates (same constraint as Image → Rotate: Commit Crop still errors until those layers are rasterized).
- Existing crop UX is unchanged when Straighten is off: full-canvas init, aspect lock, PS shield/handles, Enter / Escape / Commit.
- Move / Select layer rotation is untouched (`enable_rotation` remains false only on the crop selection settings).

## Limitations vs Photoshop

| Area | This build | Photoshop |
|------|------------|-----------|
| Straighten UI | Options-bar toggle + Angle field | Straighten tool in Crop options; protractor cursor |
| Live preview while dragging the line | Line overlay only (no live image rotate) | Often live-rotates the preview |
| Crop rect during straighten | Re-fit to full canvas after apply | May keep / transform the prior crop quad |
| Non-destructive / Hide pixels | Still deferred (commit deletes) | Hide vs Delete cropped pixels |
| Layer masks | Baked into image appearance via `render_object`; mask object not re-warped separately | Masks transform with the document |
| Content-Aware fill of empty corners | Transparent / expanded canvas only | Optional content-aware |
| Multi-straighten undo | Each apply is one undo step (`Crop Straighten`) | Same idea |

## Files

- `src/js/tools/crop.js` — straighten mode, line overlay, document rotate + re-fit
- `src/js/config.js` — `straighten` + `angle` attributes
- `src/js/core/base-selection.js` — optional `after_draw` hook for the reference line
