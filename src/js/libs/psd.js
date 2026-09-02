/**
 * Vantage Point - Bidirectional Photoshop Document (.PSD) Module
 * 
 * Provides high-fidelity import and export of Photoshop documents,
 * including layers, coordinates, blending modes, opacities, layer masks,
 * and conversion of PSD text layers to editable Vantage Point text layers.
 */

import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import filesaver from './../../../node_modules/file-saver/dist/FileSaver.min.js';
import { readPsd, writePsd, initializeCanvas } from 'ag-psd';

// Ensure ag-psd can instantiate canvases in any environment
try {
	initializeCanvas((width, height) => {
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, width || 1);
		canvas.height = Math.max(1, height || 1);
		return canvas;
	});
} catch (e) {
	console.warn('[PSD] initializeCanvas warning:', e);
}

const PSD_TO_COMPOSITION = {
	'pass through': 'source-over',
	'normal': 'source-over',
	'darken': 'darken',
	'multiply': 'multiply',
	'color burn': 'color-burn',
	'linear burn': 'multiply',
	'darker color': 'darken',
	'lighten': 'lighten',
	'screen': 'screen',
	'color dodge': 'color-dodge',
	'linear dodge': 'lighter',
	'lighter color': 'lighten',
	'overlay': 'overlay',
	'soft light': 'soft-light',
	'hard light': 'hard-light',
	'vivid light': 'hard-light',
	'linear light': 'hard-light',
	'pin light': 'overlay',
	'hard mix': 'hard-light',
	'difference': 'difference',
	'exclusion': 'exclusion',
	'subtract': 'difference',
	'divide': 'difference',
	'hue': 'hue',
	'saturation': 'saturation',
	'color': 'color',
	'luminosity': 'luminosity',
};

const COMPOSITION_TO_PSD = {
	'source-over': 'normal',
	'darken': 'darken',
	'multiply': 'multiply',
	'color-burn': 'color burn',
	'lighten': 'lighten',
	'screen': 'screen',
	'color-dodge': 'color dodge',
	'lighter': 'linear dodge',
	'overlay': 'overlay',
	'soft-light': 'soft light',
	'hard-light': 'hard light',
	'difference': 'difference',
	'exclusion': 'exclusion',
	'hue': 'hue',
	'saturation': 'saturation',
	'color': 'color',
	'luminosity': 'luminosity',
	'source-atop': 'normal', // Handled via clipping: true
};

function safeToDataURL(canvas) {
	if (!canvas) return null;
	try {
		return canvas.toDataURL();
	} catch (e) {
		console.warn('[PSD] toDataURL failed on canvas:', e);
		return null;
	}
}

/**
 * Parses and loads a PSD file into Vantage Point.
 * 
 * @param {ArrayBuffer|Uint8Array} buffer - The raw binary PSD file data
 * @param {string} filename - The original file name
 * @param {object} [options] - Options: { asLayers: boolean }
 */
export async function load_psd(buffer, filename, options = {}) {
	console.log('[PSD] Loading PSD file:', filename);

	let arrayBuffer = buffer;
	if (buffer && buffer.buffer instanceof ArrayBuffer) {
		arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
	}

	let psd;
	try {
		psd = readPsd(arrayBuffer, { useImageData: false, skipThumbnail: true });
		console.log('[PSD] Parse successful:', {
			width: psd.width,
			height: psd.height,
			childrenCount: psd.children ? psd.children.length : 0,
			hasCompositeCanvas: Boolean(psd.canvas)
		});
	} catch (err) {
		console.error('[PSD] Failed to read PSD:', err);
		alertify.error('Failed to parse PSD file: ' + (err.message || 'Unknown error'));
		return;
	}

	if (!psd) {
		alertify.error('Invalid PSD file: could not parse file data.');
		return;
	}

	const docWidth = parseInt(psd.width) || 800;
	const docHeight = parseInt(psd.height) || 600;
	const title = filename ? filename.replace(/\.psd$/i, '') : 'Untitled PSD';

	// Collect and unroll all layers from the PSD hierarchy
	const rawLayers = [];
	function collectLayers(nodes) {
		if (!nodes || !Array.isArray(nodes)) return;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.children && node.children.length > 0) {
				collectLayers(node.children);
			} else {
				rawLayers.push(node);
			}
		}
	}
	collectLayers(psd.children);

	// ag-psd children are ordered bottom-to-top, matching Vantage Point layer order
	const orderedPsdLayers = rawLayers;
	const layers = [];
	let idCounter = 1;

	for (let i = 0; i < orderedPsdLayers.length; i++) {
		const psdLayer = orderedPsdLayers[i];
		try {
			const convertedLayer = convert_psd_layer(psdLayer, idCounter, docWidth, docHeight);
			if (convertedLayer) {
				convertedLayer.order = idCounter;
				layers.push(convertedLayer);
				idCounter++;
			}
		} catch (layerErr) {
			console.warn('[PSD] Failed to convert layer:', psdLayer.name, layerErr);
		}
	}

	// Graceful Fallback: If no individual layers could be decoded but the composite is available
	if (layers.length === 0) {
		if (psd.canvas) {
			layers.push({
				id: 1,
				name: 'Background (Composite)',
				type: 'image',
				x: 0,
				y: 0,
				width: docWidth,
				height: docHeight,
				width_original: docWidth,
				height_original: docHeight,
				link: psd.canvas,
				data: safeToDataURL(psd.canvas),
				opacity: 100,
				visible: true,
				order: 1,
				composition: 'source-over',
				filters: [],
			});
			alertify.warning('Loaded flattened composite from PSD (layered data could not be parsed).');
		} else {
			alertify.error('PSD contains no usable layer or composite image data.');
			return;
		}
	}

	// If imported via "Open as Layer" (into current document)
	if (options.asLayers) {
		for (let l of layers) {
			app.State.do_action(
				new app.Actions.Insert_layer_action(l, false)
			);
		}
		alertify.success(`Added ${layers.length} layers from "${title}.psd".`);
		return;
	}

	// Standard document opening (creates new tab / document)
	const docData = {
		title: title,
		width: docWidth,
		height: docHeight,
		layers: layers,
	};

	if (app.Documents && typeof app.Documents.create_document_from_psd_data === 'function') {
		await app.Documents.create_document_from_psd_data(docData);
	} else if (app.Documents && typeof app.Documents.create_document_from_json === 'function') {
		await app.Documents.create_document_from_json({
			info: {
				width: docWidth,
				height: docHeight,
				name: title,
				transparency: true,
			},
			layers: layers,
		}, filename);
	} else {
		config.WIDTH = docWidth;
		config.HEIGHT = docHeight;
		config.layers = layers;
		config.layer = layers[layers.length - 1];
		app.Layers.render();
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
	}

	alertify.success(`Opened "${title}.psd" (${layers.length} layers).`);
}

