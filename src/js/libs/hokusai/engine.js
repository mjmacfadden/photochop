/**
 * Hokusai (MyPaint-compatible) WASM brush engine integration for Vantage Point.
 *
 * Loads the vendored wasm-bindgen package under this directory, parses .myb
 * presets, and strokes onto an offscreen HokusaiCanvas. Because upstream
 * pixels() composites over white (alpha forced to 255), we convert
 * white-background RGB into approximate straight RGBA before compositing
 * onto the active raster layer tmp canvas.
 *
 * Performance notes:
 * - flushToStrokeCanvas converts only the dirty AABB of the current stroke
 *   (expanded by brush radius) instead of the full frame when possible.
 * - Callers should throttle composites to animation frames and avoid a full
 *   Base_layers.render() during the stroke (use render_interactive_layer).
 */

import init, { HokusaiBrush, HokusaiCanvas } from './hokusai_wasm.js';
import wasmUrl from './hokusai_wasm_bg.wasm';
import presetsManifest from './presets.json';
import paintMyb from './brushes/paint.myb';
import pencilMyb from './brushes/pencil.myb';
import inkMyb from './brushes/ink.myb';
import BrushLibrary from './../brushes/library.js';

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
 * When a dirty rect is provided, only that region is written into `out`
 * (full-buffer length; untouched pixels remain 0).
 */
function whiteBgToStraightRgba(src, width, height, dirty) {
	var out = new Uint8ClampedArray(src.length);
	var x0 = 0;
	var y0 = 0;
	var x1 = width;
	var y1 = height;
	if (dirty) {
		x0 = Math.max(0, dirty.x | 0);
		y0 = Math.max(0, dirty.y | 0);
		x1 = Math.min(width, dirty.x + dirty.w);
		y1 = Math.min(height, dirty.y + dirty.h);
	}
	for (var y = y0; y < y1; y++) {
		var row = y * width * 4;
		for (var x = x0; x < x1; x++) {
			var i = row + x * 4;
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
	}
	return out;
}

function resolveHokusaiId(name) {
	if (!name) return null;
	var id = typeof name === 'object' ? (name.value || name) : name;
	if (HOKUSAI_PRESET_IDS.indexOf(id) !== -1) return id;
	// New vpbrush ids (paint-basic, ink-fineliner, …)
	var mapped = BrushLibrary.hokusaiPresetId(id);
	if (mapped && HOKUSAI_PRESET_IDS.indexOf(mapped) !== -1) return mapped;
	return null;
}

function isHokusaiPreset(name) {
	if (!name) return false;
	var id = typeof name === 'object' ? (name.value || name) : name;
	if (HOKUSAI_PRESET_IDS.indexOf(id) !== -1) return true;
	return BrushLibrary.isHokusaiBrush(id);
}

function normalizePresetId(name) {
	return resolveHokusaiId(name);
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
		this.sizePx = 13;
		this.dirty = null; // {x,y,w,h} in layer pixels
		this.strokeCanvas = document.createElement('canvas');
		this.strokeCanvas.width = width;
		this.strokeCanvas.height = height;
		this.strokeCtx = this.strokeCanvas.getContext('2d', { willReadFrequently: true });
	}

	setPreset(presetId) {
		var resolved = resolveHokusaiId(presetId) || presetId;
		var json = MYB_BY_ID[resolved];
		if (!json) {
			throw new Error('Unknown Hokusai preset: ' + presetId);
		}
		this.brush = new HokusaiBrush(json);
		this.presetId = resolved;
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
		this.sizePx = Math.max(1, sizePx || 13);
		var radius = Math.max(0.5, this.sizePx / 2);
		this.brush.setRadiusLog(Math.log2(radius));
	}

	_expandDirty(x, y) {
		var pad = Math.ceil(this.sizePx * 1.5) + 4;
		var x0 = Math.floor(x - pad);
		var y0 = Math.floor(y - pad);
		var x1 = Math.ceil(x + pad);
		var y1 = Math.ceil(y + pad);
		if (!this.dirty) {
			this.dirty = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
			return;
		}
		var dx0 = Math.min(this.dirty.x, x0);
		var dy0 = Math.min(this.dirty.y, y0);
		var dx1 = Math.max(this.dirty.x + this.dirty.w, x1);
		var dy1 = Math.max(this.dirty.y + this.dirty.h, y1);
		this.dirty.x = dx0;
		this.dirty.y = dy0;
		this.dirty.w = dx1 - dx0;
		this.dirty.h = dy1 - dy0;
	}

	getDirtyRect() {
		if (!this.dirty) return null;
		var x = Math.max(0, this.dirty.x | 0);
		var y = Math.max(0, this.dirty.y | 0);
		var x1 = Math.min(this.width, this.dirty.x + this.dirty.w);
		var y1 = Math.min(this.height, this.dirty.y + this.dirty.h);
		if (x1 <= x || y1 <= y) return null;
		return { x: x, y: y, w: x1 - x, h: y1 - y };
	}

	beginStroke() {
		this.canvas.clear();
		this.canvas.resetStroke();
		this.lastT = performance.now();
		this.dirty = null;
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
		this._expandDirty(x, y);
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
	 * Uses the stroke dirty AABB when available.
	 * @returns {HTMLCanvasElement}
	 */
	flushToStrokeCanvas() {
		var px = this.canvas.pixels();
		var dirty = this.getDirtyRect();
		// Full-frame fallback if dirty covers most of the canvas or is missing
		var useDirty = dirty && (dirty.w * dirty.h) < (this.width * this.height * 0.85);
		var rgba = whiteBgToStraightRgba(
			px,
			this.width,
			this.height,
			useDirty ? dirty : null
		);
		if (useDirty && dirty) {
			// Clear previous dirty region content then put only the rect
			// (strokeCanvas was cleared at beginStroke; subsequent flushes
			// overwrite growing dirty AABB).
			var img = new ImageData(dirty.w, dirty.h);
			for (var row = 0; row < dirty.h; row++) {
				var srcOff = ((dirty.y + row) * this.width + dirty.x) * 4;
				var dstOff = row * dirty.w * 4;
				img.data.set(rgba.subarray(srcOff, srcOff + dirty.w * 4), dstOff);
			}
			this.strokeCtx.putImageData(img, dirty.x, dirty.y);
		} else {
			var full = new ImageData(rgba, this.width, this.height);
			this.strokeCtx.putImageData(full, 0, 0);
		}
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
