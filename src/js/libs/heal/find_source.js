/**
 * PatchMatch-lite: search a neighborhood for the best matching source patch
 * by RGB sum-of-squared-differences on a coarse grid.
 *
 * Searches an annulus around (destX, destY): from ~radius outward to
 * searchRadius (typically 2–4× brush radius), skipping the dest interior
 * so we don't clone the blemish onto itself.
 *
 * @param {ImageData} imageData - full layer ImageData (Uint8ClampedArray data)
 * @param {number} destX - center X of destination patch (layer coords)
 * @param {number} destY - center Y of destination patch
 * @param {number} radius - half brush size (patch is ~2*radius)
 * @param {object} [opts]
 * @param {number} [opts.searchMul=3] - search outer radius = radius * searchMul
 * @param {number} [opts.step] - grid step (auto if omitted)
 * @param {Array<{dx:number,dy:number}>} [opts.avoidOffsets] - recently used offsets to penalize
 * @returns {{sx:number, sy:number, score:number, dx:number, dy:number}|null}
 */
export function findSourcePatch(imageData, destX, destY, radius, opts) {
	opts = opts || {};
	var w = imageData.width;
	var h = imageData.height;
	var data = imageData.data;
	radius = Math.max(1, Math.round(radius));
	var patch = Math.max(2, radius * 2);
	var half = Math.floor(patch / 2);

	var searchMul = opts.searchMul != null ? opts.searchMul : 3;
	var searchR = Math.max(radius + 2, Math.round(radius * searchMul));
	var excludeR = radius; // skip dest interior
	var step = opts.step != null ? opts.step : Math.max(2, Math.floor(radius / 3));
	var avoid = opts.avoidOffsets || [];

	// Dest patch must be fully inside image for a fair SSD
	destX = Math.round(destX);
	destY = Math.round(destY);
	if (destX - half < 0 || destY - half < 0 || destX + half >= w || destY + half >= h) {
		// Clamp dest center so patch fits
		destX = Math.max(half, Math.min(w - 1 - half, destX));
		destY = Math.max(half, Math.min(h - 1 - half, destY));
	}

	// Sample dest patch RGB into a flat array for fast compare (skip nearly-transparent)
	var destPatch = new Float32Array(patch * patch * 3);
	var destValid = 0;
	for (var py = 0; py < patch; py++) {
		for (var px = 0; px < patch; px++) {
			var ix = destX - half + px;
			var iy = destY - half + py;
			var di = (iy * w + ix) * 4;
			var o = (py * patch + px) * 3;
			destPatch[o] = data[di];
			destPatch[o + 1] = data[di + 1];
			destPatch[o + 2] = data[di + 2];
			if (data[di + 3] > 8) destValid++;
		}
	}
	if (destValid < 4) {
		return null; // nothing useful to match
	}

	var bestScore = Infinity;
	var bestSx = destX;
	var bestSy = destY;
	var found = false;

	var minY = Math.max(half, destY - searchR);
	var maxY = Math.min(h - 1 - half, destY + searchR);
	var minX = Math.max(half, destX - searchR);
	var maxX = Math.min(w - 1 - half, destX + searchR);

	// Coarse subsample of dest for SSD (every other pixel) to keep UI responsive
	var sampleStep = patch > 16 ? 2 : 1;

	for (var cy = minY; cy <= maxY; cy += step) {
		for (var cx = minX; cx <= maxX; cx += step) {
			var odx = cx - destX;
			var ody = cy - destY;
			var dist2 = odx * odx + ody * ody;
			if (dist2 < excludeR * excludeR) continue;
			if (dist2 > searchR * searchR) continue;

			var score = 0;
			var samples = 0;
			for (var py2 = 0; py2 < patch; py2 += sampleStep) {
				for (var px2 = 0; px2 < patch; px2 += sampleStep) {
					var sx = cx - half + px2;
					var sy = cy - half + py2;
					var si = (sy * w + sx) * 4;
					if (data[si + 3] < 8) {
						score += 20000; // penalize empty source
						samples++;
						continue;
					}
					var o2 = (py2 * patch + px2) * 3;
					var dr = data[si] - destPatch[o2];
					var dg = data[si + 1] - destPatch[o2 + 1];
					var db = data[si + 2] - destPatch[o2 + 2];
					score += dr * dr + dg * dg + db * db;
					samples++;
				}
			}
			if (samples === 0) continue;
			score /= samples;

			// Anti-repeat: gently penalize recently used offsets
			for (var a = 0; a < avoid.length; a++) {
				var adx = odx - avoid[a].dx;
				var ady = ody - avoid[a].dy;
				if (adx * adx + ady * ady < (step * 2) * (step * 2)) {
					score *= 1.35;
					break;
				}
			}

			if (score < bestScore) {
				bestScore = score;
				bestSx = cx;
				bestSy = cy;
				found = true;
			}
		}
	}

	if (!found) {
		// Fallback: try cardinal neighbors just outside exclude radius
		var fallbacks = [
			[0, -excludeR - step], [0, excludeR + step],
			[-excludeR - step, 0], [excludeR + step, 0]
		];
		for (var f = 0; f < fallbacks.length; f++) {
			var fx = destX + fallbacks[f][0];
			var fy = destY + fallbacks[f][1];
			if (fx >= half && fy >= half && fx < w - half && fy < h - half) {
				bestSx = fx;
				bestSy = fy;
				found = true;
				break;
			}
		}
	}

	if (!found) return null;

	return {
		sx: bestSx,
		sy: bestSy,
		dx: bestSx - destX,
		dy: bestSy - destY,
		score: bestScore
	};
}

export default { findSourcePatch };
