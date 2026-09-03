/**
 * Hokusai (MyPaint-compatible) WASM brush engine integration for Vantage Point.
 *
 * Loads the vendored wasm-bindgen package under this directory, parses .myb
 * presets, and strokes onto an offscreen HokusaiCanvas. Because upstream
 * pixels() composites over white (alpha forced to 255), we convert
 * white-background RGB into approximate straight RGBA before compositing
 * onto the active raster layer tmp canvas.
 */

import init, { HokusaiBrush, HokusaiCanvas } from './hokusai_wasm.js';
import wasmUrl from './hokusai_wasm_bg.wasm';
import presetsManifest from './presets.json';
import paintMyb from './brushes/paint.myb';
import pencilMyb from './brushes/pencil.myb';
import inkMyb from './brushes/ink.myb';

const MYB_BY_ID = {
	Paint: paintMyb,
	Pencil: pencilMyb,
	Ink: inkMyb,
};

const HOKUSAI_PRESET_IDS = Object.keys(MYB_BY_ID);

let initPromise = null;
let ready = false;

function ensureInit() {
	if (!initPromise) {
		initPromise = init(wasmUrl).then(() => {
			ready = true;
			return true;
		}).catch((err) => {
			ready = false;
			initPromise = null;
			throw err;
		});
	}
	return initPromise;
}

function hexToRgb01(hex) {
	if (!hex || typeof hex !== 'string') {
		return { r: 0, g: 0, b: 0 };
	}
	var h = hex.replace('#', '');
	if (h.length === 3) {
		h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
	}
	var n = parseInt(h, 16);
	if (isNaN(n)) {
		return { r: 0, g: 0, b: 0 };
	}
	return {
		r: ((n >> 16) & 255) / 255,
		g: ((n >> 8) & 255) / 255,
		b: (n & 255) / 255,
	};
}

function rgbToHsv(r, g, b) {
	var max = Math.max(r, g, b);
	var min = Math.min(r, g, b);
	var d = max - min;
	var v = max;
	var s = max === 0 ? 0 : d / max;
	var h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
		if (h < 0) h += 1;
	}
	return { h: h, s: s, v: v };
}

/**
 * Convert white-composited RGBA8 (alpha always 255) into approximate
 * straight RGBA suitable for source-over onto a transparent canvas.
 */
function whiteBgToStraightRgba(src) {
	var out = new Uint8ClampedArray(src.length);
	for (var i = 0; i < src.length; i += 4) {
		var r = src[i];
		var g = src[i + 1];
		var b = src[i + 2];
		var a = Math.max(255 - r, 255 - g, 255 - b);
		if (a <= 0) {
			continue;
		}
		var af = a / 255;
		out[i] = Math.min(255, Math.max(0, Math.round((r - 255 * (1 - af)) / af)));
		out[i + 1] = Math.min(255, Math.max(0, Math.round((g - 255 * (1 - af)) / af)));
		out[i + 2] = Math.min(255, Math.max(0, Math.round((b - 255 * (1 - af)) / af)));
		out[i + 3] = a;
	}
	return out;
}

function isHokusaiPreset(name) {
	if (!name) return false;
	var id = typeof name === 'object' ? (name.value || name) : name;
	return HOKUSAI_PRESET_IDS.indexOf(id) !== -1;
}

function normalizePresetId(name) {
	if (!name) return null;
	var id = typeof name === 'object' ? (name.value || name) : name;
	return HOKUSAI_PRESET_IDS.indexOf(id) !== -1 ? id : null;
}

class HokusaiSession {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.canvas = new HokusaiCanvas(width, height);
		this.brush = null;
		this.presetId = null;
		this.designedRadiusLog = 1.0;
		this.lastT = 0;
		this.strokeCanvas = document.createElement('canvas');
		this.strokeCanvas.width = width;
		this.strokeCanvas.height = height;
		this.strokeCtx = this.strokeCanvas.getContext('2d', { willReadFrequently: true });
	}

	setPreset(presetId) {
		var json = MYB_BY_ID[presetId];
		if (!json) {
			throw new Error('Unknown Hokusai preset: ' + presetId);
		}
		this.brush = new HokusaiBrush(json);
		this.presetId = presetId;
		this.designedRadiusLog = this.brush.radiusLog();
	}

	setColorHex(hex) {
		if (!this.brush) return;
		var rgb = hexToRgb01(hex);
		var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
		this.brush.setColorHsv(hsv.h, hsv.s, hsv.v);
	}

	/**
	 * Map UI size (px diameter-ish) onto libmypaint radius_logarithmic.
	 * radius_log = log2(radius_px); diameter ~= size.
	 */
	setSizePx(sizePx) {
		if (!this.brush) return;
		var radius = Math.max(0.5, (sizePx || 13) / 2);
		this.brush.setRadiusLog(Math.log2(radius));
	}

	beginStroke() {
		this.canvas.clear();
		this.canvas.resetStroke();
		this.lastT = performance.now();
		this.strokeCtx.clearRect(0, 0, this.width, this.height);
	}

	/**
	 * @param {number} x layer-local x
	 * @param {number} y layer-local y
	 * @param {number} pressure 0..1
	 * @param {number} [xtilt]
	 * @param {number} [ytilt]
	 * @param {number} [timeStamp] ms
	 */
	strokeTo(x, y, pressure, xtilt, ytilt, timeStamp) {
		if (!this.brush) return;
		var now = timeStamp != null ? timeStamp : performance.now();
		var dt = Math.max(0.001, (now - this.lastT) / 1000);
		this.lastT = now;
		this.canvas.strokeTo(
			this.brush,
			x,
			y,
			pressure,
			xtilt || 0,
			ytilt || 0,
			dt
		);
	}

	finishStroke() {
		if (!this.brush) return;
		this.canvas.finishStroke(this.brush);
	}

	/**
	 * Refresh strokeCanvas with current engine pixels (white→alpha).
	 * @returns {HTMLCanvasElement}
	 */
	flushToStrokeCanvas() {
		var px = this.canvas.pixels();
		var rgba = whiteBgToStraightRgba(px);
		var img = new ImageData(rgba, this.width, this.height);
		this.strokeCtx.putImageData(img, 0, 0);
		return this.strokeCanvas;
	}

	dispose() {
		try {
			if (this.canvas && this.canvas.free) this.canvas.free();
		} catch (e) { /* ignore */ }
		try {
			if (this.brush && this.brush.free) this.brush.free();
		} catch (e) { /* ignore */ }
		this.canvas = null;
		this.brush = null;
	}
}

async function createSession(width, height, presetId) {
	await ensureInit();
	var session = new HokusaiSession(width, height);
	session.setPreset(presetId);
	return session;
}

export {
	ensureInit,
	createSession,
	isHokusaiPreset,
	normalizePresetId,
	HOKUSAI_PRESET_IDS,
	presetsManifest,
	HokusaiSession,
};

export default {
	ensureInit,
	createSession,
	isHokusaiPreset,
	normalizePresetId,
	HOKUSAI_PRESET_IDS,
	presetsManifest,
};
