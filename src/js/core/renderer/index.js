/*
 * Renderer factory for PhotoChop.
 *
 * Provides a unified interface for creating and accessing the active renderer.
 * The renderer can be switched at runtime (Canvas 2D <-> WebGL).
 *
 * Usage:
 *   import { create_renderer, get_renderer } from './renderer/index.js';
 *   create_renderer('auto');  // or 'canvas2d' or 'webgl'
 *   var renderer = get_renderer();
 */

import Canvas_renderer_class from './canvas-renderer.js';
import WebGL_renderer_class from './webgl-renderer.js';
import config from './../../config.js';

/** @type {Canvas_renderer_class|WebGL_renderer_class|null} */
var active_renderer = null;

/** @type {Canvas_renderer_class} */
var canvas2d_instance = null;

/** @type {WebGL_renderer_class} */
var webgl_instance = null;

/**
 * Create and activate a renderer.
 *
 * @param {'auto'|'canvas2d'|'webgl'} mode
 *   - 'auto': Try WebGL, fall back to Canvas 2D
 *   - 'canvas2d': Force Canvas 2D
 *   - 'webgl': Force WebGL (fails if unavailable)
 * @param {number} width - document width
 * @param {number} height - document height
 * @returns {Canvas_renderer_class|WebGL_renderer_class} the active renderer
 */
function create_renderer(mode, width, height) {
	// Destroy existing renderer
	if (active_renderer) {
		active_renderer.destroy();
		active_renderer = null;
	}

	// Create singleton instances if needed
	if (!canvas2d_instance) {
		canvas2d_instance = new Canvas_renderer_class();
	}
	if (!webgl_instance) {
		webgl_instance = new WebGL_renderer_class();
	}

	if (mode === 'webgl') {
		// Force WebGL
		if (webgl_instance.init(width, height)) {
			active_renderer = webgl_instance;
			config.RENDERER = 'webgl';
		} else {
			console.error('Renderer factory: WebGL requested but unavailable, falling back to Canvas 2D');
			active_renderer = canvas2d_instance;
			canvas2d_instance.init(width, height);
			config.RENDERER = 'canvas2d';
		}
	} else if (mode === 'canvas2d') {
		// Force Canvas 2D
		canvas2d_instance.init(width, height);
		active_renderer = canvas2d_instance;
		config.RENDERER = 'canvas2d';
	} else {
		// 'auto' or unknown: try WebGL, fall back to Canvas 2D
		if (webgl_instance.init(width, height)) {
			active_renderer = webgl_instance;
			config.RENDERER = 'webgl';
		} else {
			canvas2d_instance.init(width, height);
			active_renderer = canvas2d_instance;
			config.RENDERER = 'canvas2d';
		}
	}

	return active_renderer;
}

/**
 * Get the currently active renderer.
 * @returns {Canvas_renderer_class|WebGL_renderer_class}
 */
function get_renderer() {
	return active_renderer;
}

/**
 * Switch to a different renderer.
 * @param {'canvas2d'|'webgl'} mode
 * @param {number} width
 * @param {number} height
 * @returns {Canvas_renderer_class|WebGL_renderer_class}
 */
function switch_renderer(mode, width, height) {
	return create_renderer(mode, width, height);
}

export {
	create_renderer,
	get_renderer,
	switch_renderer,
};
