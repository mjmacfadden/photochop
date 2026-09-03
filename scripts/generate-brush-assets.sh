#!/usr/bin/env bash
# Generate tip PNGs and stroke preview PNGs for the Vantage Point brush library.
# Tips are grayscale alpha stamps (black RGB + alpha shape) tinted at paint time.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIPS="$ROOT/images/brushes/tips"
PREV="$ROOT/images/brushes/previews"
mkdir -p "$TIPS" "$PREV"

# --- Tips (64x64, alpha = shape) -------------------------------------------------

# Hard round — solid disk
magick -size 64x64 xc:none -fill black -draw 'circle 32,32 32,3' "PNG32:$TIPS/hard-round.png"

# Soft round — radial alpha falloff (luminance copied to alpha)
magick -size 64x64 radial-gradient:white-black "$TIPS/_grad.png"
magick "$TIPS/_grad.png" -alpha off "$TIPS/_grad.png" -compose CopyOpacity -composite \
  -channel RGB -evaluate set 0 +channel "PNG32:$TIPS/soft-round.png"
rm -f "$TIPS/_grad.png"

# Soft-edge disk — hard core with feathered rim
magick -size 64x64 xc:none -fill black -draw 'circle 32,32 32,8' \
  -blur 0x3 "PNG32:$TIPS/soft-edge.png"

# Chisel — angled flat marker tip (reads clearly when stamped)
magick -size 64x64 xc:none -fill black \
  -draw 'translate 32,32 rotate -38 roundrectangle -26,-7 26,7 2,2' \
  "PNG32:$TIPS/chisel.png"

# Felt — elongated oval with slight soft edge
magick -size 64x64 xc:none -fill black \
  -draw 'translate 32,32 rotate -22 ellipse 0,0 9,20 0,360' \
  -blur 0x0.8 "PNG32:$TIPS/felt.png"

# Pencil — small dense core + light grain speckles
magick -size 64x64 xc:none \
  -fill 'rgba(0,0,0,0.95)' -draw 'circle 32,32 32,7' \
  -fill 'rgba(0,0,0,0.35)' \
  -draw 'circle 24,26 24,27' -draw 'circle 40,28 40,29' \
  -draw 'circle 28,38 28,39' -draw 'circle 36,22 36,23' \
  -draw 'circle 44,36 44,37' \
  "PNG32:$TIPS/pencil-hard.png"

# Spray — scattered soft dots
magick -size 64x64 xc:none \
  -fill 'rgba(0,0,0,0.55)' -draw 'circle 20,22 20,25' \
  -fill 'rgba(0,0,0,0.4)'  -draw 'circle 40,18 40,22' \
  -fill 'rgba(0,0,0,0.5)'  -draw 'circle 28,36 28,40' \
  -fill 'rgba(0,0,0,0.35)' -draw 'circle 44,34 44,37' \
  -fill 'rgba(0,0,0,0.45)' -draw 'circle 18,40 18,43' \
  -fill 'rgba(0,0,0,0.3)'  -draw 'circle 36,28 36,31' \
  -fill 'rgba(0,0,0,0.4)'  -draw 'circle 48,24 48,27' \
  -fill 'rgba(0,0,0,0.35)' -draw 'circle 24,16 24,18' \
  -fill 'rgba(0,0,0,0.25)' -draw 'circle 32,32 32,38' \
  -fill 'rgba(0,0,0,0.4)'  -draw 'circle 14,28 14,30' \
  -fill 'rgba(0,0,0,0.3)'  -draw 'circle 50,40 50,42' \
  -fill 'rgba(0,0,0,0.35)' -draw 'circle 38,44 38,46' \
  "PNG32:$TIPS/spray.png"

# --- Stroke previews -------------------------------------------------------------
# Classic/stamp brushes: stamp the tip along a curve (node helper).
# Hokusai: illustrative IM stroke curves (engine capture is optional later).

node "$ROOT/scripts/stamp-brush-previews.mjs"

make_curve_preview() {
  local out="$1"
  local width="$2"
  local opacity="$3"
  local soft="$4"
  local path="${5:-path 'M 6,28 C 28,6 48,34 70,10 S 108,30 114,16'}"
  local a
  a="$(awk "BEGIN{printf \"%.2f\", $opacity/100}")"
  local tmp
  tmp="$(mktemp /tmp/vpbrushXXXX.png)"
  magick -size 120x40 xc:'#f0f0f0' \
    -fill none -stroke "rgba(20,20,20,${a})" -strokewidth "$width" \
    -draw "stroke-linecap round stroke-linejoin round $path" \
    "$tmp"
  if [[ "$soft" == "1" ]]; then
    magick "$tmp" -blur 0x1.2 "PNG32:$out"
  else
    magick "$tmp" "PNG32:$out"
  fi
  rm -f "$tmp"
}

# Hokusai illustrative previews (not tip-stamped)
make_curve_preview "$PREV/paint-basic.png" 10 90 1
make_curve_preview "$PREV/paint-heavy.png" 14 95 1
make_curve_preview "$PREV/pencil-sketch.png" 2 85 0
make_curve_preview "$PREV/ink-fineliner.png" 1.5 100 0
make_curve_preview "$PREV/ink-brush.png" 5 95 0 "path 'M 6,30 C 24,8 40,36 58,12 S 90,34 114,14'"

echo "OK"
ls -la "$TIPS" "$PREV"
