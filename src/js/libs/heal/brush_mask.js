/**
 * Soft circular brush mask for spot healing.
 * Returns a Float32Array of length size*size with values in [0, 1].
 * Hardness 100 = hard edge; 0 = fully soft falloff from center.
 */
export function buildBrushMask(size, hardness) {
	size = Math.max(1, Math.round(size));
	hardness = Math.max(0, Math.min(100, hardness != null ? hardness : 50));

	var mask = new Float32Array(size * size);
	var half = (size - 1) / 2;
	var radius = Math.max(0.5, size / 2);
	// Inner radius where alpha stays 1; outer falls to 0
	var inner = radius * (hardness / 100);
	var outer = radius;
	var fall = Math.max(0.0001, outer - inner);

	for (var y = 0; y < size; y++) {
		for (var x = 0; x < size; x++) {
			var dx = x - half;
			var dy = y - half;
			var dist = Math.sqrt(dx * dx + dy * dy);
			var a;
			if (dist <= inner) {
				a = 1;
			}
			else if (dist >= outer) {
				a = 0;
			}
			else {
				// Smoothstep falloff between inner and outer
				var t = (dist - inner) / fall;
				a = 1 - (t * t * (3 - 2 * t));
			}
			mask[y * size + x] = a;
		}
	}
	return mask;
}

export default { buildBrushMask };