/**
 * Converts an ag-psd layer record to a Vantage Point layer model.
 */
function convert_psd_layer(psdLayer, id, docWidth, docHeight) {
	const name = psdLayer.name || ('Layer ' + id);
	const opacity = Math.round(((psdLayer.opacity != null) ? psdLayer.opacity : 1) * 100);
	const visible = psdLayer.hidden !== true;
	const isClipping = Boolean(psdLayer.clipping);
	const blendMode = psdLayer.blendMode ? (PSD_TO_COMPOSITION[psdLayer.blendMode] || 'source-over') : 'source-over';
	const composition = isClipping ? 'source-atop' : blendMode;

	const left = Math.round(psdLayer.left || 0);
	const top = Math.round(psdLayer.top || 0);

	// Handle Layer Mask if present
	let mask = null;
	if (psdLayer.mask && psdLayer.mask.canvas) {
		const maskCanvas = psdLayer.mask.canvas;
		const maskX = Math.round(psdLayer.mask.left != null ? psdLayer.mask.left : left);
		const maskY = Math.round(psdLayer.mask.top != null ? psdLayer.mask.top : top);

		mask = {
			link: maskCanvas,
			x: maskX,
			y: maskY,
			width: maskCanvas.width,
			height: maskCanvas.height,
			enabled: !psdLayer.mask.disabled,
			linked: psdLayer.mask.positionRelativeToLayer !== false,
		};
	}

	// 1. Effects conversion (Drop Shadow, Glow, Stroke)
	const filters = convert_psd_effects_to_filters(psdLayer);

	// 2. Adjustment Layer conversion
	if (psdLayer.adjustment) {
		const adjModel = convert_psd_adjustment(psdLayer, id, name, opacity, visible, composition, mask, docWidth, docHeight);
		if (adjModel) {
			return adjModel;
		}
	}

	// 3. Text Layer conversion
	if (psdLayer.text && psdLayer.text.text) {
		const textModel = convert_psd_text(psdLayer, id, name, opacity, visible, composition, mask, filters);
		if (textModel) {
			return textModel;
		}
	}

	// 4. Raster/Image Layer
	let canvas = psdLayer.canvas;
	if (!canvas) {
		if (psdLayer.right != null && psdLayer.bottom != null && psdLayer.right > psdLayer.left && psdLayer.bottom > psdLayer.top) {
			canvas = document.createElement('canvas');
			canvas.width = Math.max(1, psdLayer.right - psdLayer.left);
			canvas.height = Math.max(1, psdLayer.bottom - psdLayer.top);
		} else {
			return null;
		}
	}

	const width = canvas.width;
	const height = canvas.height;

	return {
		id: id,
		name: name,
		type: 'image',
		x: left,
		y: top,
		width: width,
		height: height,
		width_original: width,
		height_original: height,
		link: canvas,
		data: safeToDataURL(canvas),
		opacity: opacity,
		visible: visible,
		composition: composition,
		rotate: 0,
		filters: filters,
		mask: mask,
	};
}

