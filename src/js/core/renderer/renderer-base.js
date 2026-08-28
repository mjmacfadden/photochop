/*
 * Renderer abstraction layer for PhotoChop.
 *
 * Provides a common interface for Canvas 2D and WebGL renderers.
 * The document model (config.layers) remains CPU-side and authoritative.
 * GPU resources are cached rendering state derived from the document.
 *
 * Architecture:
 *   DOCUMENT MODEL (CPU)  -->  RENDERER API  -->  Canvas 2D | WebGL
 *
 * The renderer handles:
 *   - Layer compositing (opacity, visibility, order, blend modes)
 *   - Zoom and pan transforms
 *   - Layer masks (via secondary texture)
 *   - Canvas/document dimensions
 *   - Transparency checkerboard (via CSS, not rendered)
 *
 * The renderer does NOT handle:
 *   - Tool overlays (grid, guides, selection, marching ants)
 *   - Preview panel rendering
 *   - Document model mutations
 *   - History/undo
 *   - Selection rendering
 *
 * These remain in the existing Canvas 2D code path and are drawn
 * on top of the renderer output.
 */

var instance = null;

/**
 * Base renderer class. Subclasses must implement all methods.
 */
class Renderer_base_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		/** @type {'canvas2d'|'webgl'} */
		this.type = 'base';

		/** @type {boolean} whether this renderer is available */
		this.available = false;
	}

	/**
	 * Initialize the renderer. Called once at startup.
	 * @param {number} width - document width in pixels
	 * @param {number} height - document height in pixels
	 * @returns {boolean} true if initialization succeeded
	 */
	init(width, height) {
		throw new Error('Renderer: init() not implemented');
	}

	/**
	 * Resize the renderer's internal surfaces.
	 * @param {number} width
	 * @param {number} height
	 */
	resize(width, height) {
		throw new Error('Renderer: resize() not implemented');
	}

	/**
	 * Get the canvas element that displays the rendered output.
	 * For Canvas2D this is the main canvas. For WebGL this may be
	 * an offscreen canvas that gets composited onto the main canvas.
	 * @returns {HTMLCanvasElement}
	 */
	getCanvas() {
		throw new Error('Renderer: getCanvas() not implemented');
	}

	/**
	 * Clear the rendering surface.
	 */
	clear() {
		throw new Error('Renderer: clear() not implemented');
	}

	/**
	 * Begin a new frame. Called before render_layers().
	 */
	begin_frame() {
		throw new Error('Renderer: begin_frame() not implemented');
	}

	/**
	 * Render all layers in order (bottom to top).
	 *
	 * @param {Object[]} layers - sorted layers array (bottom first)
	 * @param {number} zoom - current zoom level
	 * @param {Object} pan - {x, y} pan offset in screen coords
	 * @param {number} docWidth - document width
	 * @param {number} docHeight - document height
	 */
	render_layers(layers, zoom, pan, docWidth, docHeight) {
		throw new Error('Renderer: render_layers() not implemented');
	}

	/**
	 * End a frame. Called after render_layers() and overlay rendering.
	 */
	end_frame() {
		throw new Error('Renderer: end_frame() not implemented');
	}

	/**
	 * Called when the document dimensions change.
	 * @param {number} width
	 * @param {number} height
	 */
	on_document_resize(width, height) {
		throw new Error('Renderer: on_document_resize() not implemented');
	}

	/**
	 * Called when a layer's pixel data changes.
	 * The renderer should invalidate any cached GPU texture for that layer.
	 * @param {number} layerId
	 */
	on_layer_data_changed(layerId) {
		throw new Error('Renderer: on_layer_data_changed() not implemented');
	}

	/**
	 * Called when a layer's mask changes.
	 * @param {number} layerId
	 */
	on_mask_changed(layerId) {
		throw new Error('Renderer: on_mask_changed() not implemented');
	}

	/**
	 * Release all GPU/CPU resources held by this renderer.
	 */
	destroy() {
		throw new Error('Renderer: destroy() not implemented');
	}

	/**
	 * Returns a human-readable name for this renderer.
	 * @returns {string}
	 */
	get_name() {
		return 'Base Renderer';
	}
}

export default Renderer_base_class;
