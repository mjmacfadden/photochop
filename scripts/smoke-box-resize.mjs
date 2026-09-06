/**
 * Smoke: box/paragraph handle resize is frame-only (no font bake / mode flip).
 * Run: node scripts/smoke-box-resize.mjs
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

function is_box_text(layer) {
	return !!(layer && layer.params && normalize_text_boundary(layer.params.boundary) === 'box');
}

function is_point_text(layer) {
	return !!(layer && layer.type === 'text' && !is_box_text(layer));
}

/** Move-tool decision: should this resize bake point-text fonts? */
function should_bake_point_resize(layer, resizingPointFlag) {
	if (!layer || layer.type !== 'text') return false;
	if (is_box_text(layer)) return false;
	return !!resizingPointFlag || is_point_text(layer);
}

/** Simulate Move mouseup layerUpdate for box vs point */
function frame_only_update(before, after) {
	return { x: after.x, y: after.y, width: after.width, height: after.height };
}

const box = {
	type: 'text',
	x: 10, y: 20, width: 200, height: 100,
	params: { boundary: 'box', halign: 'left', scale_x: 1, scale_y: 1, size: 38 },
	data: [[{ text: 'Hello world wrap please', meta: { size: 38, weight: 'Regular' } }]],
};

assert.ok(is_box_text(box));
assert.ok(!is_point_text(box));
assert.strictEqual(should_bake_point_resize(box, false), false);
assert.strictEqual(should_bake_point_resize(box, true), false, 'stale flag must not bake box');

// UI label / object boundary still box
assert.ok(is_box_text({ params: { boundary: 'Paragraph' } }));
assert.ok(is_box_text({ params: { boundary: { value: 'Paragraph' } } }));

const after = { x: 10, y: 20, width: 320, height: 160 };
const update = frame_only_update(box, after);
assert.deepStrictEqual(Object.keys(update).sort(), ['height', 'width', 'x', 'y']);
assert.strictEqual(update.width, 320);
assert.strictEqual(box.params.size, 38, 'font size untouched');
assert.strictEqual(box.data[0][0].meta.size, 38);
assert.strictEqual(box.params.scale_x, 1);
assert.strictEqual(box.params.boundary, 'box');

const point = {
	type: 'text',
	params: { boundary: 'dynamic', scale_x: 1, scale_y: 1 },
};
assert.ok(is_point_text(point));
assert.strictEqual(should_bake_point_resize(point, true), true);
assert.strictEqual(should_bake_point_resize(point, false), true, 'point still bakes via is_point_text');

console.log('smoke-box-resize: OK');