/**
 * Converts PSD layer effects (Drop Shadow, Outer Glow, Inner Glow, Stroke) into Vantage Point filters.
 */
function convert_psd_effects_to_filters(psdLayer) {
	const filters = [];
	if (!psdLayer.effects || psdLayer.effects.disabled) {
		return filters;
	}

	// 1. Drop Shadow
	if (psdLayer.effects.dropShadow && Array.isArray(psdLayer.effects.dropShadow)) {
		for (const shadow of psdLayer.effects.dropShadow) {
			if (shadow.enabled === false) continue;

			const angle = shadow.angle != null ? shadow.angle : 120;
			const angleRad = (angle * Math.PI) / 180;
			const distance = typeof shadow.distance === 'number' ? shadow.distance : (shadow.distance?.value ?? 5);
			const offsetX = Math.round(-Math.cos(angleRad) * distance);
			const offsetY = Math.round(Math.sin(angleRad) * distance);

			const blur = typeof shadow.size === 'number' ? shadow.size : (shadow.size?.value ?? 5);

			let opacity = shadow.opacity != null ? shadow.opacity : 0.75;
			if (opacity <= 1) opacity = Math.round(opacity * 100);

			const color = parse_psd_color(shadow.color) || '#000000';

			filters.push({
				id: 'filter_' + Math.random().toString(36).substr(2, 9),
				name: 'shadow',
				params: {
					x: offsetX,
					y: offsetY,
					value: blur,
					opacity: opacity,
					color: color,
				}
			});
		}
	}

	// 2. Outer Glow
	if (psdLayer.effects.outerGlow && psdLayer.effects.outerGlow.enabled !== false) {
		const glow = psdLayer.effects.outerGlow;
		const blur = typeof glow.size === 'number' ? glow.size : (glow.size?.value ?? 10);
		let opacity = glow.opacity != null ? glow.opacity : 0.75;
		if (opacity <= 1) opacity = Math.round(opacity * 100);
		const color = parse_psd_color(glow.color) || '#ffff00';

		filters.push({
			id: 'filter_' + Math.random().toString(36).substr(2, 9),
			name: 'outer_glow',
			params: {
				value: blur,
				opacity: opacity,
				color: color,
			}
		});
	}

	// 3. Inner Glow
	if (psdLayer.effects.innerGlow && psdLayer.effects.innerGlow.enabled !== false) {
		const glow = psdLayer.effects.innerGlow;
		const blur = typeof glow.size === 'number' ? glow.size : (glow.size?.value ?? 10);
		let opacity = glow.opacity != null ? glow.opacity : 0.75;
		if (opacity <= 1) opacity = Math.round(opacity * 100);
		const color = parse_psd_color(glow.color) || '#ffffff';

		filters.push({
			id: 'filter_' + Math.random().toString(36).substr(2, 9),
			name: 'inner_glow',
			params: {
				value: blur,
				opacity: opacity,
				color: color,
			}
		});
	}

	// 4. Stroke
	if (psdLayer.effects.stroke && Array.isArray(psdLayer.effects.stroke)) {
		for (const stroke of psdLayer.effects.stroke) {
			if (stroke.enabled === false) continue;
			const size = typeof stroke.size === 'number' ? stroke.size : (stroke.size?.value ?? 3);
			let opacity = stroke.opacity != null ? stroke.opacity : 1;
			if (opacity <= 1) opacity = Math.round(opacity * 100);
			const color = parse_psd_color(stroke.color) || '#000000';

			filters.push({
				id: 'filter_' + Math.random().toString(36).substr(2, 9),
				name: 'stroke',
				params: {
					size: size,
					opacity: opacity,
					color: color,
				}
			});
		}
	}

	return filters;
}

/**
 * Converts a PSD adjustment layer record into a Vantage Point adjustment layer.
 */
function convert_psd_adjustment(psdLayer, id, name, opacity, visible, composition, mask, docWidth, docHeight) {
	const adj = psdLayer.adjustment;
	if (!adj) return null;

	let adjustment_type = 'brightness';
	let params = { value: 0 };

	switch (adj.type) {
		case 'brightness/contrast': {
			adjustment_type = 'brightness';
			const b = adj.brightness != null ? adj.brightness : 0;
			const c = adj.contrast != null ? adj.contrast : 0;
			params = {
				value: Math.max(-100, Math.min(100, Math.round(b))),
				brightness: Math.max(-100, Math.min(100, Math.round(b))),
				contrast: Math.max(-100, Math.min(100, Math.round(c))),
			};
			break;
		}
		case 'hue/saturation': {
			if (adj.hue != null && adj.hue !== 0) {
				adjustment_type = 'hue-rotate';
				params = { value: Math.round((adj.hue + 360) % 360) };
			} else {
				adjustment_type = 'saturate';
				params = { value: Math.max(-100, Math.min(100, Math.round(adj.saturation || 0))) };
			}
			break;
		}
		case 'invert': {
			adjustment_type = 'invert';
			params = { value: 100 };
			break;
		}
		case 'threshold': {
			adjustment_type = 'threshold';
			params = { value: adj.level != null ? adj.level : 128 };
			break;
		}
		case 'black & white': {
			adjustment_type = 'grayscale';
			params = { value: 100 };
			break;
		}
		default: {
			adjustment_type = 'brightness';
			params = { value: 0 };
			break;
		}
	}

	return {
		id: id,
		name: name || (adjustment_type.charAt(0).toUpperCase() + adjustment_type.slice(1)),
		type: 'adjustment',
		adjustment_type: adjustment_type,
		params: params,
		x: 0,
		y: 0,
		width: docWidth,
		height: docHeight,
		width_original: docWidth,
		height_original: docHeight,
		opacity: opacity,
		visible: visible,
		composition: composition,
		rotate: 0,
		filters: [],
		mask: mask,
	};
}

