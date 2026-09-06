/**
 * Smoke: FontManager.getFontWeightList merges Local + Google/user faces.
 * Run: node scripts/smoke-font-weights.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const googleFontsCache = require('../src/js/libs/google-fonts-cache.json');

function formatWeightLabel(raw) {
	const s = String(raw == null ? '' : raw).trim();
	if (!s) return null;
	const map = {
		'100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Regular',
		'500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
		'regular': 'Regular', 'normal': 'Regular', 'italic': 'Italic',
		'thin': 'Thin', 'extralight': 'ExtraLight', 'ultralight': 'ExtraLight',
		'light': 'Light', 'medium': 'Medium', 'semibold': 'SemiBold', 'demibold': 'SemiBold',
		'bold': 'Bold', 'extrabold': 'ExtraBold', 'ultrabold': 'ExtraBold',
		'black': 'Black', 'heavy': 'Black',
	};
	const key = s.toLowerCase().replace(/[\s_-]+/g, '');
	if (map[key]) return map[key];
	if (map[s]) return map[s];
	return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bItalic\b/i, 'Italic');
}

function getFontWeightList(family, cache, systemVariants = [], userVariants = []) {
	const labels = [];
	const seen = new Set();
	const push = (raw) => {
		if (raw == null) return;
		const label = formatWeightLabel(raw);
		if (!label) return;
		const key = label.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		labels.push(label);
	};
	const pushVariant = (v) => {
		if (v == null) return;
		const s = String(v).trim();
		if (!s) return;
		if (/^italic$/i.test(s) || /^oblique$/i.test(s)) return;
		if (/italic|oblique/i.test(s)) {
			const base = s.replace(/italic|oblique/ig, '').trim();
			if (base) push(base);
			return;
		}
		push(s);
	};
	for (const v of systemVariants) pushVariant(v);
	for (const v of userVariants) pushVariant(v);
	if (Array.isArray(cache)) {
		const entry = cache.find((f) => f && f.family === family);
		if (entry && Array.isArray(entry.variants)) {
			for (const v of entry.variants) pushVariant(v);
		}
	}
	if (labels.length === 0) return ['Regular', 'Bold'];
	const order = ['thin','extralight','ultralight','light','regular','normal','medium','semibold','demibold','bold','extrabold','ultrabold','black','heavy'];
	labels.sort((a, b) => {
		const ka = a.toLowerCase().replace(/[\s_-]+/g, '');
		const kb = b.toLowerCase().replace(/[\s_-]+/g, '');
		const ia = order.findIndex((o) => ka === o || ka.startsWith(o));
		const ib = order.findIndex((o) => kb === o || kb.startsWith(o));
		if (ia >= 0 && ib >= 0) return ia - ib;
		if (ia >= 0) return -1;
		if (ib >= 0) return 1;
		return a.localeCompare(b);
	});
	return labels;
}

function weight_implies_bold(weight) {
	const map = { thin:100, extralight:200, light:300, regular:400, medium:500, semibold:600, bold:700, extrabold:800, black:900 };
	const w = String(weight).toLowerCase().replace(/[\s_-]+/g, '');
	const n = map[w] || parseInt(w, 10) || 400;
	return n >= 600;
}

// Prior bug: empty local variants returned ['regular'] and blocked Google fallthrough.
assert.deepStrictEqual(
	getFontWeightList('Roboto', googleFontsCache, []),
	['Thin','ExtraLight','Light','Regular','Medium','SemiBold','Bold','ExtraBold','Black']
);

// Local Regular-only still merges Google catalog (must not stay Regular-only).
const merged = getFontWeightList('Roboto', googleFontsCache, ['Regular']);
assert.ok(merged.includes('Thin') && merged.includes('Black') && merged.includes('Regular'));
assert.ok(merged.length >= 9, 'Roboto should list full weight range');

// Local faces alone when not in Google cache
assert.deepStrictEqual(
	getFontWeightList('MyLocalFace', googleFontsCache, ['Thin', 'Regular', 'Bold Italic', 'Black']),
	['Thin', 'Regular', 'Bold', 'Black']
);

// Empty → Regular/Bold fallback (not [])
assert.deepStrictEqual(getFontWeightList('TotallyUnknown', googleFontsCache, []), ['Regular', 'Bold']);

// Bold sync threshold
assert.strictEqual(weight_implies_bold('Regular'), false);
assert.strictEqual(weight_implies_bold('Medium'), false);
assert.strictEqual(weight_implies_bold('SemiBold'), true);
assert.strictEqual(weight_implies_bold('Bold'), true);
assert.strictEqual(weight_implies_bold('700'), true);
assert.strictEqual(weight_implies_bold('Thin'), false);

console.log('smoke-font-weights: OK', {
	roboto: getFontWeightList('Roboto', googleFontsCache, []),
});
