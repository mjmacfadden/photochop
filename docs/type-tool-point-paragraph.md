# Type tool: point vs paragraph (Photoshop-like)

> **Full acceptance checklist:** [`type-tool-ps-parity-spec.md`](./type-tool-ps-parity-spec.md)

## Modes
- **Point text** (`boundary: dynamic`): click to place. Transform handles **scale font size** (baked into span `meta.size` on mouseup; Shift skew keeps residual `scale_x`). Horizontal align keeps the **anchor fixed** and moves glyphs (left / center / right). **Justify is disabled**.
- **Paragraph / box text** (`boundary: box`): click-drag a frame. Resizing the frame **reflows** text; font size stays put. Align / justify apply **inside** the box. Align never converts box → point.

## Font weights
The options bar **Weight** select lists variants exposed by Local Font Access (`queryLocalFonts` styles) and by Google/user font metadata. Choosing a weight updates span `meta.weight` (and syncs Bold when weight ≥ 600). Local faces are loaded via `FontManager.loadSystemFontStyle`.

## Size UI
- Toolbar **+/-**: integer steps of 1
- Typed size: decimals allowed
- Transform bake: up to 2 decimal places

## Known differences vs Photoshop
- No type-on-path / warp.
- Justify is a single “justify all” style (no last-line left/center/right variants).
- Free Transform perspective on type is not implemented; Type/Select handles only.
- Weight list depends on what the browser / font files expose.
