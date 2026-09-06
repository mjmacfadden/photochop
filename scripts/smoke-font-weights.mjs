/**
 * Smoke: FontManager.getFontWeightList merges Local + Google/user faces.
 * Labels include CSS numeric weights: Thin (100), Light (300), …
 * Run: node scripts/smoke-font-weights.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const googleFontsCache = require('../src/js/libs/google-fonts-cache.json');

function styleNameToCssWeight(styleName) {
	if (styleName == null || styleName === '') return '400';
	const s = String(styleName).trim();
	const paren = s.match(/\((\d{2,4})\)/);
	if (paren) return String(parseInt(paren[1], 10));
	const base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
	const bareNum = base.match(/^(\d{2,4})$/);
	if (bareNum) return String(parseInt(bareNum[1], 10));
	const w = base.toLowerCase().replace(/[\s_-]+/g, '').replace(/italic|oblique/g, '');
	if (!w || w === 'regular' || w === 'normal' || w === 'book' || w === 'roman') return '400';
	if (w === 'thin' || w === 'hairline') return '100';
	if (w === 'extralight' || w === 'ultralight') return '200';
	if (w === 'light') return '300';
	if (w === 'medium') return '500';
	if (w === 'semibold' || w === 'demibold' || w === 'semi') return '600';
	if (w === 'extrabold' || w === 'ultrabold') return '800';
	if (w === 'black' || w === 'heavy' || w === 'heavyblack') return '900';
	if (w === 'bold') return '700';
	if (w.includes('extralight') || w.includes('ultralight')) return '200';
	if (w.includes('thin') || w.includes('hairline')) return '100';
	if (w.includes('light')) return '300';
	if (w.includes('medium')) return '500';
	if (w.includes('semibold') || w.includes('demibold')) return '600';
	if (w.includes('extrabold') || w.includes('ultrabold')) return '800';
	if (w.includes('black') || w.includes('heavy')) return '900';
	if (w.includes('bold')) return '700';
	return '400';
}

function formatWeightLabel(raw) {
	const s = String(raw == null ? '' : raw).trim();
	if (!s) return null;
	if (/^.+\s\(\d{2,4}\)$/.test(s)) return s;
	const nameMap = {
		'100': 'Thin', '200': 'ExtraLight', '300': 'Light', '400': 'Regular',
		'500': 'Medium', '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black',
		'regular': 'Regular', 'normal': 'Regular',
		'thin': 'Thin', 'hairline': 'Thin',
		'extralight': 'ExtraLight', 'ultralight': 'ExtraLight',
		'light': 'Light', 'medium': 'Medium',
		'semibold': 'SemiBold', 'demibold': 'SemiBold', 'semi': 'SemiBold',
		'bold': 'Bold',
		'extrabold': 'ExtraBold', 'ultrabold': 'ExtraBold',
		'black': 'Black', 'heavy': 'Black',
	};
	const cssMap = {
		'Thin': '100', 'ExtraLight': '200', 'Light': '300', 'Regular': '400',
		'Medium': '500', 'SemiBold': '600', 'Bold': '700', 'ExtraBold': '800', 'Black': '900',
	};
	let base = s.replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
	base = base.replace(/italic|oblique/ig, '').trim() || base;
	const key = base.toLowerCase().replace(/[\s_-]+/g, '');
	let name = nameMap[key] || nameMap[base];
	if (!name && /^\d{2,4}$/.test(key)) name = nameMap[key];
	if (!name) {
		name = base.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bItalic\b/i, '').trim();
	}
	if (!name) return null;
	let num = null;
	const paren = s.match(/\((\d{2,4})\)/);
	const leading = base.match(/^(\d{2,4})$/);
	if (paren) num = paren[1];
	else if (leading) num = String(parseInt(leading[1], 10));
	else if (cssMap[name]) num = cssMap[name];
	else num = styleNameToCssWeight(name);
	return name + ' (' + num + ')';
}

function weightLabelBase(label) {
	if (label == null) return '';
	return String(label).replace(/\s*\(\d{2,4}\)\s*$/, '').trim();
}

function getFontWeightList(family, cache, systemVariants = [], userVariants = []) {
	const labels = [];
	const seen = new Set();
	const push = (raw) => {
		if (raw == null) return;
		const label = formatWeightLabel(raw);
		if (!label) return;
		const key = weightLabelBase(label).toLowerCase().replace(/[\s_-]+/g, '');
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
	if (labels.length === 0) return ['Regular (400)', 'Bold (700)'];
	const order = ['thin','extralight','ultralight','light','regular','normal','medium','semibold','demibold','bold','extrabold','ultrabold','black','heavy'];
	labels.sort((a, b) => {
		const strip = (x) => String(x).replace(/\s*\(\d{2,4}\)\s*$/, '').toLowerCase().replace(/[\s_-]+/g, '');
		const ka = strip(a);
		const kb = strip(b);
		const ia = order.findIndex((o) => ka === o || ka.startsWith(o));
		const ib = order.findIndex((o) => kb === o || kb.startsWith(o));
		const numOf = (x) => {
			const m = String(x).match(/\((\d{2,4})\)/);
			if (m) return parseInt(m[1], 10);
			const n = parseInt(x, 10);
			return isNaN(n) ? null : n;
		};
		const na = numOf(a);
		const nb = numOf(b);
		if (na != null && nb != null) return na - nb;
		if (ia >= 0 && ib >= 0) return ia - ib;
		if (ia >= 0) return -1;
		if (ib >= 0) return 1;
		return a.localeCompare(b);
	});
	return labels;
}

function normalize_font_weight(weight) {
	if (weight == null || weight === '') return null;
	const raw = String(weight).trim();
	const paren = raw.match(/\((\d{2,4})\)/);
	if (paren) return String(parseInt(paren[1], 10));
	const w = raw.toLowerCase().replace(/[_\s]+/g, '');
	if (/^\d{2,4}$/.test(w)) return String(parseInt(w, 10));
	if (w === 'regular' || w === 'normal' || w === 'book' || w === 'roman') return '400';
	if (w === 'medium') return '500';
	if (w === 'semibold' || w === 'demibold' || w === 'semi') return '600';
	if (w === 'bold') return '700';
	if (w === 'extrabold' || w === 'ultrabold') return '800';
	if (w === 'black' || w === 'heavy' || w === 'heavyblack') return '900';
	if (w === 'thin' || w === 'hairline') return '100';
	if (w === 'extralight' || w === 'ultralight') return '200';
	if (w === 'light') return '300';
	return '400';
}

function weight_implies_bold(weight) {
	const n = parseInt(normalize_font_weight(weight) || '400', 10);
	return n >= 600;
}

assert.deepStrictEqual(
	getFontWeightList('Roboto', googleFontsCache, []),
	['Thin (100)','ExtraLight (200)','Light (300)','Regular (400)','Medium (500)','SemiBold (600)','Bold (700)','ExtraBold (800)','Black (900)']
);

const merged = getFontWeightList('Roboto', googleFontsCache, ['Regular']);
assert.ok(merged.includes('Thin (100)') && merged.includes('Black (900)') && merged.includes('Regular (400)'));
assert.ok(merged.length >= 9, 'Roboto should list full weight range');

assert.deepStrictEqual(
	getFontWeightList('MyLocalFace', googleFontsCache, ['Thin', 'Regular', 'Bold Italic', 'Black']),
	['Thin (100)', 'Regular (400)', 'Bold (700)', 'Black (900)']
);

assert.deepStrictEqual(getFontWeightList('TotallyUnknown', googleFontsCache, []), ['Regular (400)', 'Bold (700)']);

assert.strictEqual(formatWeightLabel('Light'), 'Light (300)');
assert.strictEqual(formatWeightLabel('Thin'), 'Thin (100)');
assert.strictEqual(formatWeightLabel('300'), 'Light (300)');
assert.strictEqual(styleNameToCssWeight('Thin'), '100');
assert.strictEqual(styleNameToCssWeight('ExtraLight'), '200');
assert.strictEqual(styleNameToCssWeight('Light'), '300');
assert.strictEqual(styleNameToCssWeight('Black'), '900');
assert.strictEqual(normalize_font_weight('Light (300)'), '300');
assert.strictEqual(normalize_font_weight('Thin (100)'), '100');

assert.strictEqual(weight_implies_bold('Regular (400)'), false);
assert.strictEqual(weight_implies_bold('Medium (500)'), false);
assert.strictEqual(weight_implies_bold('SemiBold (600)'), true);
assert.strictEqual(weight_implies_bold('Bold (700)'), true);
assert.strictEqual(weight_implies_bold('700'), true);
assert.strictEqual(weight_implies_bold('Thin (100)'), false);

console.log('smoke-font-weights: OK', {
	roboto: getFontWeightList('Roboto', googleFontsCache, []),
});
