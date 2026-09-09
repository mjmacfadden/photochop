/*
 * WebGL Renderer for PhotoChop.
 *
 * GPU-accelerated layer compositing using WebGL2 (with WebGL1 fallback).
 * Renders layers as textured quads with opacity, visibility, layer masks,
 * blend modes (source-over, multiply, screen, overlay, darken, lighten,
 * difference, hard-light, color-dodge, soft-light, color-burn, exclusion),
 * adjustment layers, and CSS-like layer.filters including blur/shadow/
 * outer-glow (CSS bake) plus stroke/inner-glow (Canvas2D bake) with padding.
 *
 * Architecture:
 *   CPU document (config.layers) --> GPU textures --> WebGL compositing --> offscreen canvas
 *   Offscreen canvas --> drawImage onto main canvas (for overlays)
 *
 * Interactive quality:
 *   set_composite_scale(0.5) renders the offscreen FB at half document
 *   resolution; the caller upscales with drawImage. Full scale (1) on idle.
 *
 * Key design decisions:
 *   - Document model remains CPU-side (config.layers is authoritative)
 *   - GPU textures are cached and invalidated only when layer data changes
 *   - WebGL canvas is offscreen; main canvas stays 2D for tool overlays
 *   - Falls back gracefully if WebGL is unavailable
 *   - Handles context loss by rebuilding from CPU document
 *   - Mask sampling is document-space (linked rotation supported)
 *   - Non-normal blends + adjustments sample the current framebuffer via
 *     copyTexImage2D and composite in the fragment shader
 *   - Canvas2D remains the correctness fallback for filters and unsupported
 *     blend / Porter-Duff modes (including source-atop clipping)
 *
 * Still Canvas2D-only (can_render_layers returns false):
 *   - Unsupported adjustment types / non-source-over adjustments
 *   - Blend modes other than the GPU set below
 *   - source-atop when the clip base has alpha-expanding filters
 *     (shadow / outer_glow / blur / stroke) — falls back for correctness
 *   - Other Porter-Duff modes beyond source-over / source-atop / GPU blends
 */

import { is_group, is_effectively_visible } from "./../../libs/layer-tree.js";

import config from './../../config.js';
import zoomView from './../../libs/zoomView.js';

var instance = null;

// ---- GLSL Shaders ----

// Blend mode ids shared with can_render_layers / _blend_mode_id
var BLEND_NORMAL = 0;
var BLEND_MULTIPLY = 1;
var BLEND_SCREEN = 2;
var BLEND_OVERLAY = 3;
var BLEND_DARKEN = 4;
var BLEND_LIGHTEN = 5;
var BLEND_DIFFERENCE = 6;
var BLEND_HARD_LIGHT = 7;
var BLEND_COLOR_DODGE = 8;
var BLEND_SOFT_LIGHT = 9;
var BLEND_COLOR_BURN = 10;
var BLEND_EXCLUSION = 11;
var BLEND_SOURCE_ATOP = 12;

var GPU_BLEND_MODES = {
	'source-over': BLEND_NORMAL,
	'multiply': BLEND_MULTIPLY,
	'screen': BLEND_SCREEN,
	'overlay': BLEND_OVERLAY,
	'darken': BLEND_DARKEN,
	'lighten': BLEND_LIGHTEN,
	'difference': BLEND_DIFFERENCE,
	'hard-light': BLEND_HARD_LIGHT,
	'color-dodge': BLEND_COLOR_DODGE,
	'soft-light': BLEND_SOFT_LIGHT,
	'color-burn': BLEND_COLOR_BURN,
	'exclusion': BLEND_EXCLUSION,
	'source-atop': BLEND_SOURCE_ATOP,
};

// Layer.filters names that can be baked via Canvas2D CSS filter on upload.
// Spatial filters (blur/shadow) bake with padding so bleed is not clipped.
var GPU_LAYER_FILTER_NAMES = {
	'brightness': true,
	'contrast': true,
	'hue-rotate': true,
	'saturate': true,
	'grayscale': true,
	'invert': true,
	'sepia': true,
	'blur': true,
	'shadow': true,
	'outer_glow': true,
	// stroke / inner_glow / color_overlay bake via Canvas2D multipass (not a single CSS filter)
	'stroke': true,
	'inner_glow': true,
	'color_overlay': true,
};

// Filters that expand alpha / silhouette — unsafe as a source-atop clip base on GPU
var GPU_CLIP_BASE_UNSAFE_FILTERS = {
	'blur': true,
	'shadow': true,
	'outer_glow': true,
	'stroke': true,
};

// Adjustment type ids for the fragment shader
var ADJ_NONE = 0;
var ADJ_BRIGHTNESS_CONTRAST = 1;
var ADJ_HUE_SAT = 2;
var ADJ_EXPOSURE = 3;
var ADJ_GRAYSCALE = 4;
var ADJ_INVERT = 5;
var ADJ_SEPIA = 6;
var ADJ_THRESHOLD = 7;

var VERT_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
uniform vec4 u_dstRect;
uniform float u_rotation;
varying vec2 v_texCoord;
varying vec2 v_docPos;

void main() {
	// Map quad vertices from [0,1] to destination rectangle in pixels
	vec2 pos = u_dstRect.xy + a_position * u_dstRect.zw;

	// Apply rotation around the center of the destination rectangle
	if (u_rotation != 0.0) {
		vec2 center = u_dstRect.xy + u_dstRect.zw * 0.5;
		float c = cos(u_rotation);
		float s = sin(u_rotation);
		vec2 d = pos - center;
		pos = center + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
	}

	v_docPos = pos;

	// Convert pixels to clip space: [0, resolution] -> [-1, 1]
	// Flip Y because WebGL origin is bottom-left, canvas origin is top-left
	vec2 clipSpace = (pos / u_resolution) * 2.0 - 1.0;
	gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

	v_texCoord = a_texCoord;
}
`;

var FRAG_SHADER = `
precision mediump float;

uniform sampler2D u_layerTexture;
uniform sampler2D u_dstTexture;
uniform sampler2D u_maskTexture;
uniform float u_opacity;
uniform float u_blendMode;
uniform float u_hasMask;
uniform float u_needsDst;
uniform float u_isAdjustment;
uniform float u_adjType;
uniform vec4 u_adjParams;
uniform vec4 u_maskRect;
uniform vec2 u_layerTopLeft;
uniform vec2 u_layerCenter;
uniform float u_maskRotate;
uniform vec2 u_resolution;

varying vec2 v_texCoord;
varying vec2 v_docPos;

float mask_alpha_at(vec2 docPos) {
	if (u_hasMask < 0.5) {
		return 1.0;
	}

	vec2 samplePos = docPos;
	if (u_maskRotate != 0.0) {
		float c = cos(-u_maskRotate);
		float s = sin(-u_maskRotate);
		vec2 d = docPos - u_layerCenter;
		samplePos = u_layerCenter + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
		vec2 local = samplePos - u_layerTopLeft;
		vec2 maskOrigin = u_maskRect.xy - u_layerTopLeft;
		vec2 uv = (local - maskOrigin) / u_maskRect.zw;
		if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
			return 0.0;
		}
		vec4 m = texture2D(u_maskTexture, uv);
		return m.r * 0.2126 + m.g * 0.7152 + m.b * 0.0722;
	}

	vec2 uv = (docPos - u_maskRect.xy) / u_maskRect.zw;
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
		return 0.0;
	}
	vec4 m = texture2D(u_maskTexture, uv);
	return m.r * 0.2126 + m.g * 0.7152 + m.b * 0.0722;
}

