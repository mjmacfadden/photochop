/**
 * Vantage Point brush preset library (.vpbrush JSON format).
 * Groups Classic (dab) and Hokusai (painterly) presets with stroke previews.
 */

import libraryManifest from './library.json';

const LEGACY_ALIAS = {
	Classic: 'classic-round',
	Paint: 'paint-basic',
	Pencil: 'pencil-sketch',
	Ink: 'ink-fineliner',
};

const byId = Object.create(null);
for (var i = 0; i < libraryManifest.brushes.length; i++) {
	var b = libraryManifest.brushes[i];
	byId[b.id] = b;
}

function normalizeId(name) {
	if (!name) return 'classic-round';
	var id = typeof name === 'object' ? (name.value || name.id || name) : name;
	if (LEGACY_ALIAS[id]) return LEGACY_ALIAS[id];
	if (byId[id]) return id;
	return 'classic-round';
}

function getBrush(idOrName) {
	return byId[normalizeId(idOrName)] || byId['classic-round'];
}

function getCategories() {
	return (libraryManifest.categories || []).slice();
}

function getBrushes(category) {
	var list = libraryManifest.brushes || [];
	if (!category || category === 'All') return list.slice();
	return list.filter(function (b) { return b.category === category; });
}

function isHokusaiBrush(idOrName) {
	var brush = getBrush(idOrName);
	return !!(brush && brush.engine === 'hokusai');
}

function hokusaiPresetId(idOrName) {
	var brush = getBrush(idOrName);
	if (!brush || brush.engine !== 'hokusai') return null;
	return brush.hokusai || null;
}

/**
 * Apply preset defaults onto the active Brush tool attributes.
 * Size / opacity / hardness / pressure come from the preset; UI can still override.
 */
function applyToToolAttributes(brushId, attributes) {
	var brush = getBrush(brushId);
	if (!brush || !attributes) return brush;

	attributes.preset = attributes.preset || {};
	if (typeof attributes.preset === 'object') {
		attributes.preset.value = brush.id;
	} else {
		attributes.preset = brush.id;
	}

	if (brush.size) {
		if (typeof attributes.size === 'object') {
			attributes.size.value = brush.size.default;
		} else {
			attributes.size = brush.size.default;
		}
		attributes.pressure = !!(brush.size.pressure);
	}
	if (brush.opacity) {
		if (typeof attributes.opacity === 'object') {
			attributes.opacity.value = brush.opacity.default;
		} else {
			attributes.opacity = brush.opacity.default;
		}
	}
	if (brush.hardness != null) {
		if (typeof attributes.hardness === 'object') {
			attributes.hardness.value = brush.hardness;
		} else {
			attributes.hardness = brush.hardness;
		}
	}
	return brush;
}

export {
	libraryManifest,
	normalizeId,
	getBrush,
	getCategories,
	getBrushes,
	isHokusaiBrush,
	hokusaiPresetId,
	applyToToolAttributes,
	LEGACY_ALIAS,
};

export default {
	libraryManifest,
	normalizeId,
	getBrush,
	getCategories,
	getBrushes,
	isHokusaiBrush,
	hokusaiPresetId,
	applyToToolAttributes,
	LEGACY_ALIAS,
};
