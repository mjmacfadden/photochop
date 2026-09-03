#!/usr/bin/env node
/**
 * Stamp tip PNGs along a bezier curve to build stroke preview thumbnails
 * for classic/stamp brushes in the Vantage Point library.
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const library = JSON.parse(readFileSync(join(ROOT, 'src/js/libs/brushes/library.json'), 'utf8'));

function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
  };
}

function sampleCurve(n) {
  // Two cubic segments forming an S-ish stroke across 120x40
  const segs = [
    [{ x: 8, y: 28 }, { x: 28, y: 6 }, { x: 48, y: 34 }, { x: 70, y: 12 }],
    [{ x: 70, y: 12 }, { x: 90, y: 0 }, { x: 104, y: 30 }, { x: 114, y: 16 }],
  ];
  const pts = [];
  for (const s of segs) {
    for (let i = 0; i <= n; i++) {
      pts.push(bezierPoint(i / n, s[0], s[1], s[2], s[3]));
    }
  }
  return pts;
}

function magick(args) {
  const r = spawnSync('magick', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`magick failed: ${args.join(' ')}\n${r.stderr || r.stdout}`);
  }
}

function stampPreview(brush) {
  if (!brush.tip || brush.engine === 'hokusai') return false;
  const tipPath = join(ROOT, brush.tip);
  const outPath = join(ROOT, brush.preview);
  const size = Math.max(4, Math.min(18, Math.round((brush.size?.default || 12) * 0.45)));
  const opacity = Math.max(0.15, Math.min(1, (brush.opacity?.default ?? 100) / 100));
  const spacing = Math.max(0.08, brush.spacing ?? 0.25);
  const hardness = brush.hardness ?? 100;

  // Build a sized, black-tinted tip with optional hardness soft mask.
  const tipTmp = `/tmp/vp-tip-${brush.id}.png`;
  const tipSoft = `/tmp/vp-tipsoft-${brush.id}.png`;
  magick([tipPath, '-resize', `${size}x${size}`, tipTmp]);

  if (hardness < 100) {
    const rOuter = size / 2;
    const rInner = rOuter * (hardness / 100);
    // Soft mask via radial alpha, then destination-in
    magick([
      '-size', `${size}x${size}`, `radial-gradient:white-black`,
      '-alpha', 'copy', '-channel', 'RGB', '-evaluate', 'set', '0', '+channel',
      tipSoft,
    ]);
    // Approximate hardness by blurring more when soft; full radial is overkill for thumbs
    const blur = Math.max(0.3, (100 - hardness) / 40);
    magick([tipTmp, '-alpha', 'set', '-channel', 'A', '-blur', `0x${blur}`, '+channel', tipTmp]);
  }

  const pts = sampleCurve(24);
  // Walk with spacing based on tip size
  const step = Math.max(1, size * spacing);
  const chosen = [];
  let last = null;
  for (const p of pts) {
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= step) {
      chosen.push(p);
      last = p;
    }
  }
  if (chosen.length === 0) chosen.push(pts[0]);

  // Composite onto light gray background
  const layers = ['-size', '120x40', 'xc:#f0f0f0'];
  for (const p of chosen) {
    const x = Math.round(p.x - size / 2);
    const y = Math.round(p.y - size / 2);
    layers.push(
      '(', tipTmp, '-channel', 'A', '-evaluate', 'multiply', String(opacity), '+channel', ')',
      '-geometry', `+${x}+${y}`, '-compose', 'Over', '-composite'
    );
  }
  layers.push(`PNG32:${outPath}`);
  magick(layers);
  return true;
}

let n = 0;
for (const brush of library.brushes) {
  if (stampPreview(brush)) {
    console.log('preview', brush.id);
    n++;
  }
}
console.log(`stamped ${n} classic/stamp previews`);