/**
 * Converts a Photoshop color object (RGB, RGBA, Grayscale, CMYK) to a CSS hex string.
 */
function parse_psd_color(color) {
	if (!color) return null;
	if (typeof color.r === 'number' && typeof color.g === 'number' && typeof color.b === 'number') {
		const r = Math.min(255, Math.max(0, Math.round(color.r)));
		const g = Math.min(255, Math.max(0, Math.round(color.g)));
		const b = Math.min(255, Math.max(0, Math.round(color.b)));
		return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	}
	if (typeof color.k === 'number' && color.c == null) {
		const v = Math.min(255, Math.max(0, Math.round(color.k)));
		return '#' + ((1 << 24) + (v << 16) + (v << 8) + v).toString(16).slice(1);
	}
	if (typeof color.c === 'number' && typeof color.m === 'number' && typeof color.y === 'number' && typeof color.k === 'number') {
		const c = color.c / 255;
		const m = color.m / 255;
		const y = color.y / 255;
		const k = color.k / 255;
		const r = Math.round(255 * (1 - c) * (1 - k));
		const g = Math.round(255 * (1 - m) * (1 - k));
		const b = Math.round(255 * (1 - y) * (1 - k));
		return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	}
	return null;
}

/**
 * Samples the dominant text color directly from a rasterized text canvas.
 * Acts as an infallible ground truth when engine metadata lacks color.
 */
function sample_canvas_color(canvas) {
	if (!canvas || !canvas.getContext) return null;
	try {
		const ctx = canvas.getContext('2d');
		const w = Math.min(canvas.width, 300);
		const h = Math.min(canvas.height, 300);
		if (w <= 0 || h <= 0) return null;
		const imgData = ctx.getImageData(0, 0, w, h);
		const data = imgData.data;
		let rSum = 0, gSum = 0, bSum = 0, count = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] > 180) { // Solid pixels to avoid edge antialiasing artifacts
				rSum += data[i];
				gSum += data[i + 1];
				bSum += data[i + 2];
				count++;
			}
		}
		if (count === 0) return null;
		const r = Math.round(rSum / count);
		const g = Math.round(gSum / count);
		const b = Math.round(bSum / count);
		return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
	} catch (e) {
		return null;
	}
}

/**
 * Cleans PostScript font name suffixes for browser web font compatibility.
 */
function clean_psd_font_family(name) {
	if (!name) return 'Arial';
	let clean = name.replace(/-?(Bold|Italic|Regular|MT|PS|Medium|Light|Black|Oblique|Condensed|Semibold|Heavy)+/gi, ' ').trim();
	if (!clean) clean = name.replace(/-.*/, '').trim();
	return clean || 'Arial';
}

/**
 * Converts a PSD text layer to an editable Vantage Point text layer.
 */
