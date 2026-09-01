/*
 * WebGL Renderer for PhotoChop.
 *
 * GPU-accelerated layer compositing using WebGL2 (with WebGL1 fallback).
 * Renders layers as textured quads with opacity, visibility, and normal
 * blend mode.
 *
 * Architecture:
 *   CPU document (config.layers) --> GPU textures --> WebGL compositing --> offscreen canvas
 *   Offscreen canvas --> drawImage onto main canvas (for overlays)
 *
 * Key design decisions:
 *   - Document model remains CPU-side (config.layers is authoritative)
 *   - GPU textures are cached and invalidated only when layer data changes
 *   - WebGL canvas is offscreen; main canvas stays 2D for tool overlays
 *   - Falls back gracefully if WebGL is unavailable
 *   - Handles context loss by rebuilding from CPU document
 *
 * Limitations (intentional for incremental migration):
 *   - Layers with filters, non-source-over composition, or a layer mask are
 *     not GPU-faithful yet; they are detected by can_render_layers() and the
 *     whole document falls back to the Canvas 2D pipeline for that frame.
 *     Masked layers render through that pipeline's multiply_alpha_by_mask_world
 *     path, which matches the CPU document model exactly.
 *   - Tool overlays remain Canvas 2D
 */

import config from './../../config.js';
import zoomView from './../../libs/zoomView.js';

var instance = null;

// ---- GLSL Shaders ----

var VERT_SHADER = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
uniform vec2 u_resolution;
uniform vec4 u_dstRect;
uniform float u_rotation;
varying vec2 v_texCoord;

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
uniform float u_opacity;

varying vec2 v_texCoord;

void main() {
	vec4 color = texture2D(u_layerTexture, v_texCoord);

	color.a *= u_opacity;

	gl_FragColor = color;
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

		/** @type {number} document width */
		this.docWidth = 0;

		/** @type {number} document height */
		this.docHeight = 0;

		/** @type {number} max GPU texture size */
		this.maxTextureSize = 0;

		/** @type {boolean} whether context loss has been detected */
		this.contextLost = false;
	}

	// ---- Initialization ----

	/**
	 * Reports whether the GPU path can faithfully render the given layer stack.
	 * The caller falls back to the Canvas 2D pipeline when this returns false.
	 *
	 * The WebGL path currently drops layer filters and only reproduces the
	 * source-over blend mode exactly, so any visible layer that needs an active
	 * filter or another composition mode must go through Canvas 2D.
	 *
	 * @param {Object[]} layers - sorted layers (bottom to top)
	 * @param {number|null} disabled_filter_id - id of the currently disabled
	 *   filter (matched the same way the Canvas 2D pipeline skips it)
	 * @returns {boolean}
	 */
	can_render_layers(layers, disabled_filter_id) {
		for (var i = 0; i < layers.length; i++) {
			var layer = layers[i];
			if (layer == null || layer.type == null || layer.visible === false)
				continue;

			if (layer.type === 'adjustment') {
				return false;
			}

			//active filters need the 2D filter pipeline
			var filters = layer.filters;
			if (filters && filters.length) {
				for (var f = 0; f < filters.length; f++) {
					var filter = filters[f];
					if (!filter || filter.disabled === true || filter.visible === false) continue;
					if (Array.isArray(disabled_filter_id)) {
						if (disabled_filter_id.includes(filter.id) || disabled_filter_id.includes(filter.name)) continue;
					} else if (filter.id === disabled_filter_id || filter.name === disabled_filter_id) {
						continue;
					}
					return false;
				}
			}

			//only source-over is reproduced exactly by the GPU blend setup
			var composition = layer.composition;
			if (composition != null && composition !== 'source-over') {
				return false;
			}

			//layer masks are applied on the CPU by the Canvas 2D pipeline
			//(multiply_alpha_by_mask_world); the WebGL shader path can't sample
			//mask textures reliably for render-function layers, so fall back
			if (layer.mask && layer.mask.enabled !== false) {
				return false;
			}
		}
		return true;
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
			u_opacity: gl.getUniformLocation(program, 'u_opacity'),
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
	 * Resize the WebGL offscreen canvas.
	 * @param {number} width
	 * @param {number} height
	 */
	resize(width, height) {
		this.docWidth = width;
		this.docHeight = height;
		if (this.glCanvas) {
			this.glCanvas.width = width;
			this.glCanvas.height = height;
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
		this.docWidth = docWidth;
		this.docHeight = docHeight;

		gl.viewport(0, 0, docWidth, docHeight);

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
				if (layer.visible === false || layer.type == null) continue;

				// Get or create the layer texture
				var texInfo = this._get_or_create_texture(layer);
				if (!texInfo) continue;

				// Bind layer texture
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);
				gl.uniform1i(this.uniforms.u_layerTexture, 0);

				// Set opacity
				gl.uniform1f(this.uniforms.u_opacity, (layer.opacity || 100) / 100);

				// Set destination rectangle: [x, y, width, height] in document pixels.
				// Expand by pad so the padded texture maps correctly.
				var pad = texInfo.pad || 0;
				gl.uniform4f(this.uniforms.u_dstRect,
					(layer.x || 0) - pad, (layer.y || 0) - pad,
					(layer.width || 0) + pad * 2, (layer.height || 0) + pad * 2
				);

				// Set rotation (convert degrees to radians).
				// Rotation is applied in Y-down document space (same convention as
				// Canvas 2D ctx.rotate), so no negation is needed even though the
				// vertex shader flips Y for clip space.
				gl.uniform1f(this.uniforms.u_rotation,
					(layer.rotate || 0) * Math.PI / 180
				);

				// Set blend mode
				this._set_blend_mode(layer.composition);

				// Draw the quad
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			} catch (err) {
				console.warn('WebGL render error on layer', layers[i] ? layers[i].id : i, err);
			}
		}
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
		}
		this.textureCache = {};
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

			// Delete buffers and program
			if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
			if (this.quadTCO) gl.deleteBuffer(this.quadTCO);
			if (this.program) gl.deleteProgram(this.program);

			this.gl = null;
		}
		this.glCanvas = null;
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
			cached.height === srcHeight) {
			// Reuse existing texture
			return cached;
		}

		if (cached && layer.link_canvas && cached.width === srcWidth && cached.height === srcHeight) {
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
		};

		this.textureCache[id] = texInfo;
		return texInfo;
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

						ctx.save();
						ctx.scale(SUPER, SUPER);
						// Shift by pad so strokes at the bounding-box edge have room
						ctx.translate(pad - (layer.x || 0), pad - (layer.y || 0));
						this._gui_tools_ref.tools_modules[render_class].object[render_function](ctx, layer, false);
						ctx.restore();
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

	// ---- Blend Modes ----

	/**
	 * Set the WebGL blend mode to approximate a Canvas 2D composition mode.
	 * Only 'source-over' (normal) is fully supported in this initial version.
	 * Other modes fall back to source-over.
	 *
	 * @param {string} composition - Canvas 2D globalCompositeOperation value
	 */
	_set_blend_mode(composition) {
		var gl = this.gl;

		switch (composition) {
			case 'source-over':
			case null:
			case undefined:
				// Normal blending: src * srcAlpha + dst * (1 - srcAlpha)
				gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;

			case 'source-atop':
				// Clip masking: only draw where destination has content
				gl.blendFuncSeparate(gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;

			case 'multiply':
				// Approximate multiply: output = src * dst
				// WebGL doesn't have a native multiply blend, so we approximate
				gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;

			default:
				// Fall back to normal blending
				gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
		}
	}
}

export default WebGL_renderer_class;
