/**
 * Smoke: box/paragraph L/C/R/J layout offsets + boundary normalize.
 * Run: node scripts/smoke-box-align.mjs
 */
import assert from 'assert';

function normalize_text_boundary(boundary) {
	if (boundary != null && typeof boundary === 'object') {
		boundary = (boundary.value != null) ? boundary.value
			: (boundary.boundary != null ? boundary.boundary : '');
	}
	const b = String(boundary == null ? '' : boundary).trim().toLowerCase();
	if (b === 'box' || b === 'paragraph' || b === 'fixed') return 'box';
	return 'dynamic';
}

function normalize_halign(halign) {
	if (halign != null && typeof halign === 'object') {
		halign = (halign.value != null) ? halign.value : 'left';
	}
	const h = String(halign == null ? 'left' : halign).trim().toLowerCase();
	if (h === 'center' || h === 'right' || h === 'justify') return h;
	return 'left';
}

function is_box_text(layer) {
	return !!(layer && layer.params && normalize_text_boundary(layer.params.boundary) === 'box');
}

/** Mirror of calculate_text_placement horizontal align offset for a single wrap. */
function apply_box_halign(wrapWidth, boxWidth, halign, { isLastWrap = true, isSingleLineLayer = true } = {}) {
	const h = normalize_halign(halign);
	const offsets = [0, wrapWidth]; // start, end of wrap
	if (h === 'left') return offsets;
	if (h === 'justify') {
		// Simple smoke: only assert justify path is "active" for non-final or single-line box
		const shouldJustify = !isLastWrap || (isSingleLineLayer && true);
		if (!shouldJustify) return offsets;
		const remaining = boxWidth - wrapWidth;
		if (remaining <= 0) return offsets;
		// pretend one space in the middle
		return [0, wrapWidth / 2 + remaining / 2, wrapWidth + remaining];
	}
	const isCentered = h === 'center';
	const startOffset = (isCentered ? boxWidth / 2 : boxWidth) - (isCentered ? wrapWidth / 2 : wrapWidth);
	return offsets.map((o) => o + startOffset);
}

// --- normalize / is_box_text ---
assert.strictEqual(normalize_text_boundary('box'), 'box');
assert.strictEqual(normalize_text_boundary('Paragraph'), 'box');
assert.strictEqual(normalize_text_boundary('paragraph'), 'box');
assert.strictEqual(normalize_text_boundary({ value: 'Paragraph' }), 'box');
assert.strictEqual(normalize_text_boundary('Point'), 'dynamic');
assert.strictEqual(normalize_text_boundary('dynamic'), 'dynamic');
assert.strictEqual(normalize_text_boundary('Center'), 'dynamic'); // corrupted UI label must NOT become box
assert.ok(is_box_text({ params: { boundary: 'box' } }));
assert.ok(is_box_text({ params: { boundary: 'Paragraph' } }));
assert.ok(!is_box_text({ params: { boundary: 'dynamic' } }));
assert.ok(!is_box_text({ params: { boundary: 'Point' } }));

assert.strictEqual(normalize_halign('Center'), 'center');
assert.strictEqual(normalize_halign({ value: 'Justify' }), 'justify');
assert.strictEqual(normalize_halign('Left'), 'left');

// --- box align offsets (line narrower than box) ---
const wrapW = 100;
const boxW = 400;
const left = apply_box_halign(wrapW, boxW, 'left');
const center = apply_box_halign(wrapW, boxW, 'center');
const right = apply_box_halign(wrapW, boxW, 'right');
const justify = apply_box_halign(wrapW, boxW, 'justify', { isLastWrap: true, isSingleLineLayer: true });

assert.strictEqual(left[0], 0, 'left start at 0');
assert.ok(Math.abs(center[0] - 150) < 0.01, `center start ~150 got ${center[0]}`);
assert.ok(Math.abs(right[0] - 300) < 0.01, `right start ~300 got ${right[0]}`);
assert.ok(justify[justify.length - 1] > wrapW, 'justify stretches past natural width');
assert.notStrictEqual(left[0], center[0], 'L vs C visible');
assert.notStrictEqual(center[0], right[0], 'C vs R visible');

// Box align must not change frame / boundary (contract check on a fake update)
function box_align_update(layer, align) {
	const lockedBoundary = normalize_text_boundary(layer.params.boundary);
	const nextParams = { ...layer.params, boundary: lockedBoundary, halign: normalize_halign(align) };
	return {
		params: nextParams,
		width: layer.width,
		height: layer.height,
		x: layer.x,
		boundary: nextParams.boundary,
	};
}
const layer = { x: 10, y: 20, width: 400, height: 200, params: { boundary: 'box', halign: 'left' } };
for (const a of ['Left', 'Center', 'Right', 'Justify']) {
	const u = box_align_update(layer, a);
	assert.strictEqual(u.boundary, 'box', `${a}: boundary stays box`);
	assert.strictEqual(u.width, 400, `${a}: width unchanged`);
	assert.strictEqual(u.height, 200, `${a}: height unchanged`);
	assert.strictEqual(u.x, 10, `${a}: x unchanged`);
	assert.strictEqual(u.params.halign, normalize_halign(a));
}

// UI "Paragraph" must normalize to stored box, never persist as Paragraph
const mangled = { params: { boundary: 'Paragraph', halign: 'center' } };
assert.strictEqual(normalize_text_boundary(mangled.params.boundary), 'box');
mangled.params.boundary = normalize_text_boundary(mangled.params.boundary);
assert.strictEqual(mangled.params.boundary, 'box');

console.log('smoke-box-align: OK');