function convert_psd_text(psdLayer, id, name, opacity, visible, composition, mask, filters) {
	const textData = psdLayer.text;
	const rawText = textData.text || '';
	if (!rawText.trim() && !psdLayer.canvas) {
		return null;
	}

	// 1. Calculate Transform Scale & Rotation
	let scale = 1;
	let rotate = 0;
	if (textData.transform && Array.isArray(textData.transform) && textData.transform.length >= 4) {
		const xx = textData.transform[0];
		const xy = textData.transform[1];
		const yx = textData.transform[2];
		const yy = textData.transform[3];
		const sx = Math.hypot(xx, xy);
		const sy = Math.hypot(yx, yy);
		if (sy > 0.001) scale = sy;
		else if (sx > 0.001) scale = sx;

		const angleRad = Math.atan2(xy, xx);
		rotate = Math.round((angleRad * 180) / Math.PI);
	}

	// 2. Resolve Global / Base Style from textData.style or styleRuns
	const globalStyle = textData.style || {};
	let firstRunStyle = {};
	if (textData.styleRuns && Array.isArray(textData.styleRuns) && textData.styleRuns.length > 0) {
		firstRunStyle = textData.styleRuns[0].style || {};
	}

	// Find the best available font
	let fontObj = globalStyle.font || firstRunStyle.font;
	if (!fontObj && textData.styleRuns) {
		for (const r of textData.styleRuns) {
			if (r.style && r.style.font) {
				fontObj = r.style.font;
				break;
			}
		}
	}
	let primaryFamily = (fontObj && fontObj.name) ? fontObj.name : 'Arial';
	primaryFamily = clean_psd_font_family(primaryFamily);

	// Find the best available font size
	let rawFontSize = globalStyle.fontSize || firstRunStyle.fontSize;
	if (rawFontSize == null && textData.styleRuns) {
		for (const r of textData.styleRuns) {
			if (r.style && r.style.fontSize) {
				rawFontSize = r.style.fontSize;
				break;
			}
		}
	}

	let primaryFontSize = rawFontSize ? Math.round(rawFontSize * scale) : null;

	// Cross-check font size with rendered canvas height
	const lines = rawText.split(/\r\n|\r|\n/);
	const lineCount = Math.max(1, lines.filter(l => l.trim().length > 0).length);
	if (psdLayer.canvas && psdLayer.canvas.height > 0) {
		const renderedLineHeight = psdLayer.canvas.height / lineCount;
		if (primaryFontSize == null || primaryFontSize <= 0) {
			primaryFontSize = Math.max(10, Math.round(renderedLineHeight * 0.85));
		} else if (primaryFontSize < renderedLineHeight * 0.35 || primaryFontSize > renderedLineHeight * 2.8) {
			// Discrepancy between point size and canvas pixel size (e.g. high DPI or untracked transform)
			primaryFontSize = Math.max(10, Math.round(renderedLineHeight * 0.85));
		}
	} else if (primaryFontSize == null || primaryFontSize <= 0) {
		primaryFontSize = 32;
	}

	// 3. Resolve Text Color
	let rawColorObj = globalStyle.fillColor || firstRunStyle.fillColor;
	if (!rawColorObj && textData.styleRuns) {
		for (const r of textData.styleRuns) {
			if (r.style && r.style.fillColor) {
				rawColorObj = r.style.fillColor;
				break;
			}
		}
	}

	let primaryFillColor = parse_psd_color(rawColorObj);

	// Ground Truth Fallback: Sample from psdLayer.canvas if color is missing or black
	if (psdLayer.canvas) {
		const sampled = sample_canvas_color(psdLayer.canvas);
		if (sampled) {
			if (!primaryFillColor || (primaryFillColor === '#000000' && sampled !== '#000000')) {
				primaryFillColor = sampled;
			}
		}
	}
	if (!primaryFillColor) {
		primaryFillColor = '#000000';
	}

	const bold = Boolean(globalStyle.fauxBold || firstRunStyle.fauxBold || (fontObj && fontObj.name && /bold/i.test(fontObj.name)));
	const italic = Boolean(globalStyle.fauxItalic || firstRunStyle.fauxItalic || (fontObj && fontObj.name && /(italic|oblique)/i.test(fontObj.name)));
	const underline = Boolean(globalStyle.underline || firstRunStyle.underline);
	const strikethrough = Boolean(globalStyle.strikethrough || firstRunStyle.strikethrough);

	// 4. Alignment
	let halign = 'left';
	const paraStyle = textData.paragraphStyle || (textData.paragraphStyleRuns && textData.paragraphStyleRuns[0] && textData.paragraphStyleRuns[0].style) || {};
	if (paraStyle.justification) {
		if (paraStyle.justification.includes('center')) halign = 'center';
		else if (paraStyle.justification.includes('right')) halign = 'right';
	}

	// 5. Build Spans Across Lines
	const defaultMeta = {
		family: primaryFamily,
		size: primaryFontSize,
		bold: bold,
		italic: italic,
		underline: underline,
		strikethrough: strikethrough,
		fill_color: primaryFillColor,
	};

	const data = build_text_spans(rawText, textData.styleRuns, globalStyle, defaultMeta, scale);

	const left = Math.round(psdLayer.left || 0);
	const top = Math.round(psdLayer.top || 0);
	let width = psdLayer.canvas ? psdLayer.canvas.width : Math.max(20, (psdLayer.right - psdLayer.left) || 200);
	let height = psdLayer.canvas ? psdLayer.canvas.height : Math.max(20, (psdLayer.bottom - psdLayer.top) || 60);

	const isBox = textData.shapeType === 'box';
	// Prefer explicit boxBounds from ag-psd when available (text-local [top,left,bottom,right]).
	if (isBox && Array.isArray(textData.boxBounds) && textData.boxBounds.length >= 4) {
		const bbTop = textData.boxBounds[0];
		const bbLeft = textData.boxBounds[1];
		const bbBottom = textData.boxBounds[2];
		const bbRight = textData.boxBounds[3];
		const bbW = Math.round(Math.abs(bbRight - bbLeft));
		const bbH = Math.round(Math.abs(bbBottom - bbTop));
		if (bbW > 1) width = bbW;
		if (bbH > 1) height = bbH;
	}

	return {
		id: id,
		name: name,
		type: 'text',
		x: left,
		y: top,
		width: width,
		height: height,
		width_original: width,
		height_original: height,
		rotate: rotate,
		color: primaryFillColor,
		filters: filters || [],
		is_vector: true,
		params: {
			boundary: isBox ? 'box' : 'dynamic',
			kerning: 'metrics',
			text_direction: 'ltr',
			wrap_direction: 'ttb',
			halign: halign,
			valign: 'top',
			wrap: 'letter',
			fill: primaryFillColor,
			size: primaryFontSize,
			font: { value: primaryFamily },
			bold: { value: bold },
			italic: { value: italic },
			underline: { value: underline },
			strikethrough: { value: strikethrough },
		},
		render_function: ['text', 'render'],
		data: data,
		link: psdLayer.canvas || null,
		opacity: opacity,
		visible: visible,
		composition: composition,
		mask: mask,
	};
}

