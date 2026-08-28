/*
 * Canvas 2D Renderer for PhotoChop.
 *
 * Wraps the existing Canvas 2D rendering pipeline from base-layers.js.
 * This is the default/fallback renderer. It preserves all existing behavior
 * including masks, filters, composition, selections, and tool overlays.
 *
 * The Canvas2D renderer does NOT maintain its own canvas element.
 * It uses the main #canvas_minipaint element directly, which means
 * grid, guides, selection, and tool overlays are all rendered on the
 * same surface as the layers.
 */

import config from './../../config.js';
import zoomView from './../../libs/zoomView.js';

var instance = null;

class Canvas_renderer_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		/** @type {'canvas2d'} */
		this.type = 'canvas2d';

		/** @type {boolean} */
		this.available = true;

		/** @type {HTMLCanvasElement} */
		this.canvas = null;

		/** @type {CanvasRenderingContext2D} */
		this.ctx = null;

		/** @type {number} */
		this.docWidth = 0;

		/** @type {number} */
		this.docHeight = 0;
	}

	/**
	 * Initialize using the existing main canvas.
	 * @param {number} width
	 * @param {number} height
	 * @returns {boolean}
	 */
	init(width, height) {
		this.canvas = document.getElementById('canvas_minipaint');
		if (!this.canvas) {
			console.error('Canvas2D renderer: canvas element not found');
			return false;
		}
		this.ctx = this.canvas.getContext('2d');
		if (!this.ctx) {
			console.error('Canvas2D renderer: could not get 2d context');
			return false;
		}
		this.docWidth = width;
		this.docHeight = height;
		this.available = true;
		return true;
	}

	/**
	 * Resize is handled by base-gui.prepare_canvas(). No-op here.
	 */
	resize(width, height) {
		this.docWidth = width;
		this.docHeight = height;
	}

	/**
	 * Returns the main canvas element.
	 * @returns {HTMLCanvasElement}
	 */
	getCanvas() {
		return this.canvas;
	}

	/**
	 * Clear the canvas for a new frame.
	 * Mirrors the existing pre_render() logic.
	 */
	clear() {
		if (!this.ctx) return;
		this.ctx.save();
		zoomView.canvasDefault();
		this.ctx.clearRect(
			0,
			0,
			config.WIDTH * config.ZOOM,
			config.HEIGHT * config.ZOOM
		);
	}

	/**
	 * Begin frame: apply zoom transform.
	 * Mirrors the zoom handling in render().
	 */
	begin_frame() {
		if (!this.ctx) return;
		zoomView.apply();
	}

	/**
	 * Render all layers using the existing Canvas 2D pipeline.
	 * This delegates to the render_objects() method on Base_layers_class.
	 *
	 * Note: The actual layer rendering is still performed by Base_layers_class
	 * because it has deep dependencies on tools, masks, filters, and selections.
	 * The Canvas2D renderer acts as a pass-through — the existing code path
	 * continues to use this.ctx directly.
	 *
	 * @param {Object[]} layers - sorted layers
	 * @param {Function} renderObjectsFn - bound render_objects from Base_layers_class
	 * @param {Function} prepareFn - bound prepare function (ctx.save)
	 */
	render_layers_with_callback(layers, renderObjectsFn, prepareFn) {
		if (!this.ctx) return;
		renderObjectsFn(this.ctx, layers, prepareFn);
	}

	/**
	 * End frame: restore context state.
	 */
	end_frame() {
		if (!this.ctx) return;
		this.ctx.restore();
		zoomView.canvasDefault();
	}

	/**
	 * No-op for Canvas2D — the canvas is managed by base-gui.
	 */
	on_document_resize(width, height) {
		this.docWidth = width;
		this.docHeight = height;
	}

	/**
	 * No-op for Canvas2D — no cached GPU textures to invalidate.
	 */
	on_layer_data_changed(layerId) {
		// Canvas 2D reads from layer.link/layer.link_canvas each frame.
		// No texture cache to invalidate.
	}

	/**
	 * No-op for Canvas2D.
	 */
	on_mask_changed(layerId) {
		// Same as above — masks are read from layer.mask.link each frame.
	}

	/**
	 * No-op for Canvas2D — no GPU resources to release.
	 */
	destroy() {
		this.canvas = null;
		this.ctx = null;
	}

	/**
	 * @returns {string}
	 */
	get_name() {
		return 'Canvas 2D';
	}
}

export default Canvas_renderer_class;
