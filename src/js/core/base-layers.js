/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import app from "./../app.js";
import config from "./../config.js";
import Base_gui_class from "./base-gui.js";
import Base_selection_class from "./base-selection.js";
import Image_trim_class from "./../modules/image/trim.js";
import View_ruler_class from "./../modules/view/ruler.js";
import View_guides_class from "./../modules/view/guides.js";
import zoomView from "./../libs/zoomView.js";
import Helper_class from "./../libs/helpers.js";
import Mask_class from "./../modules/mask/mask.js";
import alertify from "./../../../node_modules/alertifyjs/build/alertify.min.js";
import { create_renderer, get_renderer, switch_renderer } from "./renderer/index.js";
import Composite_cache_class from "./renderer/composite-cache.js";

var instance = null;

/**
 * Layers class - manages layers. Each layer is object with various types. Keys:
 * - id (int)
 * - link (image)
 * - parent_id (int)
 * - name (string)
 * - type (string)
 * - x (int)
 * - y (int)
 * - width (int)
 * - height (int)
 * - width_original (int)
 * - height_original (int)
 * - visible (bool)
 * - is_vector (bool)
 * - hide_selection_if_active (bool)
 * - opacity (0-100)
 * - order (int)
 * - composition (string)
 * - rotate (int) 0-359
 * - data (various data here)
 * - params (object)
 * - color {hex}
 * - status (string)
 * - filters (array)
 * - render_function (function)
 */
class Base_layers_class {
	constructor() {
		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.Image_trim = new Image_trim_class();
		this.View_ruler = new View_ruler_class();
		this.View_guides = new View_guides_class();

		this.canvas = document.getElementById("canvas_minipaint");
		this.ctx = document.getElementById("canvas_minipaint").getContext("2d");
		this.ctx_preview = document
			.getElementById("canvas_preview")
			.getContext("2d");
		this.last_zoom = 1;
		this.auto_increment = 1;
		this.stable_dimensions = [];
		this.debug_rendering = false;
		this.render_success = null;
		this.disabled_filter_id = null;
		this.Composite_cache = new Composite_cache_class();
		this.render_frame_request = null;
	}

	/**
	 * do preparation on start
	 */
	init() {
		this.init_zoom_lib();

		// Create white-filled canvas for the background layer
		var bgCanvas = document.createElement('canvas');
		bgCanvas.width = config.WIDTH;
		bgCanvas.height = config.HEIGHT;
		var bgCtx = bgCanvas.getContext('2d');
		bgCtx.fillStyle = '#ffffff';
		bgCtx.fillRect(0, 0, config.WIDTH, config.HEIGHT);

		new app.Actions.Insert_layer_action({
			name: 'Background',
			locked: true,
			type: 'image',
			data: bgCanvas.toDataURL(),
		}).do();

		var sel_config = {
			enable_background: false,
			enable_borders: true,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				if (config.mask_active === true && config.layer && config.layer.mask && config.layer.mask.linked === false) {
					return config.layer.mask;
				}
				return config.layer;
			},
		};
		this.Base_selection = new Base_selection_class(
			this.ctx,
			sel_config,
			"main"
		);

		// Initialize renderer (defaults to Canvas 2D if WebGL unavailable)
		var renderer_mode = config.RENDERER || 'auto';
		this.active_renderer = create_renderer(renderer_mode, config.WIDTH, config.HEIGHT);

