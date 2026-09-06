# Type Tool — Photoshop Parity Spec (Acceptance Checklist)

**Branch:** `feature/local-font-access` · **Scope:** point vs paragraph text, align, transform, size UI  
**Out of scope:** type on a path, warp/perspective free-transform, vertical type, last-line justify variants

This document is the acceptance checklist for PR #21 smoke fixes. Prefer rewriting tangled align / transform-bake / box-resize paths over stacking more patches.

---

## 1. Models

### 1.1 Point text (`params.boundary === 'dynamic'`)
- Created by a **click** (drag below create threshold).
- No wrap frame: text is a single run per hard line; width/height follow glyph bounds.
- **Anchor** (`params.anchor_x`, `params.anchor_y`): fixed point the alignment refers to.
- Transform handles **scale typography** (font size, and optional horizontal scale when skewed).
- Justify is **disabled**.

### 1.2 Paragraph / box text (`params.boundary === 'box'`)
- Created by **click-drag** past the create threshold (~8px).
- Fixed frame (`layer.x/y/width/height`); text **wraps/reflows** inside the box; overflow is clipped.
- Align / justify apply **inside** the frame.
- Handle resize changes **only the frame** — font size and horizontal scale stay put.
- Mode must never flip to point as a side effect of align, transform, or size edits.

### 1.3 Boundary values (canonical)
| UI Mode     | Stored `params.boundary` |
|------------|---------------------------|
| Point      | `dynamic`                 |
| Paragraph  | `box`                     |

Never persist UI labels (`Point` / `Paragraph`) on the layer. Normalize on read/write.

---

## 2. Anchors & alignment

### 2.1 Point text — Left / Center / Right
Photoshop rule: **anchor stays fixed; glyphs move** so the left / center / right of the text block sits on the anchor.

| Align  | Layer position rule                                      |
|--------|----------------------------------------------------------|
| Left   | `layer.x = anchor_x`                                     |
| Center | `layer.x = anchor_x - visualWidth / 2`                   |
| Right  | `layer.x = anchor_x - visualWidth`                       |

- Changing align on existing point text must produce a **visible** shift of glyphs.
- Subsequent typing grows away from the same anchor via `resize_to_dynamic_bounds`.
- **Justify:** no-op / disabled in UI for point text.

### 2.2 Paragraph text — Left / Center / Right / Justify
- Only `params.halign` changes. **Do not** change `boundary`, width, height, data, or anchors.
- Left / center / right offset each wrapped line within `layer.width`.
- Justify distributes extra space across spaces on non-final wraps (and on a single-line box). Last wrap of a multi-wrap paragraph stays ragged (PS-like simple justify).
- Align must produce a **visible** change whenever the line is narrower than the box.

### 2.3 Acceptance — Align
- [ ] Point: L/C/R visibly repositions text around a fixed anchor; Mode stays Point.
- [ ] Box: L/C/R/J visibly changes in-box layout; Mode stays Paragraph; frame size unchanged.
- [ ] Justify control disabled (and ignored) for point text; enabled for boxes.

---

## 3. Transform vs font size

### 3.1 Point text — proportional resize (default / aspect locked)
- Live preview may use `params.scale_x/y`.
- On mouseup **bake** into span `meta.size` (and stroke/leading as today).
- Reset `scale_x = scale_y = 1` after a proportional bake.
- Size may be **two decimal places** during drag and after bake.
- After bake, **fit** `layer.width/height` (and `x` via anchor) to glyph bounds — **no empty padding, no glyph clipping**.

### 3.2 Point text — Shift / unlocked aspect = skew (PS-style)
- Non-uniform box drag (`|rx − ry|` meaningful, e.g. Shift while aspect-lock is on).
- **Font size** follows the **vertical** scale (`ry`).
- Remaining width ratio becomes persistent **horizontal scale**: `scale_x = absoluteSx / absoluteSy`, `scale_y = 1`.
- Visually: text gets wider/narrower than proportional (tracking-like / horizontal scale), not a second font-size axis.
- Live preview still uses independent `scale_x/y`; commit bakes as above.

