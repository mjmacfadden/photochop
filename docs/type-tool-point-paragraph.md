# Type tool: point vs paragraph (Photoshop-like)

## Modes
- **Point text** (`boundary: dynamic`): click to place. Transform handles **scale font size** (baked into span `meta.size` on mouseup). Horizontal align moves the **anchor** (left / center / right of the object). **Justify is disabled**.
- **Paragraph / box text** (`boundary: box`): click-drag a frame. Resizing the frame **reflows** text; font size stays put. Align / justify apply **inside** the box. Align never converts box → point.

## Font weights
The options bar **Weight** select lists variants exposed by Local Font Access (`queryLocalFonts` styles) and by Google/user font metadata. Choosing a weight updates span `meta.weight` (and syncs Bold when weight ≥ 600). Local faces are loaded via `FontManager.loadSystemFontStyle`.

## Known differences vs Photoshop
- No type-on-path / warp.
- Justify is a single “justify all” style (no last-line left/center/right variants).
- Free Transform skew/perspective on type is not implemented; Type-tool handles only.
- Weight list depends on what the browser / font files expose.