/**
 * Segments rawText into lines and spans using styleRuns.
 */
function build_text_spans(rawText, styleRuns, globalStyle, defaultMeta, scale) {
	if (!styleRuns || !Array.isArray(styleRuns) || styleRuns.length <= 1) {
		return rawText.split(/\r\n|\r|\n/).map(lineStr => [
			{
				text: lineStr,
				meta: Object.assign({}, defaultMeta)
			}
		]);
	}

	// Map each character index to its resolved metadata
	const charMetas = [];
	let runIndex = 0;
	let runCharCount = 0;

	for (let c = 0; c < rawText.length; c++) {
		while (runIndex < styleRuns.length && runCharCount >= styleRuns[runIndex].length) {
			runIndex++;
			runCharCount = 0;
		}
		const run = styleRuns[runIndex] || { style: {} };
		const style = Object.assign({}, globalStyle, run.style);

		const fontObj = style.font || defaultMeta.font;
		let family = fontObj && fontObj.name ? clean_psd_font_family(fontObj.name) : defaultMeta.family;
		let size = style.fontSize ? Math.round(style.fontSize * scale) : defaultMeta.size;
		let fill_color = parse_psd_color(style.fillColor) || defaultMeta.fill_color;
		const bold = Boolean(style.fauxBold || (fontObj && fontObj.name && /bold/i.test(fontObj.name)));
		const italic = Boolean(style.fauxItalic || (fontObj && fontObj.name && /(italic|oblique)/i.test(fontObj.name)));
		const underline = Boolean(style.underline);
		const strikethrough = Boolean(style.strikethrough);

		charMetas.push({
			family: family,
			size: size,
			bold: bold,
			italic: italic,
			underline: underline,
			strikethrough: strikethrough,
			fill_color: fill_color,
		});
		runCharCount++;
	}

	const lines = rawText.split(/\r\n|\r|\n/);
	let charOffset = 0;
	const result = [];

	for (let l = 0; l < lines.length; l++) {
		const lineText = lines[l];
		if (lineText.length === 0) {
			result.push([{ text: '', meta: Object.assign({}, defaultMeta) }]);
			charOffset += 1;
			continue;
		}

		const lineSpans = [];
		let currentSpan = {
			text: lineText[0],
			meta: charMetas[charOffset] || defaultMeta
		};

		for (let c = 1; c < lineText.length; c++) {
			const meta = charMetas[charOffset + c] || defaultMeta;
			if (
				meta.size === currentSpan.meta.size &&
				meta.fill_color === currentSpan.meta.fill_color &&
				meta.family === currentSpan.meta.family &&
				meta.bold === currentSpan.meta.bold &&
				meta.italic === currentSpan.meta.italic
			) {
				currentSpan.text += lineText[c];
			} else {
				lineSpans.push(currentSpan);
				currentSpan = { text: lineText[c], meta: meta };
			}
		}
		lineSpans.push(currentSpan);
		result.push(lineSpans);
		charOffset += lineText.length + 1;
	}

	return result;
}

/**
 * Exports the active document to a PSD file.
 * 
 * @param {Array} layers - Array of Vantage Point layer objects
 * @param {number} docWidth - Canvas width
 * @param {number} docHeight - Canvas height
 * @param {object} options - Export options { filename }
 */