### 3.3 Paragraph text — handle resize
- Changes `x/y/width/height` only.
- Must **not** call point-text scale/bake; font size and `scale_*` unchanged.
- Text reflows / clips inside the new frame.

### 3.4 Both tools
Select tool and Type tool must share the same bake/commit contract (Select previously left live `scale_*` without baking size — that is a defect).

### 3.5 Acceptance — Transform
- [ ] Point proportional: font size grows/shrinks with the box; toolbar shows baked size (≤2 dp).
- [ ] Point Shift-skew: non-uniform width; height drives size; residual horizontal scale retained.
- [ ] Point after bake: bounds hug glyphs (no pad/clip).
- [ ] Box resize: frame only; font size unchanged; text reflows.

---

## 4. Size UI rules

| Input                         | Behavior                                      |
|-------------------------------|-----------------------------------------------|
| Toolbar **+/−**               | Integer **steps** of `1` (not exponential)    |
| Manual typed value            | Free decimals allowed (snap to `inputStep` 0.01) |
| Transform bake                | Up to **2 decimal places**                    |

- Options-bar size edits are visual font size; clear leftover geometric scale when an explicit size is applied.
- Do not rebuild the options bar while the size spinner is actively repeating (avoids stuck timers).

### 4.1 Acceptance — Size UI
- [ ] +/− moves size by 1 each click/tick.
- [ ] Typing `12.5` applies 12.5.
- [ ] After transform, size field shows baked value; +/− still steps by 1 from there.

---

## 5. Font weights

- Weight select lists Local Font Access styles + Google/user metadata variants.
- Choosing a weight updates span `meta.weight` and syncs Bold when weight ≥ 600.
- Local faces load via `FontManager.loadSystemFontStyle`.

### 5.1 Acceptance — Weights
- [ ] Weight list populates for local fonts when permission granted.
- [ ] Changing weight updates rendered glyphs without clearing align/mode.

---

## 6. Chrome / selection

| Mode      | Type tool chrome                                      | Select tool                          |
|-----------|--------------------------------------------------------|--------------------------------------|
| Point     | Anchor square + baseline; no box handles               | Standard transform handles           |
| Paragraph | Dashed frame + corner handles; `keep_ratio` off        | Dashed frame; aspect per global lock |

---

## 7. Explicit non-goals
- Type on path / shape
- Warp text / perspective distort
- Vertical type (`ttb` as primary)
- Full OpenType features / baseline shift UI
- Justify last-line left/center/right variants

---

## 8. Smoke test steps (PR)

1. **Point create:** click canvas → Mode Point; type “Hello”; confirm baseline chrome.
2. **Point align:** with text selected, click Center then Right then Left — glyphs move; Mode stays Point; anchor chrome stays put relative to canvas.
3. **Point proportional resize (Select):** drag a corner without Shift — font size changes; release — size field updates; bounds hug text.
4. **Point Shift skew:** drag a side/corner with Shift — text gets wider/narrower than tall; release — size reflects height scale; width stretch persists.
5. **Box create:** click-drag a frame → Mode Paragraph; type a long sentence — wraps inside frame.
6. **Box align:** L/C/R/J — lines move inside the frame; Mode stays Paragraph; W/H unchanged.
7. **Box resize:** drag a handle — frame changes; font size unchanged; text reflows/clips.
8. **Size UI:** +/− changes by 1; type `33.25` and confirm; transform a point layer and confirm decimals then +/− still steps by 1.
9. **Regression:** switching Mode Point ↔ Paragraph explicitly still works; align never flips Mode.

---

## 9. Implementation notes (for agents)
- Treat prior “fixes” in `src/js/tools/text.js` align + `begin/apply/bake_point_text_resize*` and Select-tool mouseup as **suspect**; rewrite those subsystems to match this contract.
- Shared helpers: one bake/commit path used by Type tool, Select tool, and transform W/H inputs.
- After every point bake: `resize_to_dynamic_bounds`.
- Align point: compute visual width from layout, **keep** `anchor_*`, set `layer.x` from align rule; persist via `Update_layer_action`.