vec3 blend_channel(vec3 cb, vec3 cs, float mode) {
	if (mode < 0.5) {
		return cs;
	}
	if (mode < 1.5) {
		return cb * cs;
	}
	if (mode < 2.5) {
		return cb + cs - cb * cs;
	}
	if (mode < 3.5) {
		return vec3(
			cb.r <= 0.5 ? (2.0 * cb.r * cs.r) : (1.0 - 2.0 * (1.0 - cb.r) * (1.0 - cs.r)),
			cb.g <= 0.5 ? (2.0 * cb.g * cs.g) : (1.0 - 2.0 * (1.0 - cb.g) * (1.0 - cs.g)),
			cb.b <= 0.5 ? (2.0 * cb.b * cs.b) : (1.0 - 2.0 * (1.0 - cb.b) * (1.0 - cs.b))
		);
	}
	if (mode < 4.5) {
		return min(cb, cs);
	}
	if (mode < 5.5) {
		return max(cb, cs);
	}
	if (mode < 6.5) {
		return abs(cb - cs);
	}
	if (mode < 7.5) {
		// hard-light = overlay with src/dst swapped
		return vec3(
			cs.r <= 0.5 ? (2.0 * cb.r * cs.r) : (1.0 - 2.0 * (1.0 - cb.r) * (1.0 - cs.r)),
			cs.g <= 0.5 ? (2.0 * cb.g * cs.g) : (1.0 - 2.0 * (1.0 - cb.g) * (1.0 - cs.g)),
			cs.b <= 0.5 ? (2.0 * cb.b * cs.b) : (1.0 - 2.0 * (1.0 - cb.b) * (1.0 - cs.b))
		);
	}
	if (mode < 8.5) {
		// color-dodge
		return vec3(
			cs.r >= 1.0 ? 1.0 : min(1.0, cb.r / max(1.0 - cs.r, 0.0001)),
			cs.g >= 1.0 ? 1.0 : min(1.0, cb.g / max(1.0 - cs.g, 0.0001)),
			cs.b >= 1.0 ? 1.0 : min(1.0, cb.b / max(1.0 - cs.b, 0.0001))
		);
	}
	if (mode < 9.5) {
		// soft-light (W3C / Canvas compositing)
		float dr = cb.r <= 0.25 ? ((16.0 * cb.r - 12.0) * cb.r + 4.0) * cb.r : sqrt(cb.r);
		float dg = cb.g <= 0.25 ? ((16.0 * cb.g - 12.0) * cb.g + 4.0) * cb.g : sqrt(cb.g);
		float db = cb.b <= 0.25 ? ((16.0 * cb.b - 12.0) * cb.b + 4.0) * cb.b : sqrt(cb.b);
		return vec3(
			cs.r <= 0.5 ? (cb.r - (1.0 - 2.0 * cs.r) * cb.r * (1.0 - cb.r)) : (cb.r + (2.0 * cs.r - 1.0) * (dr - cb.r)),
			cs.g <= 0.5 ? (cb.g - (1.0 - 2.0 * cs.g) * cb.g * (1.0 - cb.g)) : (cb.g + (2.0 * cs.g - 1.0) * (dg - cb.g)),
			cs.b <= 0.5 ? (cb.b - (1.0 - 2.0 * cs.b) * cb.b * (1.0 - cb.b)) : (cb.b + (2.0 * cs.b - 1.0) * (db - cb.b))
		);
	}
	if (mode < 10.5) {
		// color-burn
		return vec3(
			cs.r <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.r) / max(cs.r, 0.0001)),
			cs.g <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.g) / max(cs.g, 0.0001)),
			cs.b <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - cb.b) / max(cs.b, 0.0001))
		);
	}
	// exclusion
	return cb + cs - 2.0 * cb * cs;
}

vec3 hue_rotate(vec3 color, float angleDeg) {
	float angle = angleDeg * 3.14159265 / 180.0;
	float s = sin(angle);
	float c = cos(angle);
	mat3 mh = mat3(
		vec3(0.213 + 0.787 * c - 0.213 * s, 0.213 - 0.213 * c + 0.143 * s, 0.213 - 0.213 * c - 0.787 * s),
		vec3(0.715 - 0.715 * c - 0.715 * s, 0.715 + 0.285 * c + 0.140 * s, 0.715 - 0.715 * c + 0.715 * s),
		vec3(0.072 - 0.072 * c + 0.928 * s, 0.072 - 0.072 * c - 0.283 * s, 0.072 + 0.928 * c + 0.072 * s)
	);
	return clamp(mh * color, 0.0, 1.0);
}

vec3 apply_adjustment(vec3 color) {
	float t = u_adjType;
	vec4 p = u_adjParams;
	if (t < 0.5) {
		return color;
	}
	if (t < 1.5) {
		color *= p.x;
		color = (color - 0.5) * p.y + 0.5;
		return clamp(color, 0.0, 1.0);
	}
	if (t < 2.5) {
		color = hue_rotate(color, p.x);
		float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
		color = mix(vec3(luma), color, p.y);
		color *= p.z;
		return clamp(color, 0.0, 1.0);
	}
	if (t < 3.5) {
		vec3 v = color * p.x + p.y;
		v = max(v, vec3(0.0));
		float invG = p.z;
		v = vec3(pow(v.r, invG), pow(v.g, invG), pow(v.b, invG));
		return clamp(v, 0.0, 1.0);
	}
	if (t < 4.5) {
		float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
		return mix(color, vec3(luma), p.x);
	}
	if (t < 5.5) {
		return mix(color, 1.0 - color, p.x);
	}
	if (t < 6.5) {
		vec3 sep = vec3(
			dot(color, vec3(0.393, 0.769, 0.189)),
			dot(color, vec3(0.349, 0.686, 0.168)),
			dot(color, vec3(0.272, 0.534, 0.131))
		);
		return clamp(mix(color, sep, p.x), 0.0, 1.0);
	}
	float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
	float vv = lum >= p.x ? 1.0 : 0.0;
	return vec3(vv);
}