		this.invalidate({ document: true, preview: true, details: true, ruler: true });
	}

	init_zoom_lib() {
		zoomView.setBounds(0, 0, config.WIDTH, config.HEIGHT);
		zoomView.setContext(this.ctx);
		this.stable_dimensions = [config.WIDTH, config.HEIGHT];
	}

	pre_render() {
		this.ctx.save();
		zoomView.canvasDefault();
		this.ctx.clearRect(
			0,
			0,
			config.WIDTH * config.ZOOM,
			config.HEIGHT * config.ZOOM
		);
	}

	after_render() {
		config.need_render = false;
		config.need_render_changed_params = false;
		this.ctx.restore();
		zoomView.canvasDefault();

		//keep re-rendering so marching ants stay animated
		if (this.Base_selection.is_marching_ants_active()) {
			this.invalidate({ viewport: true });
		}
	}

	/**
	 * Request a render with an explicit scope. Existing callers that only set
	 * config.need_render remain conservative and trigger a full document build.
	 */
	invalidate(request = {}) {
		const cache = this.Composite_cache;
		if (request.viewport === true && !request.document && !request.full) {
			cache.viewportOnly = true;
		} else {
			cache.viewportOnly = false;
		}
		cache.explicitRequest = true;
		if (request.document === true || request.full === true)
			cache.invalidate_document();
		if (request.preview === true) cache.previewDirty = true;
		if (request.details === true) cache.detailsDirty = true;
		if (request.ruler === true) cache.rulerDirty = true;
		config.need_render = true;
	}

	/**
	 * Schedules a single display frame. The config.need_render setter calls this
	 * as a compatibility bridge for legacy callers that still set that flag.
	 */
	request_render() {
		if (this.render_frame_request != null)
			return;
		this.render_frame_request = requestAnimationFrame(() => {
			this.render_frame_request = null;
			this.render(true);
		});
	}

	/**
	 * Recompose a draft top layer over a cached prefix. This is deliberately
	 * narrow: unsupported stacks fall back to a normal full invalidation.
	 */
	render_interactive_layer(layerId) {
		this.Composite_cache.explicitRequest = true;
		this.Composite_cache.pendingInteractiveLayerId = layerId;
		config.need_render = true;
	}

	can_render_interactive_layer(layer, layers) {
		if (!layer || layer.visible === false || layer.type == null)
			return false;
		if (layer.type === 'adjustment')
			return false;
		// The initial fast path intentionally handles only an independent,
		// top-most normal layer. Masks, filters, clipping and blend modes keep
		// using the exact legacy compositor.
		if (layer.composition !== 'source-over' || (layer.filters && layer.filters.length)
			|| (layer.mask && layer.mask.enabled !== false))
			return false;
		return layers[0] && layers[0].id === layer.id
			&& (!layers[1] || layers[1].composition !== 'source-atop');
	}

	render_document_cache(layers) {
		const cache = this.Composite_cache;
		const ctx = cache.documentCanvas.getContext('2d');
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
		const tempCanvas = this.create_new_canvas(null, config.WIDTH, config.HEIGHT);
		this.render_objects(ctx, tempCanvas, layers, () => ctx.save());
		ctx.restore();
		cache.documentDirty = false;
		cache.previewDirty = true;
		cache.activeLayerId = null;
	}

	render_interactive_layer_cache(layer, layers) {
		const cache = this.Composite_cache;
		if (!this.can_render_interactive_layer(layer, layers))
			return false;

		const documentCtx = cache.documentCanvas.getContext('2d');
		const prefixCtx = cache.prefixCanvas.getContext('2d');
		if (cache.activeLayerId !== layer.id) {
			prefixCtx.setTransform(1, 0, 0, 1, 0, 0);
			prefixCtx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
			const tempCanvas = this.create_new_canvas(null, config.WIDTH, config.HEIGHT);
			this.render_objects(prefixCtx, tempCanvas, layers.slice(1), () => prefixCtx.save());
			prefixCtx.restore();
		}

		documentCtx.setTransform(1, 0, 0, 1, 0, 0);
		documentCtx.clearRect(0, 0, config.WIDTH, config.HEIGHT);
		documentCtx.drawImage(cache.prefixCanvas, 0, 0);
		documentCtx.globalAlpha = layer.opacity / 100;
		documentCtx.globalCompositeOperation = layer.composition;
		this.render_object(documentCtx, layer);
		documentCtx.globalAlpha = 1;
		documentCtx.globalCompositeOperation = 'source-over';
		cache.mark_interactive(layer.id);
		return true;
	}

	render_cached_preview() {
		const cache = this.Composite_cache;
		const w = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
		const h = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;
		this.ctx_preview.save();
		this.ctx_preview.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx_preview.clearRect(0, 0, w, h);
		this.ctx_preview.drawImage(cache.documentCanvas, 0, 0, w, h);
		this.ctx_preview.restore();
		this.Base_gui.GUI_preview.render_preview_active_zone();
		cache.previewDirty = false;
	}

	/**
	 * renders all layers objects on main canvas
	 *
	 * @param {bool} force
	 */
	render(force) {
		if (force !== true) {
			// Legacy callers do not describe what changed, so preserve their
			// correctness by invalidating the document cache. New callers use
			// invalidate({ viewport: true }) or render_interactive_layer().
			this.invalidate({ document: true, preview: true, details: true });
			return;
		}

		if (
			this.stable_dimensions[0] != config.WIDTH ||
			this.stable_dimensions[1] != config.HEIGHT
		) {
			//dimensions changed - re-init zoom lib
			this.init_zoom_lib();
		}

		if (config.need_render == true) {
			const cache = this.Composite_cache;
			const zoom_changed = this.last_zoom != config.ZOOM;
			// A direct write to config.need_render is an old, unclassified
			// invalidation. It must stay conservative. Explicit invalidations can
			// safely request a viewport-only frame.
			if (!cache.viewportOnly && (!cache.explicitRequest || cache.pendingInteractiveLayerId != null)) {
				if (cache.pendingInteractiveLayerId == null) {
					cache.invalidate_document();
				}
				cache.detailsDirty = true;
				cache.rulerDirty = true;
			}
			cache.viewportOnly = false;
			cache.explicitRequest = false;
			cache.ensure_size(config.WIDTH, config.HEIGHT);
			this.render_success = null;

			if (this.debug_rendering === true) {
				console.log("Rendering...");
			}

			if (this.last_zoom != null && this.last_zoom > 0 && Math.abs(this.last_zoom - config.ZOOM) > 0.0001) {
				//change zoom
				var centerX = (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data) ? this.Base_gui.GUI_preview.zoom_data.x : (config.visible_width / 2);
				var centerY = (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data) ? this.Base_gui.GUI_preview.zoom_data.y : (config.visible_height / 2);
				zoomView.scaleAt(
					centerX,
					centerY,
					config.ZOOM / this.last_zoom
				);
			} else if (this.last_zoom == null || Math.abs(zoomView.getScale() - config.ZOOM) > 0.0001) {
				zoomView.reset(config.ZOOM || 1);
			} else if (this.Base_gui && this.Base_gui.GUI_preview && this.Base_gui.GUI_preview.zoom_data && this.Base_gui.GUI_preview.zoom_data.move_pos != null) {
				//move visible window
				var pos = this.Base_gui.GUI_preview.zoom_data.move_pos;
				var pos_global = zoomView.toScreen(pos);
				zoomView.move(-pos_global.x, -pos_global.y);
				this.Base_gui.GUI_preview.zoom_data.move_pos = null;
			}

			//take data
			var layers_sorted = this.get_sorted_layers();

			// Check if active renderer supports direct layer compositing (WebGL)
			// and can faithfully render every layer; otherwise use the exact
			// Canvas 2D pipeline for that frame (filters, non-source-over
			// composition modes, etc.)
			var renderer = get_renderer();
			var webgl_usable = renderer && renderer.type === 'webgl' && renderer.available
				&& (!renderer.can_render_layers || renderer.can_render_layers(layers_sorted, this.disabled_filter_id));
			if (webgl_usable) {
				cache.pendingInteractiveLayerId = null;
				// ---- WebGL rendering path ----
				// Renders layers to offscreen WebGL canvas, then composites
				// onto main canvas. Overlays remain Canvas 2D.

				// Prepare main canvas (clear, save state)
				this.pre_render();

				// Apply zoom transform to main canvas for overlays
				zoomView.apply();

				// WebGL renders layers to its offscreen canvas
				renderer.clear();
				renderer.begin_frame();
				renderer.render_layers(
					layers_sorted,
					config.ZOOM,
					{ x: 0, y: 0 },
					config.WIDTH,
					config.HEIGHT
				);
				renderer.end_frame();

				// Composite WebGL output onto main canvas
				// The WebGL canvas contains the composited layers at document
				// resolution. Apply the zoomView transform (zoom + pan) so the
				// visible area follows navigator/pan/zoom like the 2D path.
				var glCanvas = renderer.getCanvas();
				if (glCanvas) {
					this.ctx.save();
					zoomView.apply();
					this.ctx.filter = "none";
					this.ctx.imageSmoothingEnabled = (config.ZOOM < 1);
					this.ctx.drawImage(glCanvas, 0, 0, config.WIDTH, config.HEIGHT);

					this.ctx.restore();
					zoomView.apply();
				}

				// Draw grid, guides, selection, tool overlays on main canvas (2D)
				this.Base_gui.draw_grid(this.ctx);
				this.Base_gui.draw_guides();
				this.Base_selection.draw_selection();
				this.render_overlay();

				// Render preview (still uses Canvas 2D)
				this.render_preview(layers_sorted);

				// Reset
				this.after_render();
			} else {
				// ---- Canvas 2D document cache ----
				let interactive_rendered = false;
				if (cache.pendingInteractiveLayerId != null) {
					const layer = this.get_layer(cache.pendingInteractiveLayerId);
					interactive_rendered = this.render_interactive_layer_cache(layer, layers_sorted);
					cache.pendingInteractiveLayerId = null;
					if (!interactive_rendered)
						cache.invalidate_document();
				}
				if (!interactive_rendered && cache.documentDirty) {
					this.render_document_cache(layers_sorted);
				}

				// Presentation is deliberately separate from composition. Zoom, pan,
				// selection animation, guides and tool controls only draw this bitmap.
				this.pre_render();
				zoomView.apply();
				this.ctx.imageSmoothingEnabled = (config.ZOOM < 1);
				this.ctx.drawImage(cache.documentCanvas, 0, 0);
				this.Base_gui.draw_grid(this.ctx);
				this.Base_gui.draw_guides();
				this.Base_selection.draw_selection();
				this.render_overlay();

				if (cache.previewDirty) {
					this.render_cached_preview();
				} else {
					// Navigation still changes the viewport rectangle even when the
					// document thumbnail itself is unchanged.
					this.Base_gui.GUI_preview.render_preview_active_zone();
				}

				this.after_render();
			}

			this.last_zoom = config.ZOOM;

			if (cache.detailsDirty) {
				this.Base_gui.GUI_details.render_details();
				cache.detailsDirty = false;
			}
			if (cache.rulerDirty || zoom_changed) {
				this.View_ruler.render_ruler();
				cache.rulerDirty = false;
			}

			if (this.render_success === false) {
				alertify.error("Rendered with errors.");
			}
		}

	}

	render_overlay() {
		var render_class = config.TOOL.name;
		var render_function = "render_overlay";

		if (
			typeof this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			] != "undefined"
		) {
			this.Base_gui.GUI_tools.tools_modules[render_class].object[
				render_function
			](this.ctx);
		}
	}

	/**
	 * LEGACY: use create_new_canvas();
	 */
	createNewCanvas(ctx, h, w) {
		this.create_new_canvas(ctx, w, h);
	}

	/**
	 * Creates a fresh new canvas with the same height and width as the provided one
	 * @param {canvas.context|null} ctx
	 * @param {number} [width]
	 * @param {number} [height]
	 */
	create_new_canvas(ctx, width, height) {
		const newCanvas = document.createElement("canvas");
		if(width){
			newCanvas.width = width;
		}
		else{
			newCanvas.width = ctx.canvas.width;
		}

		if(height){
			newCanvas.height = height;
		}
		else{
			newCanvas.height = ctx.canvas.height;
		}

		return newCanvas;
	}

	/**
	 * LEGACY: use render_objects()
	 */
	renderObjects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		this.render_objects(ctx, tempCanvas, layers, prepare, shouldSkip);
	}

	/**
	 * Renders objects based on the provided layers
	 * @param {canvas.context} ctx - Main canvas context where it needs to be rendered
	 * @param {canvas} tempCanvas - A temporary canvas which is a copy of the original canvas, but will be used if there will be needed to isolate an effect from others
	 * @param {Object[]} layers - Array of layers
	 * @param {Function} prepare - An optional function to prepare temporary and main canvases before the render if needed
	 * @param {Function} shouldSkip - An optional boolean function for skipping those layers which are not needed to be rendered
	 */
	render_objects(ctx, tempCanvas, layers, prepare, shouldSkip) {
		const tempCtx = tempCanvas.getContext("2d");
		// Prepare the temporary canvas if needed
		prepare && prepare();
		
		for (var i = layers.length - 1; i >= 0; i--) {
			var layer = layers[i];
			const nextLayer = layers[i - 1];

			// If the previous layer has clip masking effect and the current one is not the other end of the pair,
			// then render the temporary canvas for clip masking on top of the current.
			
			// Skip the layer if not needed to be rendered
			if (shouldSkip && shouldSkip(layer)) {
				continue;
			}

			if (layer.visible === false || layer.type == null) {
				continue;
			}

			// If this is an adjustment layer
			if (layer.type === 'adjustment') {
				if (
					layer.composition === "source-atop" ||
					(nextLayer && nextLayer.composition === "source-atop")
				) {
					if (nextLayer?.composition === "source-atop") {
						this.render_adjustment(ctx, layer);
						this.render_adjustment(tempCtx, layer);
					} else {
						this.render_adjustment(tempCtx, layer);
						ctx.restore();
						ctx.drawImage(tempCanvas, 0, 0);
						prepare && prepare();
						tempCtx.globalCompositeOperation = null;
						tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
					}
				} else {
					this.render_adjustment(ctx, layer);
				}
				continue;
			}

			// If the layer or next layer has clip masking effect (source-atop).
			// If there are such layers, this will make sure that layers will be rendered
			// in an isolated temporary canvas
			if (
				layer.composition === "source-atop" ||
				(nextLayer && nextLayer.composition === "source-atop")
			) {
				// Apply the effect in a isolated temporary canvas
				tempCtx.globalAlpha = layer.opacity / 100;
				tempCtx.globalCompositeOperation = layer.composition;

				// If the next layer has the clip masking effect then
				// isolated the shadow filter from temporary canvas and keep that in the original canvas
				if (nextLayer?.composition === "source-atop") {
					// Render the layer
					this.render_object(ctx, layer);
					// Then remove the shadow (if it exists) from the render process in the temporary canvas
					const filters = (layer.filters || []).filter((filter) => {
						return filter.name !== "shadow";
					});
					this.render_object(tempCtx, {
						...layer,
						filters,
					});
				} else {
					// If we are in this condition, then it means this is the last layer of clipped layers pair.
					// Render clipped layers on the temporary canvas
					this.render_object(tempCtx, layer);
					
					// Render the clipped layers on top of the current canvas
					ctx.restore();
					ctx.drawImage(tempCanvas, 0, 0);

					
					// Prepare canvas to since we called restore
					prepare && prepare();
					// Clear temporary canvas 
					tempCtx.globalCompositeOperation = null;
					tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
				}
			} else {
				ctx.globalAlpha = layer.opacity / 100;
				ctx.globalCompositeOperation = layer.composition;
				this.render_object(ctx, layer);
			}
		}

	}

	render_preview(layers) {
		var w = this.Base_gui.GUI_preview.PREVIEW_SIZE.w;
		var h = this.Base_gui.GUI_preview.PREVIEW_SIZE.h;

		this.ctx_preview.save();
		this.ctx_preview.clearRect(0, 0, w, h);

		const newCanvas = this.create_new_canvas(this.ctx_preview);
		newCanvas.getContext("2d").scale(w / config.WIDTH, h / config.HEIGHT);
		this.render_objects(this.ctx_preview, newCanvas, layers, () => {
			this.ctx_preview.save();
			//prepare scale
			this.ctx_preview.scale(w / config.WIDTH, h / config.HEIGHT);
		});

		this.ctx_preview.restore();
		this.Base_gui.GUI_preview.render_preview_active_zone();
	}

	/**
	 * export current layers to given canvas
	 *
	 * @param {canvas.context} ctx
	 * @param {object} object
	 * @param {boolean} is_preview
	 */
	render_object(ctx, object, is_preview) {
		if (object.visible == false || object.type == null) return;

		if (object.type === 'adjustment') {
			this.render_adjustment(ctx, object);
			return;
		}

		this.pre_render_object(ctx, object);

		var masked = object.mask != null && object.mask.enabled !== false;

		if (masked === true) {
			// Render into an offscreen buffer, multiply alpha by the mask,
			// then composite the result - so filters/opacity/composition on ctx
			// apply to the masked pixels only.
			if (!this.Mask) {
				this.Mask = new Mask_class();
			}
			var canvas = this.create_new_canvas(ctx);
			var bctx = canvas.getContext("2d");

			//mirror the current ctx transform and filter onto the buffer
			var t = null;
			if (typeof ctx.getTransform == "function")
				t = ctx.getTransform();
			bctx.setTransform(
				t ? t.a : 1,
				t ? t.b : 0,
				t ? t.c : 0,
				t ? t.d : 1,
				t ? t.e : 0,
				t ? t.f : 0
			);
			bctx.filter = ctx.filter;

			//draw the object into the buffer
			if (object.type == "image") {
				bctx.save();
				bctx.translate(
					object.x + object.width / 2,
					object.y + object.height / 2
				);
				bctx.rotate((object.rotate * Math.PI) / 180);
				bctx.drawImage(
					object.link_canvas != null ? object.link_canvas : object.link,
					-object.width / 2,
					-object.height / 2,
					object.width,
					object.height
				);
				bctx.restore();
			} else {
				//call render function from other module
				var render_class = object.render_function[0];
				var render_function = object.render_function[1];
				if (
					typeof this.Base_gui.GUI_tools.tools_modules[render_class] !=
					"undefined"
				) {
					this.Base_gui.GUI_tools.tools_modules[render_class].object[
						render_function
					](bctx, object, is_preview);
				} else {
					this.render_success = false;
					console.log("Error: unknown layer type: " + object.type);
				}
			}

			//apply the mask (alpha multiply) on the buffer content
			bctx.filter = "none";
			this.Mask.multiply_alpha_by_mask_world(bctx, object);

			//composite the screen-space buffer onto ctx without applying
			//the zoom transform or the filter a second time
			ctx.save();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.filter = "none";
			ctx.drawImage(canvas, 0, 0);
			ctx.restore();
			canvas.width = 1;
			canvas.height = 1;
		} else {
			//example with canvas object - other types should overwrite this method
			if (object.type == "image") {
				//image - default behavior
				ctx.save();

				ctx.translate(object.x + object.width / 2, object.y + object.height / 2);
				ctx.rotate((object.rotate * Math.PI) / 180);
				// TODO - Not sure why the check should be with null,
				// if nothing will break, then better to check if it's just truthy
				ctx.drawImage(
					object.link_canvas != null ? object.link_canvas : object.link,
					-object.width / 2,
					-object.height / 2,
					object.width,
					object.height
				);

				ctx.restore();
			} else {
				//call render function from other module
				var render_class = object.render_function[0];
				var render_function = object.render_function[1];
				if (
					typeof this.Base_gui.GUI_tools.tools_modules[render_class] !=
					"undefined"
				) {
					this.Base_gui.GUI_tools.tools_modules[render_class].object[
						render_function
					](ctx, object, is_preview);
				} else {
					this.render_success = false;
					console.log("Error: unknown layer type: " + object.type);
				}
			}
		}

		this.after_render_object(ctx, object);
	}

	/**
	 * Gets called before render_object starts it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	pre_render_object(ctx, object) {
		//apply pre-filters
		if (!object.filters) return;
		for (let k = 0; k < object.filters.length; k++) {
			let filter = object.filters[k];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(this.disabled_filter_id)) {
				if (this.disabled_filter_id.includes(filter.id) || this.disabled_filter_id.includes(filter.name) || (filter.name === 'drop-shadow' && this.disabled_filter_id.includes('shadow'))) {
					continue;
				}
			} else if (filter.id == this.disabled_filter_id || filter.name == this.disabled_filter_id) {
				continue;
			}

			let filter_name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;

			//find filter
			let found = false;
			for (let m in this.Base_gui.modules) {
				if (m.indexOf("effects") == -1 || m.indexOf("abstract") > -1) continue;

				let filter_class = this.Base_gui.modules[m];
				let module_name = m.split("/").pop();
				if (module_name == filter_name) {
					//found it
					found = true;
					filter_class.render_pre(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter_name);
			}
		}
	}

	/**
	 * Gets called after when render_object finishes it's job
	 * @param {canvas.context} ctx
	 * @param {object} object
	 */
	after_render_object(ctx, object) {
		//apply post-filters
		if (!object.filters) return;
		for (let k = 0; k < object.filters.length; k++) {
			let filter = object.filters[k];
			if (!filter || filter.disabled === true || filter.visible === false) continue;
			if (Array.isArray(this.disabled_filter_id)) {
				if (this.disabled_filter_id.includes(filter.id) || this.disabled_filter_id.includes(filter.name) || (filter.name === 'drop-shadow' && this.disabled_filter_id.includes('shadow'))) {
					continue;
				}
			} else if (filter.id == this.disabled_filter_id || filter.name == this.disabled_filter_id) {
				continue;
			}
			let filter_name = filter.name === 'drop-shadow' ? 'shadow' : filter.name;

			//find filter
			let found = false;
			for (let m in this.Base_gui.modules) {
				if (m.indexOf("effects") == -1 || m.indexOf("abstract") > -1) continue;

				let filter_class = this.Base_gui.modules[m];
				let module_name = m.split("/").pop();
				if (module_name == filter_name) {
					//found it
					found = true;
					filter_class.render_post(ctx, filter, object);
				}
			}
			if (found == false) {
				this.render_success = false;
				console.log("Error: can not find filter: " + filter_name);
			}
		}
	}

	/**
	 * Renders an adjustment layer onto targetCtx
	 * @param {CanvasRenderingContext2D} targetCtx
	 * @param {object} layer
	 */
	render_adjustment(targetCtx, layer) {
		if (!layer || layer.visible === false) return;

		const type = layer.adjustment_type ? layer.adjustment_type.toLowerCase().replace(/_/g, '-') : null;
		const filterString = this.get_adjustment_filter_string(layer);
		if (type !== 'threshold' && (!filterString || filterString === 'none')) return;

		const W = targetCtx.canvas.width;
		const H = targetCtx.canvas.height;
		if (W === 0 || H === 0) return;

		if (!this.adj_scratch_canvas) {
			this.adj_scratch_canvas = document.createElement('canvas');
		}
		if (this.adj_scratch_canvas.width !== W || this.adj_scratch_canvas.height !== H) {
			this.adj_scratch_canvas.width = W;
			this.adj_scratch_canvas.height = H;
		}

		const scratchCtx = this.adj_scratch_canvas.getContext('2d');
		scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
		scratchCtx.clearRect(0, 0, W, H);
		scratchCtx.drawImage(targetCtx.canvas, 0, 0);

		const hasMask = layer.mask != null && layer.mask.enabled !== false;
		const opacity = (layer.opacity ?? 100) / 100;
		const comp = layer.composition || 'source-over';

		if (hasMask) {
			if (!this.Mask) {
				this.Mask = new Mask_class();
			}
			if (!this.adj_filtered_canvas) {
				this.adj_filtered_canvas = document.createElement('canvas');
			}
			if (this.adj_filtered_canvas.width !== W || this.adj_filtered_canvas.height !== H) {
				this.adj_filtered_canvas.width = W;
				this.adj_filtered_canvas.height = H;
			}

			const fCtx = this.adj_filtered_canvas.getContext('2d');
			fCtx.setTransform(1, 0, 0, 1, 0, 0);
			fCtx.clearRect(0, 0, W, H);
			this.apply_adjustment_effect(fCtx, this.adj_scratch_canvas, layer, W, H);

			this.Mask.multiply_alpha_by_mask_world(fCtx, layer);

			targetCtx.save();
			targetCtx.setTransform(1, 0, 0, 1, 0, 0);
			targetCtx.globalAlpha = opacity;
			targetCtx.globalCompositeOperation = comp;
			targetCtx.drawImage(this.adj_filtered_canvas, 0, 0);
			targetCtx.restore();
		} else {
			if (opacity >= 0.999 && (comp === 'source-over' || comp === 'source-atop')) {
				targetCtx.save();
				targetCtx.setTransform(1, 0, 0, 1, 0, 0);
				targetCtx.clearRect(0, 0, W, H);
				this.apply_adjustment_effect(targetCtx, this.adj_scratch_canvas, layer, W, H);
				targetCtx.restore();
			} else {
				if (!this.adj_filtered_canvas) {
					this.adj_filtered_canvas = document.createElement('canvas');
				}
				if (this.adj_filtered_canvas.width !== W || this.adj_filtered_canvas.height !== H) {
					this.adj_filtered_canvas.width = W;
					this.adj_filtered_canvas.height = H;
				}

				const fCtx = this.adj_filtered_canvas.getContext('2d');
				fCtx.setTransform(1, 0, 0, 1, 0, 0);
				fCtx.clearRect(0, 0, W, H);
				this.apply_adjustment_effect(fCtx, this.adj_scratch_canvas, layer, W, H);

				targetCtx.save();
				targetCtx.setTransform(1, 0, 0, 1, 0, 0);
				targetCtx.globalAlpha = opacity;
				targetCtx.globalCompositeOperation = comp;
				targetCtx.drawImage(this.adj_filtered_canvas, 0, 0);
				targetCtx.restore();
			}
		}
	}

	/**
	 * Applies the adjustment effect (CSS filter or pixel algorithm) from srcCanvas onto destCtx
	 */
	apply_adjustment_effect(destCtx, srcCanvas, layer, W, H) {
		const type = layer.adjustment_type ? layer.adjustment_type.toLowerCase().replace(/_/g, '-') : null;

		if (type === 'threshold') {
			destCtx.drawImage(srcCanvas, 0, 0);
			const imgData = destCtx.getImageData(0, 0, W, H);
			const buf32 = new Uint32Array(imgData.data.buffer);
			const threshold = (layer.params && layer.params.value !== undefined) ? layer.params.value : 128;

			for (let i = 0; i < buf32.length; i++) {
				const pixel = buf32[i];
				const a = (pixel >> 24) & 0xff;
				if (a === 0) continue;
				const r = pixel & 0xff;
				const g = (pixel >> 8) & 0xff;
				const b = (pixel >> 16) & 0xff;
				const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				const v = lum >= threshold ? 255 : 0;
				buf32[i] = (a << 24) | (v << 16) | (v << 8) | v;
			}
			destCtx.putImageData(imgData, 0, 0);
		} else {
			const filterString = this.get_adjustment_filter_string(layer);
			destCtx.filter = filterString;
			destCtx.drawImage(srcCanvas, 0, 0);
			destCtx.filter = 'none';
		}
	}

	get_adjustment_filter_string(layer) {
		if (!layer) return 'none';

		let type = layer.adjustment_type;
		let params = layer.params || {};

		if (!type && layer.filters && layer.filters.length > 0) {
			let filtersArr = [];
			for (let f of layer.filters) {
				if (f && !f.disabled) {
					let str = this.convert_filter_to_css(f.name, f.params || {});
					if (str) filtersArr.push(str);
				}
			}
			return filtersArr.length > 0 ? filtersArr.join(' ') : 'none';
		}

		return this.convert_filter_to_css(type, params) || 'none';
	}

	convert_filter_to_css(type, params) {
		if (!type) return null;
		type = type.toLowerCase().replace(/_/g, '-');
		let value = params ? params.value : undefined;

		switch (type) {
			case 'brightness': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				let res = `brightness(${sysVal})`;
				if (params && params.contrast) {
					let cVal = params.contrast / 100 + 1;
					res += ` contrast(${cVal})`;
				}
				return res;
			}
			case 'contrast': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				return `contrast(${sysVal})`;
			}
			case 'brightness/contrast':
			case 'brightness-contrast': {
				let b = (params && params.brightness !== undefined) ? params.brightness : ((params && params.value !== undefined) ? params.value : 0);
				let c = (params && params.contrast !== undefined) ? params.contrast : 0;
				let bVal = b / 100 + 1;
				let cVal = c / 100 + 1;
				let res = `brightness(${bVal})`;
				if (c !== 0) res += ` contrast(${cVal})`;
				return res;
			}
			case 'hue-rotate':
			case 'hue_rotate': {
				let v = (value !== undefined) ? value : 0;
				return `hue-rotate(${v}deg)`;
			}
			case 'saturate': {
				let v = (value !== undefined) ? value : 0;
				let sysVal = v / 100 + 1;
				return `saturate(${sysVal})`;
			}
			case 'grayscale': {
				let v = (value !== undefined) ? value : 100;
				return `grayscale(${v / 100})`;
			}
			case 'sepia': {
				let v = (value !== undefined) ? value : 100;
				return `sepia(${v / 100})`;
			}
			case 'invert': {
				let v = (value !== undefined) ? value : 100;
				return `invert(${v / 100})`;
			}
			case 'blur': {
				let v = (value !== undefined) ? value : 5;
				return `blur(${v}px)`;
			}
			default:
				return null;
		}
	}

	/**
	 * creates new layer
	 *
	 * @param {array} settings
	 * @param {boolean} can_automate
	 */
	async insert(settings, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Insert_layer_action(settings, can_automate)
		);
	}

	/**
	 * autoresize layer, based on dimensions, up - always, if 1 layer - down.
	 *
	 * @param {int} width
	 * @param {int} height
	 * @param {int} layer_id
	 * @param {boolean} can_automate
	 */
	async autoresize(width, height, layer_id, can_automate = true) {
		return app.State.do_action(
			new app.Actions.Autoresize_canvas_action(
				width,
				height,
				layer_id,
				can_automate
			)
		);
	}

	/**
	 * returns layer
	 *
	 * @param {int} id
	 * @returns {object}
	 */
	get_layer(id) {
		if (id == undefined) {
			id = config.layer.id;
		}
		for (var i in config.layers) {
			if (config.layers[i].id == id) {
				return config.layers[i];
			}
		}
		alertify.error("Error: can not find layer with id:" + id);
		return null;
	}

	/**
	 * removes layer
	 *
	 * @param {int} id
	 * @param {boolean} force - Force to delete first layer?
	 */
	async delete(id, force) {
		return app.State.do_action(new app.Actions.Delete_layer_action(id, force));
	}

	/*
	 * removes all layers
	 */
	async reset_layers(auto_insert) {
		return app.State.do_action(
			new app.Actions.Reset_layers_action(auto_insert)
		);
	}

	/**
	 * toggle layer visibility
	 *
	 * @param {int} id
	 */
	async toggle_visibility(id) {
		return app.State.do_action(
			new app.Actions.Toggle_layer_visibility_action(id)
		);
	}

	/*
	 * renew layers HTML
	 */
	refresh_gui() {
		this.Base_gui.GUI_layers.render_layers();
	}

	/**
	 * marks layer as selected, active
	 *
	 * @param {int} id
	 */
	async select(id) {
		return app.State.do_action(new app.Actions.Select_layer_action(id));
	}

	/**
	 * change layer opacity
	 *
	 * @param {int} id
	 * @param {int} value 0-100
	 */
	async set_opacity(id, value) {
		value = parseInt(value);
		if (value < 0 || value > 100) {
			//reset
			value = 100;
		}
		return app.State.do_action(
			new app.Actions.Update_layer_action(id, {
				opacity: value,
			})
		);
	}

	/**
	 * clear layer data
	 *
	 * @param {int} id
	 */
	async layer_clear(id) {
		return app.State.do_action(new app.Actions.Clear_layer_action(id));
	}

	/**
	 * move layer up or down
	 *
	 * @param {int} id
	 * @param {int} direction
	 */
	async move(id, direction) {
		return app.State.do_action(
			new app.Actions.Reorder_layer_action(id, direction)
		);
	}

	/**
	 * clone and sort.
	 */
	get_sorted_layers() {
		return config.layers.concat().sort(
			//sort function
			(a, b) => b.order - a.order
		);
	}

	/**
	 * checks if layer empty
	 *
	 * @param {int} id
	 * @returns {Boolean}
	 */
	is_layer_empty(id) {
		var link = this.get_layer(id);

		if (
			(link.width == 0 || link.width === null) &&
			(link.height == 0 || link.height === null) &&
			link.data == null
		) {
			return true;
		}

		return false;
	}

	/**
	 * find next layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_next(id) {
		id = parseInt(id);
		var link = this.get_layer(id);
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i = layers_sorted.length - 1; i >= 0; i--) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * find previous layer
	 *
	 * @param {int} id layer id
	 * @returns {layer|null}
	 */
	find_previous(id) {
		id = parseInt(id);
		var link = this.get_layer(id);
		var layers_sorted = this.get_sorted_layers();

		var last = null;
		for (var i in layers_sorted) {
			var value = layers_sorted[i];

			if (last != null && last.id == link.id) {
				return value;
			}
			last = value;
		}

		return null;
	}

	/**
	 * returns global position, for example if canvas is zoomed, it will convert relative mouse position to absolute
	 * at 100% zoom.
	 *
	 * @param {int} x
	 * @param {int} y
	 * @returns {object} keys: x, y
	 */
	get_world_coords(x, y) {
		return zoomView.toWorld(x, y);
	}

	/**
	 * register new live filter
	 *
	 * @param {int} layer_id
	 * @param {string} name
	 * @param {object} params
	 */
	add_filter(layer_id, name, params) {
		return app.State.do_action(
			new app.Actions.Add_layer_filter_action(layer_id, name, params)
		);
	}

	/**
	 * delete live filter
	 *
	 * @param {int} layer_id
	 * @param {string} filter_id
	 */
	delete_filter(layer_id, filter_id) {
		return app.State.do_action(
			new app.Actions.Delete_layer_filter_action(layer_id, filter_id)
		);
	}

	/**
	 * exports all layers to canvas for saving
	 *
	 * @param {canvas.context} ctx
	 * @param {int} layer_id Optional
	 * @param {boolean} is_preview Optional
	 */
	convert_layers_to_canvas(ctx, layer_id = null, is_preview = true) {
		const newCanvas = this.create_new_canvas(ctx);
		const layers_sorted = this.get_sorted_layers();
		this.render_objects(ctx, newCanvas, layers_sorted, ()=>{
			ctx.save();
		}, (value) => {
			if (value.visible == false || value.type == null) {
				return true;
			}
			if (layer_id != null && value.id != layer_id) {
				return true;
			}
		});
	}
	/**
	 * exports (active) layer to canvas for saving
	 *
	 * @param {int} layer_id or current layer by default
	 * @param {boolean} actual_area used for resized image. Default is false.
	 * @param {boolean} can_trim default is true
	 * @returns {canvas}
	 */
	convert_layer_to_canvas(layer_id, actual_area = false, can_trim) {
		if (actual_area == null) actual_area = false;
		if (layer_id == null) layer_id = config.layer.id;
		var link = this.get_layer(layer_id);
		var offset_x = 0;
		var offset_y = 0;

		//create tmp canvas
		var canvas = document.createElement("canvas");
		if (actual_area === true && link.type == "image") {
			canvas.width = link.width_original;
			canvas.height = link.height_original;
			can_trim = false;
		} else {
			canvas.width = Math.max(link.width, config.WIDTH);
			canvas.height = Math.max(link.height, config.HEIGHT);
		}

		//add data
		if (actual_area === true && link.type == "image") {
			canvas.getContext("2d").drawImage(link.link, 0, 0);
		} else {
			this.render_object(canvas.getContext("2d"), link);
		}

		//trim
		if ((can_trim == true || can_trim == undefined) && link.type != null) {
			var trim_info = this.Image_trim.get_trim_info(layer_id);
			if (
				trim_info.left > 0 ||
				trim_info.top > 0 ||
				trim_info.right > 0 ||
				trim_info.bottom > 0
			) {
				offset_x = trim_info.left;
				offset_y = trim_info.top;

				var w = canvas.width - trim_info.left - trim_info.right;
				var h = canvas.height - trim_info.top - trim_info.bottom;
				if (w > 1 && h > 1) {
					this.Helper.change_canvas_size(canvas, w, h, offset_x, offset_y);
				}
			}
		}

		canvas.dataset.x = offset_x;
		canvas.dataset.y = offset_y;

		return canvas;
	}

	/**
	 * updates layer image data
	 *
	 * @param {canvas} canvas
	 * @param {int} layer_id (optional)
	 */
	update_layer_image(canvas, layer_id) {
		return app.State.do_action(
			new app.Actions.Update_layer_image_action(canvas, layer_id)
		);
	}

	/**
	 * returns canvas dimensions.
	 *
	 * @returns {object}
	 */
	get_dimensions() {
		return {
			width: config.WIDTH,
			height: config.HEIGHT,
		};
	}

	/**
	 * returns all layers
	 *
	 * @returns {array}
	 */
	get_layers() {
		return config.layers;
	}

	/**
	 * disabled filter by id
	 *
	 * @param filter_id
	 */
	disable_filter(filter_id) {
		this.disabled_filter_id = filter_id;
	}

	/**
	 * finds layer filter by filter ID
	 *
	 * @param filter_id
	 * @param filter_name
	 * @param layer_id
	 * @returns {object}
	 */
	find_filter_by_id(filter_id, filter_name, layer_id) {
		if (typeof layer_id == "undefined") {
			var layer = config.layer;
		} else {
			var layer = this.get_layer(layer_id);
		}

		var filter = {};
		for (var i in layer.filters) {
			if (
				layer.filters[i].name == filter_name &&
				layer.filters[i].id == filter_id
			) {
				return layer.filters[i].params;
			}
		}

		return filter;
	}

	// ---- Renderer management ----

	/**
	 * Switch the active renderer.
	 *
	 * @param {'canvas2d'|'webgl'} mode
	 */
	switchRenderer(mode) {
		var renderer = switch_renderer(mode, config.WIDTH, config.HEIGHT);
		this.active_renderer = renderer;

		// Re-initialize zoom library with the new renderer's context
		if (renderer.type === 'canvas2d') {
			zoomView.setContext(this.ctx);
		}
		// For WebGL, zoom is handled in the shader; the main canvas context stays the same

		config.need_render = true;
	}

	/**
	 * Returns the type of the currently active renderer.
	 * @returns {'canvas2d'|'webgl'}
	 */
	get_renderer_type() {
		var renderer = get_renderer();
		return renderer ? renderer.type : 'canvas2d';
	}

	/**
	 * Notify the renderer that a layer's pixel data has changed.
	 * The renderer should invalidate any cached GPU texture for that layer.
	 *
	 * @param {number} layerId
	 */
	notify_layer_data_changed(layerId) {
		this.invalidate({ document: true, preview: true, details: true });
		var renderer = get_renderer();
		if (renderer && renderer.on_layer_data_changed) {
			renderer.on_layer_data_changed(layerId);
		}
	}

	/**
	 * Notify the renderer that a layer's mask has changed.
	 *
	 * @param {number} layerId
	 */
	notify_mask_changed(layerId) {
		var layer = layerId != null ? this.get_layer(layerId) : config.layer;
		if (layer && layer.mask) {
			delete layer.mask._alpha_canvas;
			delete layer.mask._alpha_source;
		}
		if (this.Composite_cache) {
			this.Composite_cache.invalidate_document();
		}
		var renderer = get_renderer();
		if (renderer && renderer.on_mask_changed) {
			renderer.on_mask_changed(layerId);
		}
		config.need_render = true;
	}
}

export default Base_layers_class;