export async function export_psd(layers, docWidth, docHeight, options = {}) {
	const w = docWidth || config.WIDTH || 800;
	const h = docHeight || config.HEIGHT || 600;
	let fname = options.filename || (config.SAVE_NAME ? config.SAVE_NAME + '.psd' : 'image.psd');
	if (!fname.toLowerCase().endsWith('.psd')) {
		fname += '.psd';
	}

	alertify.message('Generating Photoshop Document...');

	let compositeCanvas = null;
	if (app.Layers && app.Layers.Composite_cache && app.Layers.Composite_cache.documentCanvas) {
		compositeCanvas = app.Layers.Composite_cache.documentCanvas;
	} else {
		compositeCanvas = document.createElement('canvas');
		compositeCanvas.width = w;
		compositeCanvas.height = h;
		const compCtx = compositeCanvas.getContext('2d');
		if (app.Layers) {
			app.Layers.convert_layers_to_canvas(compCtx, null, false);
		}
	}

	const sortedLayers = (layers && Array.isArray(layers))
		? layers.concat().sort((a, b) => (a.order || 0) - (b.order || 0))
		: [];

	const psdChildren = [];

	for (let i = 0; i < sortedLayers.length; i++) {
		const layer = sortedLayers[i];
		const psdLayer = export_layer_to_psd(layer, w, h);
		if (psdLayer) {
			psdChildren.push(psdLayer);
		}
	}

	if (psdChildren.length === 0) {
		psdChildren.push({
			name: 'Background',
			canvas: compositeCanvas,
			left: 0,
			top: 0,
		});
	}

	const psd = {
		width: w,
		height: h,
		channels: 4,
		bitsPerChannel: 8,
		colorMode: 3,
		canvas: compositeCanvas,
		children: psdChildren,
	};

	try {
		const buffer = writePsd(psd, { generateThumbnail: true });
		const blob = new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
		filesaver.saveAs(blob, fname);
		alertify.success(`Exported "${fname}" successfully.`);
	} catch (err) {
		console.error('[PSD] Failed to write PSD:', err);
		alertify.error('Failed to export PSD: ' + (err.message || 'Unknown error'));
	}
}

/**
 * Translates a Vantage Point layer into an ag-psd layer object.
 */
function export_layer_to_psd(layer, docWidth, docHeight) {
	const isClipping = layer.composition === 'source-atop';
	const blendMode = COMPOSITION_TO_PSD[layer.composition] || 'normal';
	const opacity = (layer.opacity != null ? layer.opacity : 100) / 100;

	// 1. Adjustment Layer Export
	if (layer.type === 'adjustment') {
		const normType = (layer.adjustment_type || 'brightness').toLowerCase().replace(/_/g, '-');
		let adjObj = { type: 'brightness/contrast' };
		if (normType === 'brightness') {
			adjObj = {
				type: 'brightness/contrast',
				brightness: (layer.params && layer.params.value !== undefined) ? layer.params.value : 0,
				contrast: (layer.params && layer.params.contrast !== undefined) ? layer.params.contrast : 0,
			};
		} else if (normType === 'contrast') {
			adjObj = {
				type: 'brightness/contrast',
				brightness: 0,
				contrast: (layer.params && layer.params.value !== undefined) ? layer.params.value : 0,
			};
		} else if (normType === 'invert') {
			adjObj = { type: 'invert' };
		} else if (normType === 'threshold') {
			adjObj = { type: 'threshold', level: layer.params?.value ?? 128 };
		} else if (normType === 'grayscale') {
			adjObj = { type: 'black & white' };
		}

		const psdLayer = {
			name: layer.name || 'Adjustment',
			adjustment: adjObj,
			left: 0,
			top: 0,
			opacity: opacity,
			hidden: layer.visible === false,
			clipping: isClipping,
			blendMode: blendMode,
		};

		if (layer.mask && layer.mask.link) {
			const maskCanvas = ensure_canvas(layer.mask.link);
			if (maskCanvas) {
				psdLayer.mask = {
					canvas: maskCanvas,
					left: Math.round(layer.mask.x || 0),
					top: Math.round(layer.mask.y || 0),
					disabled: layer.mask.enabled === false,
					positionRelativeToLayer: layer.mask.linked !== false,
				};
			}
		}

		return psdLayer;
	}

	const layerCanvas = render_layer_to_canvas(layer, docWidth, docHeight);
	if (!layerCanvas) return null;

	const left = Math.round(layer.x || 0);
	const top = Math.round(layer.y || 0);

	const psdLayer = {
		name: layer.name || 'Layer',
		canvas: layerCanvas,
		left: left,
		top: top,
		opacity: opacity,
		hidden: layer.visible === false,
		clipping: isClipping,
		blendMode: blendMode,
	};

	if (layer.mask && layer.mask.link) {
		const maskCanvas = ensure_canvas(layer.mask.link);
		if (maskCanvas) {
			psdLayer.mask = {
				canvas: maskCanvas,
				left: Math.round(layer.mask.x != null ? layer.mask.x : left),
				top: Math.round(layer.mask.y != null ? layer.mask.y : top),
				disabled: layer.mask.enabled === false,
				positionRelativeToLayer: layer.mask.linked !== false,
			};
		}
	}

	// Export layer effects (e.g. Drop Shadow)
	if (layer.filters && layer.filters.length > 0) {
		for (const f of layer.filters) {
			if (f.name === 'shadow' || f.name === 'drop-shadow') {
				if (!psdLayer.effects) psdLayer.effects = {};
				if (!psdLayer.effects.dropShadow) psdLayer.effects.dropShadow = [];
				const p = f.params || {};
				const x = p.x || 0;
				const y = p.y || 0;
				const dist = Math.round(Math.hypot(x, y));
				const angleRad = Math.atan2(y, -x);
				let angleDeg = Math.round((angleRad * 180) / Math.PI);
				if (angleDeg < 0) angleDeg += 360;
				const rgb = hex_to_rgb(p.color || '#000000');
				psdLayer.effects.dropShadow.push({
					enabled: !f.disabled,
					angle: angleDeg,
					distance: { units: 'Pixels', value: dist },
					size: { units: 'Pixels', value: p.value || 5 },
					opacity: (p.opacity != null ? p.opacity : 75) / 100,
					color: rgb,
				});
			}
		}
	}

	if (layer.type === 'text' && Array.isArray(layer.data)) {
		let textStr = '';
		let firstMeta = null;

		for (let l = 0; l < layer.data.length; l++) {
			const line = layer.data[l];
			let lineText = '';
			if (Array.isArray(line)) {
				for (let s = 0; s < line.length; s++) {
					lineText += line[s].text || '';
					if (!firstMeta && line[s].meta) {
						firstMeta = line[s].meta;
					}
				}
			}
			textStr += (l > 0 ? '\r' : '') + lineText;
		}

		if (textStr.length > 0) {
			const meta = firstMeta || {};
			const fontSize = meta.size || 32;
			const family = meta.family || 'Arial';
			const rgb = hex_to_rgb(meta.fill_color || '#000000');
			const params = layer.params || {};
			const isBox = params.boundary === 'box';
			const halign = String(params.halign || 'left').toLowerCase();
			let justification = 'left';
			if (halign === 'center') justification = 'center';
			else if (halign === 'right') justification = 'right';

			// Preserve point vs paragraph/box for round-trip with ag-psd.
			// boxBounds are in text-local space [top, left, bottom, right].
			const w = Math.max(1, Math.round(layer.width || 1));
			const h = Math.max(1, Math.round(layer.height || 1));
			psdLayer.text = {
				text: textStr,
				shapeType: isBox ? 'box' : 'point',
				boxBounds: isBox ? [0, 0, h, w] : undefined,
				pointBase: isBox ? undefined : [0, 0],
				paragraphStyle: {
					justification: justification,
				},
				style: {
					font: { name: family },
					fontSize: fontSize,
					fauxBold: Boolean(meta.bold),
					fauxItalic: Boolean(meta.italic),
					underline: Boolean(meta.underline),
					strikethrough: Boolean(meta.strikethrough),
					fillColor: { r: rgb.r, g: rgb.g, b: rgb.b },
				}
			};
		}
	}

	return psdLayer;
}

