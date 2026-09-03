/**
 * Blend a source patch into destination ImageData with a soft brush mask.
 * Optionally match mean color of the destination ring for cleaner seams.
 *
 * Mutates dest ImageData in place for the patch rectangle.
 *
 * @param {ImageData} dest - full layer ImageData to write into
 * @param {ImageData|object} srcPatch - {data, width, height} source patch (same size as mask)
 * @param {Float32Array} mask - soft brush mask [0..1], length = size*size
 * @param {number} destX - center X in dest
 * @param {number} destY - center Y in dest
 * @param {object} [opts]
 * @param {number} [opts.strength=1] - 0..1 overall opacity of heal
 * @param {boolean} [opts.meanColorMatch=true] - shift source toward dest ring mean
 */
export function blendSeamless(dest, srcPatch, mask, destX, destY, opts) {
	opts = opts || {};
	var strength = opts.strength != null ? opts.strength : 1;
	strength = Math.max(0, Math.min(1, strength));
	var meanColorMatch = opts.meanColorMatch !== false;

	var size = Math.round(Math.sqrt(mask.length));
	var half = Math.floor(size / 2);
	var dw = dest.width;
	var dh = dest.height;
	var dd = dest.data;
	var sd = srcPatch.data || srcPatch;
	var sw = srcPatch.width != null ? srcPatch.width : size;

	destX = Math.round(destX);
	destY = Math.round(destY);

	var meanDr = 0, meanDg = 0, meanDb = 0;
	if (meanColorMatch) {
		// Compare mean of dest vs source under the soft edge (mask 0.15–0.85)
		var sumDr = 0, sumDg = 0, sumDb = 0, n = 0;
		for (var y = 0; y < size; y++) {
			for (var x = 0; x < size; x++) {
				var m = mask[y * size + x];
				if (m < 0.15 || m > 0.85) continue;
				var dx = destX - half + x;
				var dy = destY - half + y;
				if (dx < 0 || dy < 0 || dx >= dw || dy >= dh) continue;
				var di = (dy * dw + dx) * 4;
				var si = (y * sw + x) * 4;
				if (dd[di + 3] < 8 || sd[si + 3] < 8) continue;
				sumDr += dd[di] - sd[si];
				sumDg += dd[di + 1] - sd[si + 1];
				sumDb += dd[di + 2] - sd[si + 2];
				n++;
			}
		}
		if (n > 0) {
			meanDr = sumDr / n;
			meanDg = sumDg / n;
			meanDb = sumDb / n;
		}
	}

	for (var y2 = 0; y2 < size; y2++) {
		for (var x2 = 0; x2 < size; x2++) {
			var alpha = mask[y2 * size + x2] * strength;
			if (alpha < 0.002) continue;

			var dx2 = destX - half + x2;
			var dy2 = destY - half + y2;
			if (dx2 < 0 || dy2 < 0 || dx2 >= dw || dy2 >= dh) continue;

			var di2 = (dy2 * dw + dx2) * 4;
			var si2 = (y2 * sw + x2) * 4;

			var sr = sd[si2] + meanDr;
			var sg = sd[si2 + 1] + meanDg;
			var sb = sd[si2 + 2] + meanDb;
			var sa = sd[si2 + 3] / 255;

			// Clamp color-shifted source
			if (sr < 0) sr = 0; else if (sr > 255) sr = 255;
			if (sg < 0) sg = 0; else if (sg > 255) sg = 255;
			if (sb < 0) sb = 0; else if (sb > 255) sb = 255;

			var outA = alpha * sa;
			var inv = 1 - outA;

			dd[di2] = Math.round(sr * outA + dd[di2] * inv);
			dd[di2 + 1] = Math.round(sg * outA + dd[di2 + 1] * inv);
			dd[di2 + 2] = Math.round(sb * outA + dd[di2 + 2] * inv);
			dd[di2 + 3] = Math.min(255, Math.round(dd[di2 + 3] + (255 - dd[di2 + 3]) * outA));
		}
	}
}

export default { blendSeamless };
