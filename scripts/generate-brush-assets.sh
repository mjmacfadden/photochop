#!/usr/bin/env bash
# Generate tip PNGs and stroke preview PNGs for the Vantage Point brush library.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIPS="$ROOT/images/brushes/tips"
PREV="$ROOT/images/brushes/previews"
mkdir -p "$TIPS" "$PREV"

magick -size 64x64 xc:none -fill black -draw 'circle 32,32 32,4' "PNG32:$TIPS/hard-round.png"
magick -size 64x64 radial-gradient:'rgba(0,0,0,1)-rgba(0,0,0,0)' -gravity center -extent 64x64 "PNG32:$TIPS/soft-round.png"
magick -size 64x64 xc:none -fill black -draw 'circle 32,32 32,10' "PNG32:$TIPS/soft-edge.png"
magick -size 64x64 xc:none -fill black -draw 'translate 32,32 rotate -35 rectangle -22,-8 22,8' "PNG32:$TIPS/chisel.png"
magick -size 64x64 xc:none -fill black -draw 'translate 32,32 rotate -20 ellipse 0,0 10,18 0,360' "PNG32:$TIPS/felt.png"
magick -size 64x64 xc:none -fill 'rgba(0,0,0,0.95)' -draw 'circle 32,32 32,6' "PNG32:$TIPS/pencil-hard.png"
magick -size 64x64 xc:none -fill 'rgba(0,0,0,0.35)' \
  -draw 'circle 20,22 20,24' -draw 'circle 40,18 40,21' -draw 'circle 28,36 28,39' \
  -draw 'circle 44,34 44,37' -draw 'circle 18,40 18,42' -draw 'circle 36,28 36,30' \
  -draw 'circle 48,24 48,26' -draw 'circle 24,16 24,18' -draw 'circle 32,32 32,36' \
  "PNG32:$TIPS/spray.png"

make_preview() {
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

make_preview "$PREV/classic-round.png" 4 100 0
make_preview "$PREV/classic-soft.png" 8 80 1
make_preview "$PREV/paint-basic.png" 10 90 1
make_preview "$PREV/paint-heavy.png" 14 95 1
make_preview "$PREV/pencil-sketch.png" 2 85 0
make_preview "$PREV/pencil-soft.png" 3 70 1
make_preview "$PREV/ink-fineliner.png" 1.5 100 0
make_preview "$PREV/ink-brush.png" 5 95 0 "path 'M 6,30 C 24,8 40,36 58,12 S 90,34 114,14'"
make_preview "$PREV/airbrush-soft.png" 12 45 1
make_preview "$PREV/airbrush-spray.png" 10 35 1
make_preview "$PREV/marker-chisel.png" 7 100 0 "path 'M 8,26 L 40,12 L 70,28 L 110,14'"
make_preview "$PREV/marker-felt.png" 6 90 1

echo "OK"
ls -la "$TIPS" "$PREV"