/**
 * Ensures a layer is rendered onto an HTMLCanvasElement with bounding dimensions.
 */
function render_layer_to_canvas(layer, docWidth, docHeight) {
	if (layer.link_canvas && layer.link_canvas instanceof HTMLCanvasElement) {
		return layer.link_canvas;
	}
	if (layer.link && layer.link instanceof HTMLCanvasElement) {
		return layer.link;
	}
	if (layer.link && (layer.link instanceof HTMLImageElement || layer.link instanceof Image)) {
		const c = document.createElement('canvas');
		c.width = Math.max(1, layer.width || layer.link.width || 1);
		c.height = Math.max(1, layer.height || layer.link.height || 1);
		const ctx = c.getContext('2d');
		ctx.drawImage(layer.link, 0, 0, c.width, c.height);
		return c;
	}

	const w = Math.max(1, Math.round(layer.width || docWidth || 1));
	const h = Math.max(1, Math.round(layer.height || docHeight || 1));
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d');

	if (layer.render_function && app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules) {
		const modName = layer.render_function[0];
		const fnName = layer.render_function[1];
		if (app.GUI.GUI_tools.tools_modules[modName] && typeof app.GUI.GUI_tools.tools_modules[modName].object[fnName] === 'function') {
			const clone = Object.assign({}, layer, { x: 0, y: 0 });
			app.GUI.GUI_tools.tools_modules[modName].object[fnName](ctx, clone);
			return c;
		}
	}

	return c;
}

function ensure_canvas(source) {
	if (!source) return null;
	if (source instanceof HTMLCanvasElement) return source;
	if (source instanceof HTMLImageElement || source instanceof Image) {
		const c = document.createElement('canvas');
		c.width = source.width;
		c.height = source.height;
		c.getContext('2d').drawImage(source, 0, 0);
		return c;
	}
	return null;
}

function hex_to_rgb(hex) {
	hex = (hex || '#000000').replace(/^#/, '');
	if (hex.length === 3) {
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}
	const num = parseInt(hex, 16);
	return {
		r: (num >> 16) & 255,
		g: (num >> 8) & 255,
		b: num & 255,
	};
}