void main() {
	vec2 dstUV = vec2(v_docPos.x / u_resolution.x, 1.0 - v_docPos.y / u_resolution.y);

	if (u_isAdjustment > 0.5) {
		vec4 dst = texture2D(u_dstTexture, dstUV);
		float maskA = mask_alpha_at(v_docPos);
		float cov = maskA * u_opacity;
		vec3 adj = apply_adjustment(dst.rgb);

		if (cov >= 0.999 && u_hasMask < 0.5) {
			gl_FragColor = vec4(adj, dst.a);
			return;
		}

		float as = dst.a * cov;
		float ab = dst.a;
		float ao = as + ab * (1.0 - as);
		if (ao <= 0.0001) {
			gl_FragColor = vec4(0.0);
			return;
		}
		vec3 Co = (as * adj + ab * (1.0 - as) * dst.rgb) / ao;
		gl_FragColor = vec4(Co, ao);
		return;
	}

	vec4 src = texture2D(u_layerTexture, v_texCoord);
	float maskA = mask_alpha_at(v_docPos);
	src.a *= u_opacity * maskA;

	if (u_needsDst < 0.5) {
		gl_FragColor = src;
		return;
	}

	vec4 dst = texture2D(u_dstTexture, dstUV);

	float as = src.a;
	float ab = dst.a;
	vec3 Cs = src.rgb;
	vec3 Cb = dst.rgb;

	// Porter-Duff source-atop (clipping mask): αo = αb
	if (u_blendMode > 11.5 && u_blendMode < 12.5) {
		if (ab <= 0.0001) {
			gl_FragColor = vec4(0.0);
			return;
		}
		float ao = ab;
		vec3 Co = (as * ab * Cs + ab * (1.0 - as) * Cb) / ao;
		gl_FragColor = vec4(Co, ao);
		return;
	}

	float ao = as + ab * (1.0 - as);
	if (ao <= 0.0001) {
		gl_FragColor = vec4(0.0);
		return;
	}

	vec3 B = blend_channel(Cb, Cs, u_blendMode);
	vec3 Co = (as * (1.0 - ab) * Cs + ab * (1.0 - as) * Cb + as * ab * B) / ao;
	gl_FragColor = vec4(Co, ao);
}
`;

/**
 * WebGL Renderer class.
 */
class WebGL_renderer_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		/** @type {'webgl'} */
		this.type = 'webgl';

		/** @type {boolean} */
		this.available = false;

		/** @type {HTMLCanvasElement} offscreen canvas for WebGL rendering */
		this.glCanvas = null;

		/** @type {WebGLRenderingContext|WebGL2RenderingContext} */
		this.gl = null;

		/** @type {WebGLProgram} */
		this.program = null;

		/** @type {WebGLBuffer} vertex buffer for fullscreen quad */
		this.quadVBO = null;

		/** @type {WebGLBuffer} texture coordinate buffer */
		this.quadTCO = null;

		/** @type {number} texture unit counter for multi-texture binding */
		this.textureUnit = 0;

		/** @type {Object} uniform locations */
		this.uniforms = {};

		/** @type {Object.<number, {texture: WebGLTexture, width: number, height: number}>} */
		this.textureCache = {};

		/** @type {Object.<number, {texture: WebGLTexture, width: number, height: number, source: any}>} */
		this.maskTextureCache = {};

		/** @type {WebGLTexture|null} snapshot of the current framebuffer for shader blends */
		this.dstTexture = null;

		/** @type {number} */
		this.dstTextureWidth = 0;

		/** @type {number} */
		this.dstTextureHeight = 0;

		/** @type {number} document width */
		this.docWidth = 0;

		/** @type {number} document height */
		this.docHeight = 0;

		/** @type {number} max GPU texture size */
		this.maxTextureSize = 0;

		/** @type {boolean} whether context loss has been detected */
		this.contextLost = false;

		/** @type {number} interactive composite scale (1 = full, 0.5 = half-res) */
		this.compositeScale = 1;

		/** @type {number} logical document width (unscaled) */
		this.logicalWidth = 0;

		/** @type {number} logical document height (unscaled) */
		this.logicalHeight = 0;
	}

	// ---- Initialization ----

	/**
	 * Reports whether the GPU path can faithfully render the given layer stack.
	 * The caller falls back to the Canvas 2D pipeline when this returns false.
	 *
	 * GPU-supported: source-over / multiply / screen / overlay / darken /
	 * lighten / difference / hard-light / color-dodge / soft-light /
	 * color-burn / exclusion / source-atop (simple clipping), optional layer
	 * masks, and a subset of adjustment layers (brightness/contrast, hue-sat,
	 * exposure, grayscale, invert, sepia, threshold) at source-over, plus
	 * CSS-like layer.filters (blur/shadow/outer_glow) and stroke/inner_glow
	 * baked on upload with padding. Still deferred to Canvas 2D: unsupported
	 * adjustments/blends, source-atop when the clip base expands alpha.
	 *
	 * @param {Object[]} layers - sorted top-first (index 0 = top)
	 * @param {number|null} disabled_filter_id - id of the currently disabled
	 *   filter (matched the same way the Canvas 2D pipeline skips it)
	 * @returns {boolean}
	 */
	can_render_layers(layers, disabled_filter_id) {
		for (var i = 0; i < layers.length; i++) {
			var layer = layers[i];
			if (layer == null || layer.type == null || is_group(layer) || !is_effectively_visible(layer))
				continue;

			if (layer.type === 'adjustment') {
				if (!this._gpu_supports_adjustment(layer)) {
					return false;
				}
				continue;
			}

			if (!this._layer_filters_gpu_ok(layer, disabled_filter_id)) {
				return false;
			}

			var composition = layer.composition == null ? 'source-over' : layer.composition;
			if (!Object.prototype.hasOwnProperty.call(GPU_BLEND_MODES, composition)) {
				return false;
			}

			// source-atop clips to FB alpha. If the clip base has baked
			// alpha-expanding filters (shadow/glow/blur/stroke), fall back so
			// we do not clip to the expanded silhouette.
			if (composition === 'source-atop') {
				if (!this._source_atop_gpu_ok(layers, i, disabled_filter_id)) {
					return false;
				}
			}

			// Masked layers are GPU-supported when mask.link / link_canvas exists.
			// Disabled masks are ignored (same as Canvas2D).
			if (layer.mask && layer.mask.enabled !== false) {
				var maskSource = layer.mask.link_canvas || layer.mask.link;
				if (!maskSource) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * layers is top-first. For a source-atop layer at index i, walk toward the
	 * bottom (higher index) past other source-atop siblings to the clip base.
	 * Reject when that base has alpha-expanding filters.
	 */
	_source_atop_gpu_ok(layers, clipIndex, disabled_filter_id) {
		var base = null;
		for (var j = clipIndex + 1; j < layers.length; j++) {
			var cand = layers[j];
			if (cand == null || cand.type == null || is_group(cand) || !is_effectively_visible(cand))
				continue;
			var comp = cand.composition == null ? 'source-over' : cand.composition;
			if (comp === 'source-atop') {
				continue;
			}
			base = cand;
			break;
		}
		if (!base) {
			// Clipped with no base — Canvas2D also produces odd results; stay safe.
			return false;
		}
		if (base.type === 'adjustment') {
			return false;
		}
		return !this._layer_has_unsafe_clip_filters(base, disabled_filter_id);
	}

	_layer_has_unsafe_clip_filters(layer, disabled_filter_id) {
		var filters = layer.filters;
		if (!filters || !filters.length) return false;
		for (var f = 0; f < filters.length; f++) {
			var filter = filters[f];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(disabled_filter_id)) {
				if (disabled_filter_id.includes(filter.id) || disabled_filter_id.includes(filter.name)) continue;
			} else if (filter.id === disabled_filter_id || filter.name === disabled_filter_id) {
				continue;
			}
			var name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;
			if (name && GPU_CLIP_BASE_UNSAFE_FILTERS[name]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param {Object} layer
	 * @returns {boolean}
	 */

	/**
	 * True when every active layer.filters entry is GPU-bakeable
	 * (CSS color/spatial or stroke/inner_glow multipass).
	 * @param {Object} layer
	 * @param {number|string|Array|null} disabled_filter_id
	 * @returns {boolean}
	 */
	_layer_filters_gpu_ok(layer, disabled_filter_id) {
		var filters = layer.filters;
		if (!filters || !filters.length) return true;
		for (var f = 0; f < filters.length; f++) {
			var filter = filters[f];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(disabled_filter_id)) {
				if (disabled_filter_id.includes(filter.id) || disabled_filter_id.includes(filter.name)) continue;
			} else if (filter.id === disabled_filter_id || filter.name === disabled_filter_id) {
				continue;
			}
			var name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;
			if (!name || !GPU_LAYER_FILTER_NAMES[name]) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Build CSS filter string + cache signature for bakeable layer.filters.
	 * stroke / inner_glow are handled by _layer_effect_filters (not CSS).
	 * @param {Object} layer
	 * @param {number|string|Array|null} disabled_filter_id
	 * @returns {{css: string, signature: string, pad: number}|null}
	 */
	_layer_filters_css(layer, disabled_filter_id) {
		var filters = layer.filters;
		if (!filters || !filters.length) return null;
		var parts = [];
		var sig = [];
		var pad = 0;
		for (var f = 0; f < filters.length; f++) {
			var filter = filters[f];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(disabled_filter_id)) {
				if (disabled_filter_id.includes(filter.id) || disabled_filter_id.includes(filter.name)) continue;
			} else if (filter.id === disabled_filter_id || filter.name === disabled_filter_id) {
				continue;
			}
			var name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;
			// Multipass effects — not part of the CSS filter string
			if (name === 'stroke' || name === 'inner_glow' || name === 'color_overlay') {
				continue;
			}
			var params = filter.params || {};
			var value = params.value;
			var css = null;
			if (name === 'brightness') {
				var b = (value !== undefined) ? Number(value) : 0;
				css = 'brightness(' + (b / 100 + 1) + ')';
			} else if (name === 'contrast') {
				var c = (value !== undefined) ? Number(value) : 0;
				css = 'contrast(' + (c / 100 + 1) + ')';
			} else if (name === 'hue-rotate') {
				var h = (value !== undefined) ? Number(value) : 0;
				css = 'hue-rotate(' + h + 'deg)';
			} else if (name === 'saturate') {
				var s = (value !== undefined) ? Number(value) : 0;
				css = 'saturate(' + (s / 100 + 1) + ')';
			} else if (name === 'grayscale') {
				var g = (value !== undefined) ? Number(value) : 100;
				css = 'grayscale(' + (g / 100) + ')';
			} else if (name === 'invert') {
				var iv = (value !== undefined) ? Number(value) : 100;
				css = 'invert(' + (iv / 100) + ')';
			} else if (name === 'sepia') {
				var sv = (value !== undefined) ? Number(value) : 100;
				css = 'sepia(' + (sv / 100) + ')';
			} else if (name === 'blur') {
				var br = (value !== undefined) ? Number(value) : 0;
				if (!isFinite(br) || br < 0) br = 0;
				css = 'blur(' + br + 'px)';
				// CSS blur spreads ~radius; use 3x for safe bleed (matches browser gaussian tails).
				pad = Math.max(pad, Math.ceil(br * 3));
			} else if (name === 'shadow') {
				var sx = (params.x !== undefined) ? Number(params.x) : 0;
				var sy = (params.y !== undefined) ? Number(params.y) : 0;
				var sr = (value !== undefined) ? Number(value) : 0;
				var opacity = (params.opacity !== undefined) ? Number(params.opacity) : 100;
				if (!isFinite(sx)) sx = 0;
				if (!isFinite(sy)) sy = 0;
				if (!isFinite(sr) || sr < 0) sr = 0;
				if (!isFinite(opacity)) opacity = 100;
				var color = this._shadow_css_color(params.color || '#000000', opacity);
				css = 'drop-shadow(' + sx + 'px ' + sy + 'px ' + sr + 'px ' + color + ')';
				pad = Math.max(pad, Math.ceil(Math.max(Math.abs(sx), Math.abs(sy)) + sr * 3));
			} else if (name === 'outer_glow') {
				var ogr = (value !== undefined) ? Number(value) : 10;
				var ogOpacity = (params.opacity !== undefined) ? Number(params.opacity) : 75;
				if (!isFinite(ogr) || ogr < 0) ogr = 0;
				if (!isFinite(ogOpacity)) ogOpacity = 75;
				var ogColor = this._shadow_css_color(params.color || '#ffff00', ogOpacity);
				css = 'drop-shadow(0px 0px ' + ogr + 'px ' + ogColor + ')';
				pad = Math.max(pad, Math.ceil(ogr * 3));
			} else {
				return null;
			}
			parts.push(css);
			sig.push(name + ':' + JSON.stringify(params));
		}
		if (!parts.length) return null;
		return { css: parts.join(' '), signature: sig.join('|'), pad: pad };
	}

	/**
	 * Collect stroke / inner_glow / color_overlay filters for Canvas2D multipass bake.
	 * @returns {{effects: Object[], signature: string, pad: number}|null}
	 */
	_layer_effect_filters(layer, disabled_filter_id) {
		var filters = layer.filters;
		if (!filters || !filters.length) return null;
		var effects = [];
		var sig = [];
		var pad = 0;
		for (var f = 0; f < filters.length; f++) {
			var filter = filters[f];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(disabled_filter_id)) {
				if (disabled_filter_id.includes(filter.id) || disabled_filter_id.includes(filter.name)) continue;
			} else if (filter.id === disabled_filter_id || filter.name === disabled_filter_id) {
				continue;
			}
			var name = filter.name;
			var params = filter.params || {};
			if (name === 'stroke') {
				var size = (params.size !== undefined) ? Number(params.size) : 3;
				var position = params.position || 'outside';
				if (!isFinite(size) || size < 0) size = 0;
				if (position === 'outside' || position === 'center') {
					pad = Math.max(pad, Math.ceil(size) + 1);
				}
				effects.push(filter);
				sig.push('stroke:' + JSON.stringify(params));
			} else if (name === 'inner_glow') {
				effects.push(filter);
				sig.push('inner_glow:' + JSON.stringify(params));
			} else if (name === 'color_overlay') {
				effects.push(filter);
				sig.push('color_overlay:' + JSON.stringify(params));
			}
		}
		if (!effects.length) return null;
		return { effects: effects, signature: sig.join('|'), pad: pad };
	}

	/**
	 * Match Effects_shadow_class.get_shadow_color for bake parity.
	 * @param {string} color
	 * @param {number} opacity 0-100
	 * @returns {string}
	 */
	_shadow_css_color(color, opacity) {
		var alpha = Math.max(0, Math.min(1, opacity / 100));
		if (color && typeof color === 'string' && color.startsWith('#')) {
			var hex = color.replace('#', '');
			if (hex.length === 3) {
				hex = hex.split('').map(function (c) { return c + c; }).join('');
			}
			var r = parseInt(hex.substring(0, 2), 16) || 0;
			var g = parseInt(hex.substring(2, 4), 16) || 0;
			var b = parseInt(hex.substring(4, 6), 16) || 0;
			return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
		}
		return color || 'rgba(0,0,0,' + alpha + ')';
	}

	_gpu_supports_adjustment(layer) {
		var composition = layer.composition == null ? 'source-over' : layer.composition;
		if (composition !== 'source-over') {
			return false;
		}
		var info = this._adjustment_shader_params(layer);
		if (!info) {
			return false;
		}
		if (layer.mask && layer.mask.enabled !== false) {
			var maskSource = layer.mask.link_canvas || layer.mask.link;
			if (!maskSource) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Pack adjustment uniforms to match Canvas2D CSS / pixel algorithms.
	 * @param {Object} layer
	 * @returns {{type: number, params: number[]}|null}
	 */
	_adjustment_shader_params(layer) {
		var raw = layer.adjustment_type ? String(layer.adjustment_type).toLowerCase().replace(/_/g, '-') : '';
		var p = layer.params || {};
		var value = p.value;

		switch (raw) {
			case 'brightness': {
				var b = (value !== undefined) ? Number(value) : 0;
				var c = (p.contrast !== undefined) ? Number(p.contrast) : 0;
				return { type: ADJ_BRIGHTNESS_CONTRAST, params: [b / 100 + 1, c / 100 + 1, 0, 0] };
			}
			case 'contrast': {
				var cv = (value !== undefined) ? Number(value) : 0;
				return { type: ADJ_BRIGHTNESS_CONTRAST, params: [1, cv / 100 + 1, 0, 0] };
			}
			case 'brightness/contrast':
			case 'brightness-contrast': {
				var bb = (p.brightness !== undefined) ? Number(p.brightness) : ((value !== undefined) ? Number(value) : 0);
				var cc = (p.contrast !== undefined) ? Number(p.contrast) : 0;
				return { type: ADJ_BRIGHTNESS_CONTRAST, params: [bb / 100 + 1, cc / 100 + 1, 0, 0] };
			}
			case 'hue-saturation':
			case 'hue/saturation':
			case 'huesaturation': {
				var hue = (p.hue !== undefined) ? Number(p.hue) : ((value !== undefined) ? Number(value) : 0);
				var sat = (p.saturation !== undefined) ? Number(p.saturation) : 0;
				var light = (p.lightness !== undefined) ? Number(p.lightness) : 0;
				return { type: ADJ_HUE_SAT, params: [hue, sat / 100 + 1, light / 100 + 1, 0] };
			}
			case 'exposure': {
				var exposure = (p.exposure !== undefined) ? Number(p.exposure) : 0;
				var offset = (p.offset !== undefined) ? Number(p.offset) : 0;
				var gamma = (p.gamma !== undefined) ? Number(p.gamma) : 1;
				if (!isFinite(gamma) || gamma <= 0) gamma = 1;
				return { type: ADJ_EXPOSURE, params: [Math.pow(2, exposure), offset, 1 / gamma, 0] };
			}
			case 'grayscale': {
				var gv = (value !== undefined) ? Number(value) : 100;
				return { type: ADJ_GRAYSCALE, params: [gv / 100, 0, 0, 0] };
			}
			case 'invert': {
				var iv = (value !== undefined) ? Number(value) : 100;
				return { type: ADJ_INVERT, params: [iv / 100, 0, 0, 0] };
			}
			case 'sepia': {
				var sv = (value !== undefined) ? Number(value) : 100;
				return { type: ADJ_SEPIA, params: [sv / 100, 0, 0, 0] };
			}
			case 'threshold': {
				var th = (value !== undefined) ? Number(value) : 128;
				return { type: ADJ_THRESHOLD, params: [th / 255, 0, 0, 0] };
			}
			default:
				return null;
		}
	}

	/**
	 * @param {string|null|undefined} composition
	 * @returns {number}
	 */
	_blend_mode_id(composition) {
		if (composition == null || composition === undefined) {
			return BLEND_NORMAL;
		}
		return Object.prototype.hasOwnProperty.call(GPU_BLEND_MODES, composition)
			? GPU_BLEND_MODES[composition]
			: BLEND_NORMAL;
	}

	/**
	 * Initialize the renderer.
	 * @param {number} width - document width
	 * @param {number} height - document height
	 * @returns {boolean} true on success
	 */
	init(width, height) {
		this.docWidth = width;
		this.docHeight = height;
		this.logicalWidth = width;
		this.logicalHeight = height;
		this.compositeScale = 1;

		// Store reference to app's GUI_tools for non-image layer rendering
		this._gui_tools_ref = null;
		try {
			// The app module is a singleton; by the time init() is called,
			// app.GUI should be set. We access it via the module to avoid
			// circular import issues.
			var appModule = require('./../../app.js');
			var appDefault = appModule.default || appModule;
			if (appDefault && appDefault.GUI && appDefault.GUI.GUI_tools) {
				this._gui_tools_ref = appDefault.GUI.GUI_tools;
			}
		} catch (e) {
			// Will be retried on first render
		}

		// Create offscreen canvas
		this.glCanvas = document.createElement('canvas');
		this.glCanvas.width = width;
		this.glCanvas.height = height;

		// Try WebGL2 first, then WebGL1
		var gl = null;
		gl = this.glCanvas.getContext('webgl2', {
			alpha: true,
			premultipliedAlpha: false,
			preserveDrawingBuffer: false,
		});
		if (!gl) {
			gl = this.glCanvas.getContext('webgl', {
				alpha: true,
				premultipliedAlpha: false,
				preserveDrawingBuffer: false,
			});
		}
		if (!gl) {
			console.warn('WebGL renderer: WebGL not available, falling back to Canvas 2D');
			this.available = false;
			return false;
		}
		this.gl = gl;

		// Query GPU capabilities
		this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

		// Compile shaders and create program
		if (!this._init_program()) {
			console.error('WebGL renderer: shader compilation failed');
			this.available = false;
			return false;
		}

		// Create quad geometry
		this._init_quad();

		// Set up texture units
		this.textureUnit = 0;

		// Handle context loss/restore
		this._setup_context_loss_handlers();

		this.available = true;
		return true;
	}

	/**
	 * Compile and link the shader program.
	 * @returns {boolean}
	 */
	_init_program() {
		var gl = this.gl;

		var vert = this._compile_shader(gl.VERTEX_SHADER, VERT_SHADER);
		var frag = this._compile_shader(gl.FRAGMENT_SHADER, FRAG_SHADER);
		if (!vert || !frag) return false;

		var program = gl.createProgram();
		gl.attachShader(program, vert);
		gl.attachShader(program, frag);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error('WebGL renderer: program link error:', gl.getProgramInfoLog(program));
			gl.deleteProgram(program);
			return false;
		}

		// Clean up individual shaders (linked into program)
		gl.deleteShader(vert);
		gl.deleteShader(frag);

		this.program = program;
		gl.useProgram(program);

		// Cache uniform locations
		this.uniforms = {
			u_resolution: gl.getUniformLocation(program, 'u_resolution'),
			u_dstRect: gl.getUniformLocation(program, 'u_dstRect'),
			u_rotation: gl.getUniformLocation(program, 'u_rotation'),
			u_layerTexture: gl.getUniformLocation(program, 'u_layerTexture'),
			u_dstTexture: gl.getUniformLocation(program, 'u_dstTexture'),
			u_maskTexture: gl.getUniformLocation(program, 'u_maskTexture'),
			u_opacity: gl.getUniformLocation(program, 'u_opacity'),
			u_blendMode: gl.getUniformLocation(program, 'u_blendMode'),
			u_hasMask: gl.getUniformLocation(program, 'u_hasMask'),
			u_needsDst: gl.getUniformLocation(program, 'u_needsDst'),
			u_isAdjustment: gl.getUniformLocation(program, 'u_isAdjustment'),
			u_adjType: gl.getUniformLocation(program, 'u_adjType'),
			u_adjParams: gl.getUniformLocation(program, 'u_adjParams'),
			u_maskRect: gl.getUniformLocation(program, 'u_maskRect'),
			u_layerTopLeft: gl.getUniformLocation(program, 'u_layerTopLeft'),
			u_layerCenter: gl.getUniformLocation(program, 'u_layerCenter'),
			u_maskRotate: gl.getUniformLocation(program, 'u_maskRotate'),
		};

		// Cache attribute locations
		this.attribs = {
			a_position: gl.getAttribLocation(program, 'a_position'),
			a_texCoord: gl.getAttribLocation(program, 'a_texCoord'),
		};

		return true;
	}

	/**
	 * Compile a single shader.
	 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
	 * @param {string} source
	 * @returns {WebGLShader|null}
	 */
	_compile_shader(type, source) {
		var gl = this.gl;
		var shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error('WebGL renderer: shader compile error:',
				gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	/**
	 * Create the fullscreen quad vertex and texture coordinate buffers.
	 * The quad is defined as a triangle strip covering [0,0] to [1,1].
	 */
	_init_quad() {
		var gl = this.gl;

		// Position buffer: 4 corners of a quad (triangle strip order)
		var positions = new Float32Array([
			0.0, 0.0,   // top-left
			1.0, 0.0,   // top-right
			0.0, 1.0,   // bottom-left
			1.0, 1.0,   // bottom-right
		]);

		this.quadVBO = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

		// Texture coordinates: same as positions (0,0) to (1,1)
		var texCoords = new Float32Array([
			0.0, 0.0,
			1.0, 0.0,
			0.0, 1.0,
			1.0, 1.0,
		]);

		this.quadTCO = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTCO);
		gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
	}

	/**
	 * Set up WebGL context loss and restore event handlers.
	 */
	_setup_context_loss_handlers() {
		var _this = this;

		this.glCanvas.addEventListener('webglcontextlost', function(e) {
			e.preventDefault();
			_this.contextLost = true;
			_this._compositeValid = false;
			console.warn('WebGL renderer: context lost');
		}, false);

		this.glCanvas.addEventListener('webglcontextrestored', function() {
			_this.contextLost = false;
			console.log('WebGL renderer: context restored, rebuilding...');
			_this._rebuild_after_context_loss();
		}, false);
	}

	/**
	 * Rebuild GPU state after context loss.
	 * All cached textures are invalidated; they will be re-uploaded
	 * from the CPU document on next render.
	 */
	_rebuild_after_context_loss() {
		// Clear the texture cache (textures were destroyed with context)
		this.textureCache = {};
		this.maskTextureCache = {};
		this.dstTexture = null;
		this.dstTextureWidth = 0;
		this.dstTextureHeight = 0;

		// Re-initialize shader program and buffers
		if (!this._init_program()) {
			console.error('WebGL renderer: failed to rebuild after context loss');
			this.available = false;
			return;
		}
		this._init_quad();
	}

	// ---- Public API ----

	/**
	 * Get the offscreen WebGL canvas.
	 * @returns {HTMLCanvasElement}
	 */
	getCanvas() {
		return this.glCanvas;
	}

	/**
	 * Resize the WebGL offscreen canvas to the logical document size (full quality).
	 * @param {number} width
	 * @param {number} height
	 */
	resize(width, height) {
		this.logicalWidth = width;
		this.logicalHeight = height;
		this._apply_framebuffer_size();
	}

	/**
	 * Interactive quality tier: 1 = full document resolution, 0.5 = half-res.
	 * Layer textures stay full-res; only the composite FB is downscaled.
	 * @param {number} scale
	 */
	set_composite_scale(scale) {
		var s = Number(scale);
		if (!isFinite(s) || s <= 0) s = 1;
		if (s > 1) s = 1;
		if (s < 0.25) s = 0.25;
		if (Math.abs((this.compositeScale || 1) - s) < 0.001) {
			return;
		}
		this.compositeScale = s;
		this._apply_framebuffer_size();
	}

	/**
	 * @returns {number}
	 */
	get_composite_scale() {
		return this.compositeScale || 1;
	}

	/**
	 * True when glCanvas holds a full-scale composite suitable for viewport-only
	 * redraw (pan/zoom) without replaying the layer stack.
	 * @returns {boolean}
	 */
	has_cached_composite() {
		return !!(this.glCanvas && this._compositeValid && !this.contextLost
			&& (this.compositeScale || 1) === 1
			&& this.glCanvas.width > 0 && this.glCanvas.height > 0);
	}

	/**
	 * Mark the offscreen composite invalid (resize, context loss, destroy).
	 */
	invalidate_composite_cache() {
		this._compositeValid = false;
	}

	_apply_framebuffer_size() {
		var scale = this.compositeScale || 1;
		var lw = this.logicalWidth || this.docWidth || 1;
		var lh = this.logicalHeight || this.docHeight || 1;
		var rw = Math.max(1, Math.round(lw * scale));
		var rh = Math.max(1, Math.round(lh * scale));
		this.docWidth = rw;
		this.docHeight = rh;
		if (this.glCanvas) {
			if (this.glCanvas.width !== rw || this.glCanvas.height !== rh) {
				this.glCanvas.width = rw;
				this.glCanvas.height = rh;
				// Force dst snapshot realloc on next blend/adj pass
				this.dstTextureWidth = 0;
				this.dstTextureHeight = 0;
				this._compositeValid = false;
			}
		}
	}

	/**
	 * Clear the WebGL framebuffer.
	 */
	clear() {
		if (!this.gl || this.contextLost) return;
		var gl = this.gl;
		gl.viewport(0, 0, this.docWidth, this.docHeight);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	/**
	 * Begin frame: enable blending, use program.
	 */
	begin_frame() {
		if (!this.gl || this.contextLost) return;
		var gl = this.gl;
		gl.useProgram(this.program);
		gl.enable(gl.BLEND);
		gl.viewport(0, 0, this.docWidth, this.docHeight);

		// Set resolution uniform (document dimensions)
		gl.uniform2f(this.uniforms.u_resolution, this.docWidth, this.docHeight);
	}

	/**
	 * Render all visible layers as textured quads.
	 *
	 * For each layer:
	 *   1. Upload or reuse cached GPU texture
	 *   2. Set blend mode and opacity
	 *   3. Draw quad
	 *
	 * @param {Object[]} layers - sorted layers (bottom to top)
	 * @param {number} zoom - current zoom level (unused in this pass, applied externally)
	 * @param {Object} pan - {x, y} pan offset (unused in this pass)
	 * @param {number} docWidth
	 * @param {number} docHeight
	 */
	render_layers(layers, zoom, pan, docWidth, docHeight) {
		if (!this.gl || this.contextLost) return;

		var gl = this.gl;
		this.logicalWidth = docWidth;
		this.logicalHeight = docHeight;
		this._apply_framebuffer_size();

		var scale = this.compositeScale || 1;
		var rw = this.docWidth;
		var rh = this.docHeight;

		gl.viewport(0, 0, rw, rh);
		gl.uniform2f(this.uniforms.u_resolution, rw, rh);
		gl.uniform1f(this.uniforms.u_isAdjustment, 0.0);
		gl.uniform1f(this.uniforms.u_adjType, ADJ_NONE);
		gl.uniform4f(this.uniforms.u_adjParams, 0, 0, 0, 0);

		// Bind quad buffers
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
		gl.enableVertexAttribArray(this.attribs.a_position);
		gl.vertexAttribPointer(this.attribs.a_position, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTCO);
		gl.enableVertexAttribArray(this.attribs.a_texCoord);
		gl.vertexAttribPointer(this.attribs.a_texCoord, 2, gl.FLOAT, false, 0, 0);

		// Render layers bottom to top
		for (var i = layers.length - 1; i >= 0; i--) {
			try {
				var layer = layers[i];

				// Skip hidden or empty layers
				if (layer.type == null || is_group(layer) || !is_effectively_visible(layer)) continue;

				if (layer.type === 'adjustment') {
					this._render_adjustment_layer(layer, rw, rh, scale);
					continue;
				}

				// Get or create the layer texture
				var texInfo = this._get_or_create_texture(layer);
				if (!texInfo) continue;

				var composition = layer.composition == null ? 'source-over' : layer.composition;
				var blendId = this._blend_mode_id(composition);
				var needsDst = blendId !== BLEND_NORMAL;

				gl.uniform1f(this.uniforms.u_isAdjustment, 0.0);

				if (needsDst) {
					this._capture_dst_texture(rw, rh);
					gl.disable(gl.BLEND);
					gl.activeTexture(gl.TEXTURE1);
					gl.bindTexture(gl.TEXTURE_2D, this.dstTexture);
					gl.uniform1i(this.uniforms.u_dstTexture, 1);
					gl.uniform1f(this.uniforms.u_needsDst, 1.0);
				} else {
					gl.enable(gl.BLEND);
					this._set_blend_mode('source-over');
					gl.uniform1f(this.uniforms.u_needsDst, 0.0);
				}

				// Bind layer texture
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);
				gl.uniform1i(this.uniforms.u_layerTexture, 0);

				this._bind_mask_uniforms(layer, scale);

				// Set opacity
				gl.uniform1f(this.uniforms.u_opacity, (layer.opacity || 100) / 100);
				gl.uniform1f(this.uniforms.u_blendMode, blendId);

				// Destination rectangle in scaled framebuffer pixels.
				var pad = texInfo.pad || 0;
				var lx = (layer.x || 0);
				var ly = (layer.y || 0);
				var lw = (layer.width || 0);
				var lh = (layer.height || 0);
				gl.uniform4f(this.uniforms.u_dstRect,
					(lx - pad) * scale, (ly - pad) * scale,
					(lw + pad * 2) * scale, (lh + pad * 2) * scale
				);
				gl.uniform2f(this.uniforms.u_layerTopLeft, lx * scale, ly * scale);
				gl.uniform2f(this.uniforms.u_layerCenter, (lx + lw * 0.5) * scale, (ly + lh * 0.5) * scale);

				gl.uniform1f(this.uniforms.u_rotation,
					(layer.rotate || 0) * Math.PI / 180
				);

				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				if (needsDst) {
					gl.enable(gl.BLEND);
				}
			} catch (err) {
				console.warn('WebGL render error on layer', layers[i] ? layers[i].id : i, err);
			}
		}

		this._compositeValid = !this.contextLost && (this.compositeScale || 1) === 1;
	}

	/**
	 * Draw a fullscreen adjustment pass that samples the current framebuffer.
	 * @param {Object} layer
	 * @param {number} rw framebuffer width
	 * @param {number} rh framebuffer height
	 * @param {number} scale composite scale
	 */
	_render_adjustment_layer(layer, rw, rh, scale) {
		var gl = this.gl;
		var info = this._adjustment_shader_params(layer);
		if (!info) return;

		this._capture_dst_texture(rw, rh);
		gl.disable(gl.BLEND);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.dstTexture);
		gl.uniform1i(this.uniforms.u_dstTexture, 1);
		gl.uniform1f(this.uniforms.u_needsDst, 1.0);
		gl.uniform1f(this.uniforms.u_isAdjustment, 1.0);
		gl.uniform1f(this.uniforms.u_adjType, info.type);
		gl.uniform4f(this.uniforms.u_adjParams,
			info.params[0], info.params[1], info.params[2], info.params[3]
		);
		gl.uniform1f(this.uniforms.u_opacity, (layer.opacity == null ? 100 : layer.opacity) / 100);
		gl.uniform1f(this.uniforms.u_blendMode, BLEND_NORMAL);
		gl.uniform1f(this.uniforms.u_rotation, 0.0);

		// Adjustment covers the document; mask sampling still uses layer bounds.
		var lx = (layer.x || 0);
		var ly = (layer.y || 0);
		var lw = (layer.width != null && layer.width > 0) ? layer.width : (this.logicalWidth || rw);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (this.logicalHeight || rh);
		gl.uniform2f(this.uniforms.u_layerTopLeft, lx * scale, ly * scale);
		gl.uniform2f(this.uniforms.u_layerCenter, (lx + lw * 0.5) * scale, (ly + lh * 0.5) * scale);

		this._bind_mask_uniforms(layer, scale);

		// Full-document quad in scaled FB space
		gl.uniform4f(this.uniforms.u_dstRect, 0, 0, rw, rh);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		gl.uniform1f(this.uniforms.u_isAdjustment, 0.0);
		gl.enable(gl.BLEND);
	}

	/**
	 * End frame: disable blending.
	 */
	end_frame() {
		if (!this.gl || this.contextLost) return;
		var gl = this.gl;
		gl.disable(gl.BLEND);
	}

	/**
	 * Handle document resize.
	 */
	on_document_resize(width, height) {
		this.resize(width, height);
	}

	/**
	 * Invalidate cached texture for a layer whose pixel data changed.
	 * @param {number} layerId
	 */
	on_layer_data_changed(layerId) {
		if (this.textureCache[layerId]) {
			var gl = this.gl;
			if (gl) {
				gl.deleteTexture(this.textureCache[layerId].texture);
			}
			delete this.textureCache[layerId];
		}
	}

	on_mask_changed(layerId) {
		this.on_layer_data_changed(layerId);
		if (this.maskTextureCache[layerId]) {
			var gl = this.gl;
			if (gl && this.maskTextureCache[layerId].texture) {
				gl.deleteTexture(this.maskTextureCache[layerId].texture);
			}
			delete this.maskTextureCache[layerId];
		}
	}

	/**
	 * Invalidate all cached textures (e.g. when switching documents).
	 */
	clear_texture_cache() {
		if (this.gl) {
			var gl = this.gl;
			for (var id in this.textureCache) {
				var entry = this.textureCache[id];
				if (entry && entry.texture) {
					gl.deleteTexture(entry.texture);
				}
			}
			for (var mid in this.maskTextureCache) {
				var mentry = this.maskTextureCache[mid];
				if (mentry && mentry.texture) {
					gl.deleteTexture(mentry.texture);
				}
			}
			if (this.dstTexture) {
				gl.deleteTexture(this.dstTexture);
				this.dstTexture = null;
				this.dstTextureWidth = 0;
				this.dstTextureHeight = 0;
			}
		}
		this.textureCache = {};
		this.maskTextureCache = {};
	}

	/**
	 * Release all GPU resources.
	 */
	destroy() {
		if (this.gl) {
			var gl = this.gl;

			// Delete all cached textures
			for (var id in this.textureCache) {
				var entry = this.textureCache[id];
				if (entry.texture) gl.deleteTexture(entry.texture);
			}
			this.textureCache = {};
			for (var mid in this.maskTextureCache) {
				var mentry = this.maskTextureCache[mid];
				if (mentry && mentry.texture) gl.deleteTexture(mentry.texture);
			}
			this.maskTextureCache = {};
			if (this.dstTexture) {
				gl.deleteTexture(this.dstTexture);
				this.dstTexture = null;
			}

			// Delete buffers and program
			if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
			if (this.quadTCO) gl.deleteBuffer(this.quadTCO);
			if (this.program) gl.deleteProgram(this.program);

			this.gl = null;
		}
		this.glCanvas = null;
		this._compositeValid = false;
		this.available = false;
	}

	/**
	 * @returns {string}
	 */
	get_name() {
		return 'WebGL';
	}

	// ---- Texture Management ----

	/**
	 * Get or create a GPU texture for a layer.
	 * Reuses cached texture if the source hasn't changed.
	 *
	 * @param {Object} layer
	 * @returns {{texture: WebGLTexture, width: number, height: number}|null}
	 */
	_get_or_create_texture(layer) {
		var gl = this.gl;
		if (!gl) return null;

		var id = layer.id;
		var cached = this.textureCache[id];

		// Get the source canvas/image for this layer
		var source = this._get_layer_source(layer);
		if (!source) return null;

		var filterInfo = this._layer_filters_css(layer, null);
		var effectInfo = this._layer_effect_filters(layer, null);
		var filterSig = (filterInfo ? filterInfo.signature : '') +
			(effectInfo ? ('#' + effectInfo.signature) : '');
		var filterPad = filterInfo && filterInfo.pad ? filterInfo.pad : 0;
		var effectPad = effectInfo && effectInfo.pad ? effectInfo.pad : 0;
		if (filterInfo && filterInfo.css && filterInfo.css !== 'none') {
			source = this._bake_css_filter(source, filterInfo.css, layer, filterPad);
			if (!source) return null;
		}
		if (effectInfo && effectInfo.effects && effectInfo.effects.length) {
			source = this._bake_effect_filters(source, effectInfo.effects, layer, effectPad);
			if (!source) return null;
		}

		if (source instanceof HTMLImageElement) {
			if (!source.complete || source.naturalWidth <= 0 || source.naturalHeight <= 0) {
				return null;
			}
		} else if (source instanceof HTMLCanvasElement) {
			if (source.width <= 0 || source.height <= 0) {
				return null;
			}
		}

		var srcWidth = source.naturalWidth || source.width || layer.width;
		var srcHeight = source.naturalHeight || source.height || layer.height;

		if (!srcWidth || !srcHeight || srcWidth <= 0 || srcHeight <= 0 || isNaN(srcWidth) || isNaN(srcHeight)) return null;

		// Check if we need to re-upload
		// render_function layers (brush, text, etc.) change content every frame
		// without dimension changes, so never cache them.
		// Layers with active link_canvas (live raster brush/pencil strokes, erase, etc.)
		// change contents every frame during active editing, so upload dynamically.
		if (cached &&
			!layer.render_function &&
			!layer.link_canvas &&
			cached.width === srcWidth &&
			cached.height === srcHeight &&
			(cached.filterSig || '') === filterSig) {
			// Reuse existing texture
			return cached;
		}

		if (cached && layer.link_canvas && cached.width === srcWidth && cached.height === srcHeight
			&& (cached.filterSig || '') === filterSig) {
			try {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, cached.texture);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
				return cached;
			} catch (e) {
				return null;
			}
		}

		// Delete old texture if not reusing (dimensions changed or content changed)
		if (cached) {
			gl.deleteTexture(cached.texture);
		}

		// Create new texture
		var texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Upload pixel data from canvas or image
		try {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		} catch (e) {
			gl.deleteTexture(texture);
			return null;
		}

		// Set texture parameters
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		// Render-function layers are supersampled at 2x, so always use LINEAR
		// to get smooth anti-aliased downscaling. Image layers use NEAREST
		// at high zoom for pixel-perfect rendering.
		if (layer.render_function) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		} else if (config.ZOOM >= 1) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		} else {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		}

		var texInfo = {
			texture: texture,
			width: srcWidth,
			height: srcHeight,
			pad: source._pad || 0,
			filterSig: filterSig,
		};

		this.textureCache[id] = texInfo;
		return texInfo;
	}

	/**
	 * Apply a CSS filter string onto a copy of source for GPU upload.
	 * Spatial filters (blur/shadow) use pad so bleed is not clipped; texInfo.pad
	 * expands the destination quad when drawing.
	 * @param {HTMLCanvasElement|HTMLImageElement} source
	 * @param {string} cssFilter
	 * @param {Object} layer
	 * @param {number} [pad]
	 * @returns {HTMLCanvasElement|null}
	 */
	_bake_css_filter(source, cssFilter, layer, pad) {
		var w = source.naturalWidth || source.width || layer.width || 0;
		var h = source.naturalHeight || source.height || layer.height || 0;
		if (!w || !h) return null;
		var srcPad = source._pad || 0;
		var spatialPad = Math.max(0, pad || 0);
		var totalPad = srcPad + spatialPad;
		var outW = Math.max(1, Math.round(w + spatialPad * 2));
		var outH = Math.max(1, Math.round(h + spatialPad * 2));
		// When source already includes brush pad, its pixels are (w) including that pad;
		// spatial pad expands further around the full source bitmap.
		if (srcPad && !spatialPad) {
			outW = w;
			outH = h;
		} else if (srcPad && spatialPad) {
			outW = Math.max(1, Math.round(w + spatialPad * 2));
			outH = Math.max(1, Math.round(h + spatialPad * 2));
		}
		if (!this._filterBakeCanvas) {
			this._filterBakeCanvas = document.createElement('canvas');
		}
		var canvas = this._filterBakeCanvas;
		if (canvas.width !== outW || canvas.height !== outH) {
			canvas.width = outW;
			canvas.height = outH;
		}
		var ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, outW, outH);
		ctx.filter = cssFilter;
		try {
			ctx.drawImage(source, spatialPad, spatialPad);
		} catch (e) {
			ctx.filter = 'none';
			return null;
		}
		ctx.filter = 'none';
		canvas._pad = totalPad;
		return canvas;
	}

	/**
	 * Bake stroke / inner_glow / color_overlay onto a layer-local source so the WebGL stack
	 * can keep compositing. Algorithms mirror Effects_stroke / Effects_inner_glow
	 * but operate in texture space (no document x/y).
	 * @param {HTMLCanvasElement|HTMLImageElement} source
	 * @param {Object[]} effects
	 * @param {Object} layer
	 * @param {number} [pad]
	 * @returns {HTMLCanvasElement|null}
	 */
	_bake_effect_filters(source, effects, layer, pad) {
		var w = source.naturalWidth || source.width || layer.width || 0;
		var h = source.naturalHeight || source.height || layer.height || 0;
		if (!w || !h) return null;
		var srcPad = source._pad || 0;
		var spatialPad = Math.max(0, pad || 0);
		var totalPad = srcPad + spatialPad;
		var outW = Math.max(1, Math.round(w + spatialPad * 2));
		var outH = Math.max(1, Math.round(h + spatialPad * 2));

		if (!this._effectBakeCanvas) {
			this._effectBakeCanvas = document.createElement('canvas');
		}
		var canvas = this._effectBakeCanvas;
		if (canvas.width !== outW || canvas.height !== outH) {
			canvas.width = outW;
			canvas.height = outH;
		}
		var ctx = canvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, outW, outH);
		try {
			ctx.drawImage(source, spatialPad, spatialPad);
		} catch (e) {
			return null;
		}

		var sil = document.createElement('canvas');
		sil.width = outW;
		sil.height = outH;
		var sctx = sil.getContext('2d');
		sctx.drawImage(canvas, 0, 0);

		for (var i = 0; i < effects.length; i++) {
			var filter = effects[i];
			var name = filter.name;
			var params = filter.params || {};
			if (name === 'color_overlay') {
				this._bake_color_overlay_onto(ctx, sil, params, outW, outH);
			} else if (name === 'stroke') {
				this._bake_stroke_onto(ctx, sil, params, outW, outH);
			} else if (name === 'inner_glow') {
				this._bake_inner_glow_onto(ctx, sil, params, outW, outH);
			}
		}

		canvas._pad = totalPad;
		return canvas;
	}

	_effect_css_color(color, opacity, fallback) {
		var alpha = Math.max(0, Math.min(1, (opacity == null ? 100 : opacity) / 100));
		if (color && typeof color === 'string' && color.startsWith('#')) {
			var hex = color.replace('#', '');
			if (hex.length === 3) {
				hex = hex.split('').map(function (c) { return c + c; }).join('');
			}
			var r = parseInt(hex.substring(0, 2), 16) || 0;
			var g = parseInt(hex.substring(2, 4), 16) || 0;
			var b = parseInt(hex.substring(4, 6), 16) || 0;
			return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
		}
		return color || fallback || ('rgba(0,0,0,' + alpha + ')');
	}

	_bake_color_overlay_onto(ctx, sil, params, w, h) {
		var opacity = (params.opacity !== undefined) ? Number(params.opacity) : 100;
		if (!isFinite(opacity) || opacity <= 0) return;
		var color = this._effect_css_color(params.color || '#ff0000', opacity, 'rgba(255,0,0,1)');

		var overlayCanvas = document.createElement('canvas');
		overlayCanvas.width = w;
		overlayCanvas.height = h;
		var octx = overlayCanvas.getContext('2d');
		octx.drawImage(sil, 0, 0);
		octx.globalCompositeOperation = 'source-in';
		octx.fillStyle = color;
		octx.fillRect(0, 0, w, h);

		ctx.save();
		ctx.filter = 'none';
		ctx.drawImage(overlayCanvas, 0, 0);
		ctx.restore();
	}

	_bake_stroke_onto(ctx, sil, params, w, h) {
		var rawSize = (params.size !== undefined) ? Number(params.size) : 3;
		if (!isFinite(rawSize) || rawSize <= 0) return;
		var position = params.position || 'outside';
		var opacity = (params.opacity !== undefined) ? Number(params.opacity) : 100;
		if (!isFinite(opacity) || opacity <= 0) return;
		var color = this._effect_css_color(params.color || '#000000', opacity, 'rgba(0,0,0,1)');

		ctx.save();
		ctx.filter = 'none';

		if (position === 'outside' || position === 'center') {
			var outerSize = position === 'center' ? Math.max(1, Math.ceil(rawSize / 2)) : rawSize;
			var silCanvas = document.createElement('canvas');
			silCanvas.width = w;
			silCanvas.height = h;
			var silCtx = silCanvas.getContext('2d');
			silCtx.drawImage(sil, 0, 0);
			silCtx.globalCompositeOperation = 'source-in';
			silCtx.fillStyle = color;
			silCtx.fillRect(0, 0, w, h);

			var outerCanvas = document.createElement('canvas');
			outerCanvas.width = w;
			outerCanvas.height = h;
			var octx = outerCanvas.getContext('2d');
			for (var r = 1; r <= outerSize; r++) {
				var diag = Math.round(r * 0.7071);
				octx.drawImage(silCanvas, r, 0);
				octx.drawImage(silCanvas, -r, 0);
				octx.drawImage(silCanvas, 0, r);
				octx.drawImage(silCanvas, 0, -r);
				if (diag > 0) {
					octx.drawImage(silCanvas, diag, diag);
					octx.drawImage(silCanvas, -diag, diag);
					octx.drawImage(silCanvas, diag, -diag);
					octx.drawImage(silCanvas, -diag, -diag);
				}
			}
			octx.globalCompositeOperation = 'destination-out';
			octx.drawImage(sil, 0, 0);
			ctx.drawImage(outerCanvas, 0, 0);
		}

		if (position === 'inside' || position === 'center') {
			var innerSize = position === 'center' ? Math.max(1, Math.floor(rawSize / 2)) : rawSize;
			if (innerSize > 0) {
				var maskCanvas = document.createElement('canvas');
				maskCanvas.width = w;
				maskCanvas.height = h;
				var mctx = maskCanvas.getContext('2d');
				mctx.fillStyle = '#000000';
				mctx.fillRect(0, 0, w, h);
				mctx.globalCompositeOperation = 'destination-out';
				mctx.drawImage(sil, 0, 0);

				var innerCanvas = document.createElement('canvas');
				innerCanvas.width = w;
				innerCanvas.height = h;
				var ictx = innerCanvas.getContext('2d');
				for (var r2 = 1; r2 <= innerSize; r2++) {
					var diag2 = Math.round(r2 * 0.7071);
					ictx.drawImage(maskCanvas, r2, 0);
					ictx.drawImage(maskCanvas, -r2, 0);
					ictx.drawImage(maskCanvas, 0, r2);
					ictx.drawImage(maskCanvas, 0, -r2);
					if (diag2 > 0) {
						ictx.drawImage(maskCanvas, diag2, diag2);
						ictx.drawImage(maskCanvas, -diag2, diag2);
						ictx.drawImage(maskCanvas, diag2, -diag2);
						ictx.drawImage(maskCanvas, -diag2, -diag2);
					}
				}
				ictx.globalCompositeOperation = 'destination-in';
				ictx.drawImage(sil, 0, 0);
				ictx.globalCompositeOperation = 'source-in';
				ictx.fillStyle = color;
				ictx.fillRect(0, 0, w, h);
				ctx.drawImage(innerCanvas, 0, 0);
			}
		}
		ctx.restore();
	}

	_bake_inner_glow_onto(ctx, sil, params, w, h) {
		var radius = (params.value !== undefined) ? Number(params.value) : 10;
		var opacity = (params.opacity !== undefined) ? Number(params.opacity) : 75;
		if (!isFinite(radius) || radius <= 0 || !isFinite(opacity) || opacity <= 0) return;
		var color = this._effect_css_color(params.color || '#ffffff', opacity, 'rgba(255,255,255,1)');

		var maskCanvas = document.createElement('canvas');
		maskCanvas.width = w;
		maskCanvas.height = h;
		var mctx = maskCanvas.getContext('2d');
		mctx.fillStyle = '#000000';
		mctx.fillRect(0, 0, w, h);
		mctx.globalCompositeOperation = 'destination-out';
		mctx.drawImage(sil, 0, 0);

		var glowCanvas = document.createElement('canvas');
		glowCanvas.width = w;
		glowCanvas.height = h;
		var gctx = glowCanvas.getContext('2d');
		gctx.filter = 'blur(' + radius + 'px)';
		gctx.drawImage(maskCanvas, 0, 0);
		gctx.filter = 'none';
		gctx.globalCompositeOperation = 'destination-in';
		gctx.drawImage(sil, 0, 0);
		gctx.globalCompositeOperation = 'source-in';
		gctx.fillStyle = color;
		gctx.fillRect(0, 0, w, h);

		ctx.save();
		ctx.filter = 'none';
		ctx.drawImage(glowCanvas, 0, 0);
		ctx.restore();
	}


	/**
	 * Get the renderable source (canvas or Image) for a layer.
	 * For image layers, returns link_canvas or link.
	 * For non-image layers, renders to an offscreen canvas.
	 *
	 * @param {Object} layer
	 * @returns {HTMLCanvasElement|HTMLImageElement|null}
	 */
	_get_layer_source(layer) {
		// Image layers: use the stored canvas or image
		if (layer.type === 'image') {
			return layer.link_canvas || layer.link || null;
		}

		// Non-image layers: render to offscreen canvas using the tool's render function
		// This falls back to Canvas 2D for now
		if (layer.render_function) {
			// Supersample at 2x for anti-aliased edges on brush/text/shape layers.
			// The texture is uploaded at 2x but drawn at 1x via the destination rect,
			// so LINEAR filtering produces smooth anti-aliased output.
			var SUPER = 2;

			// Pad the canvas to prevent clipping from line caps, joins, and
			// anti-aliasing halos at the edges of the stroke bounding box.
			var rawBrushSize = (layer.params && layer.params.size != null) ? parseFloat(layer.params.size) : 0;
			var brushSize = (!isNaN(rawBrushSize) && rawBrushSize > 0) ? rawBrushSize : 0;
			var pad = Math.max(1, Math.ceil(brushSize / 2) + 1);

			var w = Math.max(1, Math.round(layer.width || 1));
			var h = Math.max(1, Math.round(layer.height || 1));
			if (isNaN(w) || w <= 0) w = 1;
			if (isNaN(h) || h <= 0) h = 1;
			var canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.round((w + pad * 2) * SUPER));
			canvas.height = Math.max(1, Math.round((h + pad * 2) * SUPER));
			var ctx = canvas.getContext('2d');

			try {
				// Lazily acquire reference to GUI_tools
				if (!this._gui_tools_ref) {
					var appModule = require('./../../app.js');
					var appDefault = appModule.default || appModule;
					if (appDefault && appDefault.GUI && appDefault.GUI.GUI_tools) {
						this._gui_tools_ref = appDefault.GUI.GUI_tools;
					}
				}

				if (this._gui_tools_ref && this._gui_tools_ref.tools_modules) {
					var render_class = layer.render_function[0];
					var render_function = layer.render_function[1];

					if (this._gui_tools_ref.tools_modules[render_class] &&
						typeof this._gui_tools_ref.tools_modules[render_class].object[render_function] === 'function') {

						var _this = this;
						var paint = function(targetCtx) {
							targetCtx.save();
							targetCtx.scale(SUPER, SUPER);
							// Shift by pad so strokes at the bounding-box edge have room
							targetCtx.translate(pad - (layer.x || 0), pad - (layer.y || 0));
							_this._gui_tools_ref.tools_modules[render_class].object[render_function](targetCtx, layer, false);
							targetCtx.restore();
						};

						paint(ctx);

						// Text (and similar) may grow layer.width/height during render.
						// If we keep the old canvas size, the GPU stretches the texture → weird point-text scaling while typing.
						var w2 = Math.max(1, Math.round(layer.width || 1));
						var h2 = Math.max(1, Math.round(layer.height || 1));
						if (w2 !== w || h2 !== h) {
							w = w2; h = h2;
							canvas.width = Math.max(1, Math.round((w + pad * 2) * SUPER));
							canvas.height = Math.max(1, Math.round((h + pad * 2) * SUPER));
							ctx = canvas.getContext('2d');
							paint(ctx);
						}

						canvas._pad = pad;
						return canvas;
					}
				}
			} catch (e) {
				console.warn('WebGL renderer: could not render layer', layer.id, e);
			}
			return canvas;
		}

		return null;
	}

	// ---- Mask / destination helpers ----

	/**
	 * Snapshot the current default framebuffer into dstTexture for shader blends.
	 * WebGL FB origin is bottom-left; the fragment shader flips Y when sampling
	 * so document (0,0)=top-left maps correctly.
	 */
	_capture_dst_texture(width, height) {
		var gl = this.gl;
		if (!gl) return;

		if (!this.dstTexture || this.dstTextureWidth !== width || this.dstTextureHeight !== height) {
			if (this.dstTexture) {
				gl.deleteTexture(this.dstTexture);
			}
			this.dstTexture = gl.createTexture();
			this.dstTextureWidth = width;
			this.dstTextureHeight = height;
			gl.bindTexture(gl.TEXTURE_2D, this.dstTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}

		gl.bindTexture(gl.TEXTURE_2D, this.dstTexture);
		gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, width, height, 0);
	}

	/**
	 * Bind mask texture + uniforms for the current layer, or disable mask sampling.
	 * @param {Object} layer
	 */
	_bind_mask_uniforms(layer, scale) {
		var gl = this.gl;
		var mask = layer.mask;
		var hasMask = mask && mask.enabled !== false && (mask.link_canvas || mask.link);
		var s = (scale == null || !isFinite(scale) || scale <= 0) ? 1 : scale;

		if (!hasMask) {
			gl.uniform1f(this.uniforms.u_hasMask, 0.0);
			gl.uniform1f(this.uniforms.u_maskRotate, 0.0);
			gl.uniform4f(this.uniforms.u_maskRect, 0, 0, 1, 1);
			return;
		}

		var maskInfo = this._get_or_create_mask_texture(layer);
		if (!maskInfo) {
			gl.uniform1f(this.uniforms.u_hasMask, 0.0);
			gl.uniform1f(this.uniforms.u_maskRotate, 0.0);
			return;
		}

		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, maskInfo.texture);
		gl.uniform1i(this.uniforms.u_maskTexture, 2);
		gl.uniform1f(this.uniforms.u_hasMask, 1.0);

		var source = mask.link_canvas || mask.link;
		var sw = source.naturalWidth || source.width || 1;
		var sh = source.naturalHeight || source.height || 1;
		var mx = (mask.x != null) ? mask.x : 0;
		var my = (mask.y != null) ? mask.y : 0;
		var logicalW = this.logicalWidth || this.docWidth || sw;
		var logicalH = this.logicalHeight || this.docHeight || sh;
		var mw = (mask.width != null && mask.width > 0) ? mask.width : logicalW;
		var mh = (mask.height != null && mask.height > 0) ? mask.height : logicalH;
		gl.uniform4f(this.uniforms.u_maskRect, mx * s, my * s, mw * s, mh * s);

		var rotate = (layer.rotate || 0) * Math.PI / 180;
		var linkedRotate = (mask.linked !== false && rotate != 0) ? rotate : 0;
		gl.uniform1f(this.uniforms.u_maskRotate, linkedRotate);
	}

	/**
	 * Upload / cache the layer mask bitmap as a GPU texture.
	 * @param {Object} layer
	 * @returns {{texture: WebGLTexture, width: number, height: number}|null}
	 */
	_get_or_create_mask_texture(layer) {
		var gl = this.gl;
		if (!gl || !layer.mask) return null;

		var source = layer.mask.link_canvas || layer.mask.link;
		if (!source) return null;

		if (source instanceof HTMLImageElement) {
			if (!source.complete || source.naturalWidth <= 0 || source.naturalHeight <= 0) {
				return null;
			}
		} else if (source instanceof HTMLCanvasElement) {
			if (source.width <= 0 || source.height <= 0) {
				return null;
			}
		}

		var srcWidth = source.naturalWidth || source.width;
		var srcHeight = source.naturalHeight || source.height;
		var id = layer.id;
		var cached = this.maskTextureCache[id];
		var live = !!layer.mask.link_canvas;

		if (cached && !live && cached.source === source
			&& cached.width === srcWidth && cached.height === srcHeight) {
			return cached;
		}

		if (cached && live && cached.width === srcWidth && cached.height === srcHeight) {
			try {
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, cached.texture);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
				cached.source = source;
				return cached;
			} catch (e) {
				return null;
			}
		}

		if (cached && cached.texture) {
			gl.deleteTexture(cached.texture);
		}

		var texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		try {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		} catch (e) {
			gl.deleteTexture(texture);
			return null;
		}
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

		var info = {
			texture: texture,
			width: srcWidth,
			height: srcHeight,
			source: source,
		};
		this.maskTextureCache[id] = info;
		return info;
	}

	// ---- Blend Modes ----

	/**
	 * Set the WebGL blend equation for the hardware source-over path.
	 * Non-normal GPU blends are handled in the fragment shader (see
	 * render_layers) and do not use this helper.
	 *
	 * @param {string} composition - Canvas 2D globalCompositeOperation value
	 */
	_set_blend_mode(composition) {
		var gl = this.gl;
		// Normal blending: src * srcAlpha + dst * (1 - srcAlpha)
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}
}

export default WebGL_renderer_class;
