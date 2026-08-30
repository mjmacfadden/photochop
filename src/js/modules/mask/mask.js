import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

/**
 * Layer masks - a non destructive grayscale mask attached to a layer.
 *
 * Mask object is stored as `layer.mask`:
 * - link (canvas)  - grayscale bitmap of the mask. White reveals, black hides.
 * - x, y           - world position of the mask anchor (top-left corner)
 * - width, height  - placement size of the mask in world coordinates
 * - enabled (bool)   - when false the mask is ignored while rendering
 * - linked (bool)    - when true the mask follows the layer while moving/resizing
 *
 * The mask bitmap is sampled each render, scaled from the mask bitmap
 * (link.width x link.height) onto the placement rect (width x height).
 * The mask alpha is multiplied with the layer's own alpha (per pixel).
 */
class Mask_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Helper = new Helper_class();
		//active paint stroke (brush/pencil/erase on mask)
		this.stroke = null;
		//active gradient start point
		this.gradient_start = null;
	}

	/**
	 * checks if current editing target is the layer mask
	 */
	is_active() {
		return config.mask_active === true && config.layer != null && config.layer.mask != null;
	}

	/**
	 * sets the active editing target. Returns the new state.
	 */
	set_active(value) {
		if (value === true && (config.layer == null || config.layer.mask == null)) {
			config.mask_active = false;
		}
		else {
			config.mask_active = value === true;
			if (config.mask_active === true) {
				//default to black foreground / white background while painting a mask
				this.default_mask_colors();
			}
		}
		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
		return config.mask_active;
	}

	/**
	 * resets the painting colors to black foreground / white background,
	 * which is the sensible default while editing a mask.
	 */
	default_mask_colors() {
		config.COLOR = '#000000';
		config.ALPHA = 255;
		config.COLOR_BG = '#ffffff';
		config.ALPHA_BG = 255;
		this.Helper.setCookie('color', config.COLOR);
		this.Helper.setCookie('color_bg', config.COLOR_BG);
		if (typeof app.GUI != 'undefined') {
			if (app.GUI.GUI_colors && typeof app.GUI.GUI_colors.render_selected_color == 'function') {
				app.GUI.GUI_colors.render_selected_color();
			}
			if (app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_toolbar_swatches == 'function') {
				app.GUI.GUI_tools.update_toolbar_swatches();
			}
		}
	}

	/**
	 * returns the mask bitmap canvas currently used for rendering
	 */
	get_mask_source(layer) {
		if (layer == null || layer.mask == null)
			return null;
		return layer.mask.link_canvas || layer.mask.link;
	}

	/**
	 * returns a copy of the given mask bitmap canvas.
	 * Note: canvas.cloneNode(true) does NOT copy the bitmap pixels.
	 */
	copy_mask_canvas(source) {
		var canvas = document.createElement('canvas');
		canvas.width = source.width;
		canvas.height = source.height;
		canvas.getContext('2d').drawImage(source, 0, 0);
		return canvas;
	}

	/**
	 * asks the compositor to rebuild the document so a mask edit is visible.
	 * Viewport-only frames (marching ants, pan/zoom) must not swallow this.
	 */
	request_mask_render(layer) {
		if (app.Layers != null && typeof app.Layers.notify_mask_changed == 'function') {
			app.Layers.notify_mask_changed(layer && layer.id);
		}
		else {
			config.need_render = true;
		}
	}

	_get_scratch_canvas(width, height) {
		if (this._scratch_canvas == null) {
			this._scratch_canvas = document.createElement('canvas');
		}
		if (this._scratch_canvas.width != width || this._scratch_canvas.height != height) {
			this._scratch_canvas.width = width;
			this._scratch_canvas.height = height;
		}
		else {
			var sctx = this._scratch_canvas.getContext('2d');
			sctx.setTransform(1, 0, 0, 1, 0, 0);
			sctx.clearRect(0, 0, width, height);
		}
		return this._scratch_canvas;
	}

	/**
	 * converts a grayscale mask bitmap (white reveals, black hides) into an
	 * alpha canvas for destination-in compositing. Cached until the source
	 * canvas identity changes; live strokes use link_canvas and rebuild.
	 */
	get_mask_alpha_canvas(layer) {
		var source = this.get_mask_source(layer);
		if (source == null || typeof source.getContext != 'function')
			return null;
		var sw = source.width;
		var sh = source.height;
		if (!sw || !sh)
			return null;

		var mask = layer.mask;
		var cw = sw + 2;
		var ch = sh + 2;
		if (mask.link_canvas == null && mask._alpha_canvas != null && mask._alpha_source === source
			&& mask._alpha_canvas.width === cw && mask._alpha_canvas.height === ch) {
			return mask._alpha_canvas;
		}

		var canvas = (mask._alpha_canvas && mask._alpha_canvas.width === cw
			&& mask._alpha_canvas.height === ch)
			? mask._alpha_canvas
			: document.createElement('canvas');
		canvas.width = cw;
		canvas.height = ch;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.clearRect(0, 0, cw, ch);

		// Draw source at (1, 1) and replicate 1px edges to prevent bilinear edge bleeding/clipping
		ctx.drawImage(source, 1, 1);
		ctx.drawImage(source, 0, 0, sw, 1, 1, 0, sw, 1); // top edge
		ctx.drawImage(source, 0, sh - 1, sw, 1, 1, sh + 1, sw, 1); // bottom edge
		ctx.drawImage(canvas, 1, 0, 1, ch, 0, 0, 1, ch); // left column
		ctx.drawImage(canvas, sw, 0, 1, ch, sw + 1, 0, 1, ch); // right column

		var imageData = ctx.getImageData(0, 0, cw, ch);
		var data = imageData.data;
		for (var i = 0; i < data.length; i += 4) {
			var value = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
			data[i] = 255;
			data[i + 1] = 255;
			data[i + 2] = 255;
			data[i + 3] = value;
		}
		ctx.putImageData(imageData, 0, 0);
		mask._alpha_canvas = canvas;
		mask._alpha_source = source;
		return canvas;
	}

	/**
	 * returns a fresh full layer sized mask object
	 *
	 * @param {object} layer
	 * @param {Boolean} reveal true reveals (white), false hides (black)
	 * @returns {object}
	 */
	create_mask(layer, reveal) {
		var lw = (layer.width != null && layer.width > 0) ? layer.width : ((layer.link && layer.link.width) || (layer.link_canvas && layer.link_canvas.width) || layer.width_original || config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : ((layer.link && layer.link.height) || (layer.link_canvas && layer.link_canvas.height) || layer.height_original || config.HEIGHT || 1);
		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;

		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(lw));
		canvas.height = Math.max(1, Math.round(lh));
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = (reveal === false) ? '#000000' : '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		return {
			link: canvas,
			x: lx,
			y: ly,
			width: canvas.width,
			height: canvas.height,
			enabled: true,
			linked: true,
		};
	}

	/**
	 * returns a mask object created from the active rectangular selection.
	 *
	 * @param {object} layer
	 * @param {Boolean} reveal true reveals the selected area, false hides it
	 * @returns {object}
	 */
	create_mask_from_selection(layer, reveal) {
		var mask = this.create_mask(layer, reveal);
		var ctx = mask.link.getContext('2d');

		if (reveal !== false) {
			//reveal selection - black all around, white inside selection
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, mask.link.width, mask.link.height);
		}
		else {
			//hide selection - white all around, black inside selection
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, mask.link.width, mask.link.height);
		}

		var selection = null;
		if (typeof app.GUI.GUI_tools.tools_modules['selection'] != 'undefined') {
			selection = app.GUI.GUI_tools.tools_modules['selection'].object.selection;
		}
		if (selection == null || selection.width == null || selection.height == null) {
			return mask;
		}

		var shape = selection.shape || 'rect';
		var selection_module = app.GUI.GUI_tools.tools_modules['selection'].object;
		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;

		ctx.save();
		ctx.translate(-lx, -ly);
		ctx.beginPath();
		selection_module.build_selection_path(ctx, selection);
		ctx.fillStyle = (reveal === false) ? '#000000' : '#ffffff';
		ctx.fill();
		ctx.restore();

		return mask;
	}

	/**
	 * returns the luminance of the mask at the given world coordinates.
	 * Returns 255 when there is nothing to apply (no change).
	 */
	mask_value_at(layer, wx, wy, cache) {
		var mask = layer.mask;
		if (mask == null || mask.enabled === false)
			return 255;

		if (cache == null) {
			cache = this._prepare_mask_cache(layer);
		}
		if (cache == null)
			return 255;

		var mx = Math.floor((wx - mask.x) * cache.sx);
		var my = Math.floor((wy - mask.y) * cache.sy);
		if (mx < 0 || my < 0 || mx >= cache.sw || my >= cache.sh) {
			return 255;
		}

		var index = (my * cache.sw + mx) * 4;
		return cache.data[index] * 0.2126 + cache.data[index + 1] * 0.7152 + cache.data[index + 2] * 0.0722;
	}

	/**
	 * prepares cached mask data used for pixel sampling
	 */
	_prepare_mask_cache(layer) {
		var source = this.get_mask_source(layer);
		if (source == null || typeof source.getContext != 'function')
			return null;

		var sw = source.width;
		var sh = source.height;
		if (!sw || !sh)
			return null;

		var pw = Math.max(1, Math.round(layer.mask.width || 1));
		var ph = Math.max(1, Math.round(layer.mask.height || 1));

		return {
			sw: sw,
			sh: sh,
			sx: sw / pw,
			sy: sh / ph,
			data: source.getContext('2d').getImageData(0, 0, sw, sh).data,
		};
	}

	/**
	 * multiplies the alpha channel of the given context content (world coordinates)
	 * by the layer mask, for the layer's rendered pixels.
	 * The context transform (zoom / pan) is taken into account.
	 *
	 * White reveals, black hides. Pixels that fall outside the mask placement
	 * rect are hidden, matching Photoshop.
	 *
	 * @param {context} ctx content drawn in world coordinates
	 * @param {object} layer
	 */
	multiply_alpha_by_mask_world(ctx, layer) {
		var mask = layer.mask;
		if (mask == null || mask.enabled === false)
			return;

		var alpha = this.get_mask_alpha_canvas(layer);
		if (alpha == null)
			return;

		var source = this.get_mask_source(layer);
		var sw = source ? source.width : (alpha.width - 2);
		var sh = source ? source.height : (alpha.height - 2);

		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var lw = (layer.width != null && layer.width > 0) ? layer.width : sw;
		var lh = (layer.height != null && layer.height > 0) ? layer.height : sh;
		var rotate = layer.rotate || 0;
		var rad = rotate * Math.PI / 180;
		var mx = (mask.x != null) ? mask.x : lx;
		var my = (mask.y != null) ? mask.y : ly;
		var mw = (mask.width != null && mask.width > 0) ? mask.width : lw;
		var mh = (mask.height != null && mask.height > 0) ? mask.height : lh;

		var t = null;
		if (typeof ctx.getTransform == 'function')
			t = ctx.getTransform();
		var a = t ? t.a : 1, b = t ? t.b : 0, c = t ? t.c : 0, d = t ? t.d : 1, e = t ? t.e : 0, f = t ? t.f : 0;

		// Full-buffer cover so destination-in hides pixels outside the mask
		// rect instead of leaving them fully visible.
		var cover = this._get_scratch_canvas(ctx.canvas.width, ctx.canvas.height);
		var cctx = cover.getContext('2d');
		cctx.setTransform(a, b, c, d, e, f);
		cctx.imageSmoothingEnabled = (mw !== sw || mh !== sh || rad !== 0);

		if (rad !== 0 && mask.linked !== false) {
			cctx.translate(lx + lw / 2, ly + lh / 2);
			cctx.rotate(rad);
			cctx.translate(-lw / 2, -lh / 2);
			cctx.drawImage(alpha, 1, 1, sw, sh, mx - lx, my - ly, mw, mh);
		}
		else {
			cctx.drawImage(alpha, 1, 1, sw, sh, mx, my, mw, mh);
		}

		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(cover, 0, 0);
		ctx.restore();
	}

	/**
	 * multiplies the alpha channel of a layer-local canvas (layer.width x layer.height)
	 * by the layer mask. Used by the "apply mask" operation.
	 *
	 * @param {context} ctx layer sized canvas context (local coordinates)
	 * @param {object} layer
	 */
	multiply_alpha_by_mask_local(ctx, layer) {
		var mask = layer.mask;
		if (mask == null || mask.enabled === false)
			return;

		var alpha = this.get_mask_alpha_canvas(layer);
		if (alpha == null)
			return;

		var source = this.get_mask_source(layer);
		var sw = source ? source.width : (alpha.width - 2);
		var sh = source ? source.height : (alpha.height - 2);

		var width = ctx.canvas.width;
		var height = ctx.canvas.height;
		var layer_x = (layer.x != null) ? layer.x : 0;
		var layer_y = (layer.y != null) ? layer.y : 0;
		var mx = (mask.x != null) ? mask.x : layer_x;
		var my = (mask.y != null) ? mask.y : layer_y;
		var mw = (mask.width != null && mask.width > 0) ? mask.width : width;
		var mh = (mask.height != null && mask.height > 0) ? mask.height : height;

		var cover = this._get_scratch_canvas(width, height);
		var cctx = cover.getContext('2d');
		cctx.imageSmoothingEnabled = (mw !== sw || mh !== sh);
		cctx.drawImage(alpha, 1, 1, sw, sh, mx - layer_x, my - layer_y, mw, mh);

		ctx.save();
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(cover, 0, 0);
		ctx.restore();
	}

	/**
	 * returns mask actions to add to a layer transform bundle, which keep a
	 * linked mask synchronized with the layer.
	 *
	 * @param {object} layer
	 * @param {object} old_props {x, y, width, height}
	 * @param {object} new_props {x, y, width, height}
	 * @returns {array}
	 */
	get_linked_mask_actions(layer, old_props, new_props) {
		var actions = [];
		if (layer == null || layer.mask == null || layer.mask.linked !== true)
			return actions;

		var new_settings = this.get_linked_mask_settings(layer, old_props, new_props);
		if (new_settings != null) {
			actions.push(new app.Actions.Update_layer_mask_action(layer.id, new_settings));
		}

		return actions;
	}

	get_linked_mask_settings(layer, old_props, new_props) {
		if (layer == null || layer.mask == null || layer.mask.linked !== true)
			return null;

		var mask = (old_props && old_props.mask) ? old_props.mask : layer.mask;
		var old_x = (old_props && old_props.x != null) ? old_props.x : (layer.x || 0);
		var old_y = (old_props && old_props.y != null) ? old_props.y : (layer.y || 0);
		var old_w = (old_props && old_props.width != null) ? old_props.width : (layer.width || 0);
		var old_h = (old_props && old_props.height != null) ? old_props.height : (layer.height || 0);

		var new_x = (new_props && new_props.x != null) ? new_props.x : old_x;
		var new_y = (new_props && new_props.y != null) ? new_props.y : old_y;
		var new_w = (new_props && new_props.width != null) ? new_props.width : old_w;
		var new_h = (new_props && new_props.height != null) ? new_props.height : old_h;

		var x_changed = new_x !== old_x || new_y !== old_y;
		var size_changed = (old_w > 0 && new_w > 0 && new_w !== old_w) || (old_h > 0 && new_h > 0 && new_h !== old_h);
		if (!x_changed && !size_changed)
			return null;

		var xr = (old_w > 0 && new_w > 0) ? new_w / old_w : 1;
		var yr = (old_h > 0 && new_h > 0) ? new_h / old_h : 1;

		var new_settings = {
			x: Math.round(new_x + (mask.x - old_x) * xr),
			y: Math.round(new_y + (mask.y - old_y) * yr),
			width: Math.max(1, Math.round(mask.width * xr)),
			height: Math.max(1, Math.round(mask.height * yr)),
		};
		if (!size_changed) {
			new_settings.width = mask.width;
			new_settings.height = mask.height;
		}
		return new_settings;
	}

	preview_linked_mask_transform(layer, old_props, new_props) {
		var settings = this.get_linked_mask_settings(layer, old_props, new_props);
		if (settings != null) {
			Object.assign(layer.mask, settings);
			delete layer.mask._alpha_canvas;
			delete layer.mask._alpha_source;
		}
	}

	/**
	 * adds a new layer mask (undoable)
	 *
	 * @param {int} layer_id
	 * @param {Boolean} reveal true = reveal all, false = hide all
	 * @param {Boolean} use_selection create mask from current selection
	 */
	async add_mask(layer_id, reveal, use_selection) {
		if (layer_id == null)
			layer_id = config.layer.id;
		return app.State.do_action(
			new app.Actions.Add_layer_mask_action(layer_id, reveal, use_selection)
		);
	}

	/**
	 * removes the layer mask (undoable)
	 */
	async delete_mask(layer_id) {
		if (layer_id == null)
			layer_id = config.layer.id;
		return app.State.do_action(
			new app.Actions.Delete_layer_mask_action(layer_id)
		);
	}

	/**
	 * toggles mask enabled state (undoable)
	 */
	async toggle_enabled(layer_id) {
		if (layer_id == null)
			layer_id = config.layer.id;
		var layer = app.Layers.get_layer(layer_id);
		if (layer == null || layer.mask == null)
			return;
		return app.State.do_action(
			new app.Actions.Update_layer_mask_action(layer_id, {
				enabled: layer.mask.enabled === false,
			})
		);
	}

	/**
	 * bakes the mask into the layer and removes the mask (undoable).
	 * Raster layers are baked in place, other layer types are rasterized.
	 */
	async apply_mask(layer_id) {
		if (layer_id == null)
			layer_id = config.layer.id;
		var layer = app.Layers.get_layer(layer_id);
		if (layer == null || layer.mask == null)
			return;
		if (layer.mask.enabled === false) {
			alertify.error('Mask is disabled.');
			return;
		}

		config.mask_active = false;

		if (layer.type != 'image') {
			//vector/text/brush layers - rasterize through the renderer
			//(render_object bakes the mask) and swap the layer for the result
			var canvas = app.Layers.convert_layer_to_canvas(layer_id);
			var params = {
				type: 'image',
				name: layer.name,
				data: canvas.toDataURL('image/png'),
				x: parseInt(canvas.dataset.x),
				y: parseInt(canvas.dataset.y),
				width: canvas.width,
				height: canvas.height,
				opacity: layer.opacity,
			};
			return app.State.do_action(
				new app.Actions.Bundle_action('apply_layer_mask', 'Apply Layer Mask', [
					new app.Actions.Insert_layer_action(params, false),
					new app.Actions.Delete_layer_action(layer_id),
				])
			);
		}

		//image layer - bake the mask directly into the layer's local frame
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(layer.width || 1));
		canvas.height = Math.max(1, Math.round(layer.height || 1));
		var ctx = canvas.getContext('2d');
		ctx.drawImage(layer.link, 0, 0, canvas.width, canvas.height);

		this.multiply_alpha_by_mask_local(ctx, layer);

		return app.State.do_action(
			new app.Actions.Bundle_action('apply_layer_mask', 'Apply Layer Mask', [
				new app.Actions.Update_layer_image_action(canvas, layer_id),
				new app.Actions.Delete_layer_mask_action(layer_id),
			])
		);
	}

	/**
	 * turns the selection into a mask (undoable)
	 *
	 * @param {Boolean} reveal true converts selection to a mask, false = mask from inverse
	 */
	async mask_from_selection(reveal) {
		var layer = config.layer;
		return app.State.do_action(
			new app.Actions.Bundle_action('mask_from_selection', 'Convert Selection to Mask', [
				new app.Actions.Add_layer_mask_action(layer.id, reveal, true),
			])
		);
	}

	/**
	 * fills the whole mask with white (reveal all) or black (hide all)
	 */
	async fill_mask(layer_id, value) {
		if (layer_id == null)
			layer_id = config.layer.id;
		var layer = app.Layers.get_layer(layer_id);
		if (layer == null || layer.mask == null)
			return;

		var source = this.get_mask_source(layer);
		if (source == null)
			return;

		var canvas = this.copy_mask_canvas(source);
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = (value === false) ? '#000000' : '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		return app.State.do_action(
			new app.Actions.Bundle_action('fill_mask_all', 'Fill Mask', [
				new app.Actions.Update_layer_mask_image_action(canvas, layer_id),
			])
		);
	}

	/**
	 * reveals or hides the current selection area inside the mask.
	 * If the layer has no mask yet, a new mask is created from the selection.
	 */
	async fill_mask_from_selection(layer_id, reveal) {
		if (layer_id == null)
			layer_id = config.layer.id;
		var layer = app.Layers.get_layer(layer_id);
		if (layer == null)
			return;

		if (layer.mask == null) {
			return app.State.do_action(
				new app.Actions.Add_layer_mask_action(layer_id, reveal, true)
			);
		}

		var source = this.get_mask_source(layer);
		if (source == null)
			return;

		var selection = null;
		if (typeof app.GUI.GUI_tools.tools_modules['selection'] != 'undefined') {
			selection = app.GUI.GUI_tools.tools_modules['selection'].object.selection;
		}
		if (selection == null || selection.width == null || selection.height == null) {
			alertify.error('No active selection.');
			return;
		}

		var canvas = this.copy_mask_canvas(source);
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = (reveal === false) ? '#000000' : '#ffffff';

		var x1 = this.world_to_mask(layer, selection.x, selection.y);
		var x2 = this.world_to_mask(layer, selection.x + selection.width, selection.y + selection.height);
		var left = Math.max(0, Math.floor(Math.min(x1.x, x2.x)));
		var top = Math.max(0, Math.floor(Math.min(x1.y, x2.y)));
		var width = Math.min(canvas.width, Math.ceil(Math.max(x1.x, x2.x))) - left;
		var height = Math.min(canvas.height, Math.ceil(Math.max(x1.y, x2.y))) - top;
		if (width > 0 && height > 0) {
			ctx.fillRect(left, top, width, height);
		}

		return app.State.do_action(
			new app.Actions.Bundle_action('fill_mask_selection', 'Fill Mask from Selection', [
				new app.Actions.Update_layer_mask_image_action(canvas, layer_id),
			])
		);
	}

	/**
	 * returns a small thumbnail data url of the layer mask (for the layers panel)
	 */
	get_mask_thumb(layer, size) {
		size = size || 12;
		var source = this.get_mask_source(layer);
		if (source == null)
			return '';
		var canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		canvas.getContext('2d').drawImage(source, 0, 0, size, size);
		return canvas.toDataURL();
	}

	// -------------------------------------------------------------------------
	// painting tools on masks
	// -------------------------------------------------------------------------

	/**
	 * converts a world mouse point into mask bitmap (native) coordinates
	 */
	world_to_mask(layer, x, y) {
		var source = this.get_mask_source(layer);
		var mw = Math.max(1, Math.round(layer.mask.width || 1));
		var mh = Math.max(1, Math.round(layer.mask.height || 1));
		var sw = source ? source.width : mw;
		var sh = source ? source.height : mh;

		var px = x;
		var py = y;
		if (layer.rotate && layer.mask.linked !== false) {
			var rad = -layer.rotate * Math.PI / 180;
			var cx = (layer.x || 0) + (layer.width || 0) / 2;
			var cy = (layer.y || 0) + (layer.height || 0) / 2;
			var cos = Math.cos(rad);
			var sin = Math.sin(rad);
			px = cx + (x - cx) * cos - (y - cy) * sin;
			py = cy + (x - cx) * sin + (y - cy) * cos;
		}

		return {
			x: (px - (layer.mask.x || 0)) * sw / mw,
			y: (py - (layer.mask.y || 0)) * sh / mh,
		};
	}

	/**
	 * starts a paint stroke on the mask (brush / pencil / erase)
	 *
	 * @param {object} tool tool instance
	 * @param {object} e event
	 * @param {int|string} color paint color (grayscale)
	 */
	start_paint(tool, e, color, options) {
		var mouse = tool.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var layer = config.layer;
		var source = this.get_mask_source(layer);
		if (source == null) {
			alertify.error('This layer does not have a mask.');
			return;
		}

		var canvas = this.copy_mask_canvas(source);
		var ctx = canvas.getContext('2d');

		var point = this.world_to_mask(layer, mouse.x, mouse.y);
		var mw = Math.max(1, Math.round(layer.mask.width || 1));
		var sw = source ? source.width : mw;
		var size = (options.size || 1) * (sw / mw);
		var circle = options.circle !== false;
		var alpha = (options.alpha != null) ? options.alpha : 255;

		this.stroke = {
			canvas: canvas,
			ctx: ctx,
			color: color,
			alpha: alpha,
			size: size,
			circle: circle,
			strict: options.strict === true,
			hardness: (options.hardness != null) ? options.hardness : 100,
			last_x: null,
			last_y: null,
			painted: false,
		};

		layer.mask.link_canvas = canvas;
		this.paint_point(tool, e, true);
		this.request_mask_render(layer);
	}

	/**
	 * continues an active paint stroke on the mask
	 */
	move_paint(tool, e) {
		if (this.stroke == null)
			return;

		var mouse = tool.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false)
			return;

		var layer = config.layer;
		var point = this.world_to_mask(layer, mouse.x, mouse.y);
		var last = this.stroke.last_x != null;

		this.stroke.ctx.save();

		if (this.stroke.circle === true && this.stroke.hardness < 100) {
			//soft (feathered) mask brush - stamp overlapping soft circles
			if (last) {
				this.paint_mask_line(
					this.stroke.ctx,
					this.stroke.last_x, this.stroke.last_y,
					point.x, point.y,
					this.stroke.size, this.stroke.hardness, this.stroke.color, this.stroke.alpha
				);
			}
			else {
				this.paint_mask_dot(
					this.stroke.ctx,
					point.x, point.y,
					this.stroke.size, this.stroke.hardness, this.stroke.color, this.stroke.alpha, true
				);
			}
		}
		else if (this.stroke.circle === true) {
			//circle brush
			var size_half = Math.floor(this.stroke.size / 2);
			this.stroke.ctx.beginPath();
			this.stroke.ctx.arc(point.x, point.y, size_half, 0, Math.PI * 2, true);
			this.stroke.ctx.fillStyle = 'rgba(' + this.stroke.color + ', ' + this.stroke.alpha / 255 + ')';
			this.stroke.ctx.fill();
		}
		else {
			//square / pencil
			var size = Math.max(1, Math.round(this.stroke.size));
			var size_half = Math.ceil(size / 2);
			this.stroke.ctx.fillStyle = 'rgba(' + this.stroke.color + ', ' + this.stroke.alpha / 255 + ')';
			this.stroke.ctx.fillRect(point.x - size_half, point.y - size_half, size, size);
		}

		if (last && !(this.stroke.circle === true && this.stroke.hardness < 100)) {
			//draw connecting line to prevent gaps
			this.stroke.ctx.globalCompositeOperation = 'source-over';
			this.stroke.ctx.beginPath();
			this.stroke.ctx.moveTo(this.stroke.last_x, this.stroke.last_y);
			this.stroke.ctx.lineTo(point.x, point.y);
			this.stroke.ctx.strokeStyle = 'rgba(' + this.stroke.color + ', ' + this.stroke.alpha / 255 + ')';
			this.stroke.ctx.lineWidth = this.stroke.size;
			this.stroke.ctx.lineCap = 'round';
			this.stroke.ctx.stroke();
		}

		this.stroke.ctx.restore();

		this.stroke.last_x = point.x;
		this.stroke.last_y = point.y;
		this.stroke.painted = true;
		this.request_mask_render(config.layer);
	}

	paint_point(tool, e, first) {
		var mouse = tool.get_mouse_info(e);
		var layer = config.layer;
		var point = this.world_to_mask(layer, mouse.x, mouse.y);

		this.stroke.ctx.save();
		if (this.stroke.circle === true && this.stroke.hardness < 100) {
			//soft (feathered) mask brush - full-amplitude kernel for a dotted stroke
			this.paint_mask_dot(
				this.stroke.ctx,
				point.x, point.y,
				this.stroke.size, this.stroke.hardness, this.stroke.color, this.stroke.alpha, true
			);
		}
		else if (this.stroke.circle === true) {
			this.stroke.ctx.beginPath();
			this.stroke.ctx.arc(point.x, point.y, Math.floor(this.stroke.size / 2), 0, Math.PI * 2, true);
			this.stroke.ctx.fillStyle = 'rgba(' + this.stroke.color + ', ' + this.stroke.alpha / 255 + ')';
			this.stroke.ctx.fill();
		}
		else {
			var size = Math.max(1, Math.round(this.stroke.size));
			var size_half = Math.ceil(size / 2);
			this.stroke.ctx.fillStyle = 'rgba(' + this.stroke.color + ', ' + this.stroke.alpha / 255 + ')';
			this.stroke.ctx.fillRect(point.x - size_half, point.y - size_half, size, size);
		}
		this.stroke.ctx.restore();

		this.stroke.last_x = point.x;
		this.stroke.last_y = point.y;
		this.stroke.painted = true;
		this.request_mask_render(config.layer);
	}

	/**
	 * builds a radial-gradient stamp used to paint soft mask edges.
	 * A straight stroke is sampled every `step` px; amplitudes are
	 * normalized so the overlap reproduces the stamped kernel.
	 */
	build_soft_stamp(size, hardness, gray) {
		size = Math.max(1, Math.round(size));
		var r_outer = size / 2;
		var r_inner = r_outer * Math.max(0, Math.min(100, hardness)) / 100;
		var side = size + 2;
		var center = side / 2;

		var canvas = document.createElement('canvas');
		canvas.width = side;
		canvas.height = side;
		var ctx = canvas.getContext('2d');

		var gradient = ctx.createRadialGradient(center, center, r_inner, center, center, r_outer);
		gradient.addColorStop(0, 'rgba(' + gray + ', 1)');
		gradient.addColorStop(1, 'rgba(' + gray + ', 0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, side, side);

		var step = Math.max(1, Math.floor(r_outer / 3));
		var integral = r_outer + r_inner;
		var amp = Math.min(1, step / Math.max(integral, 0.001));

		return {
			canvas: canvas,
			center: center,
			step: step,
			amp: amp,
		};
	}

	get_soft_stamp(size, hardness, gray) {
		size = Math.max(1, Math.round(size));
		hardness = Math.round(hardness);
		var key = size + '_' + hardness + '_' + gray;
		if (this.soft_stamp_cache == null) {
			this.soft_stamp_cache = {};
		}
		if (this.soft_stamp_cache[key] == null) {
			this.soft_stamp_cache[key] = this.build_soft_stamp(size, hardness, gray);
		}
		return this.soft_stamp_cache[key];
	}

	/**
	 * paints a soft dot on the mask.
	 *
	 * @param {object} ctx mask context
	 * @param {int} x
	 * @param {int} y
	 * @param {int} size brush size
	 * @param {int} hardness 0-100
	 * @param {string} gray "r, g, b"
	 * @param {int} alpha 0-255
	 * @param {bool} isolated true for a single dot/start of stroke (full kernel)
	 */
	paint_mask_dot(ctx, x, y, size, hardness, gray, alpha, isolated) {
		var stamp = this.get_soft_stamp(size, hardness, gray);
		var amp = isolated === true ? 1 : stamp.amp;
		ctx.globalAlpha = amp * (alpha / 255);
		ctx.drawImage(stamp.canvas, Math.round(x - stamp.center), Math.round(y - stamp.center));
		ctx.globalAlpha = 1;
	}

	/**
	 * stamps a soft line segment on the mask between two points.
	 */
	paint_mask_line(ctx, x0, y0, x1, y1, size, hardness, gray, alpha) {
		var dx = x1 - x0;
		var dy = y1 - y0;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var stamp = this.get_soft_stamp(size, hardness, gray);
		var step = Math.max(1, stamp.step);
		var count = Math.max(1, Math.ceil(dist / step));

		for (var i = 0; i <= count; i++) {
			var t = i / count;
			this.paint_mask_dot(
				ctx,
				x0 + dx * t,
				y0 + dy * t,
				size,
				hardness,
				gray,
				alpha,
				false
			);
		}
	}

	/**
	 * finishes the paint stroke and commits it to history (undoable).
	 * The layer image is never touched.
	 */
	async end_paint() {
		if (this.stroke == null)
			return;

		var stroke = this.stroke;
		this.stroke = null;

		var layer = config.layer;
		try {
			if (stroke.painted === true) {
				await app.State.do_action(
					new app.Actions.Bundle_action('paint_mask', 'Paint Mask', [
						new app.Actions.Update_layer_mask_image_action(stroke.canvas, layer.id),
					])
				);
			}
		} finally {
			if (layer != null && layer.mask != null) {
				delete layer.mask.link_canvas;
			}
			//decrease memory
			stroke.canvas.width = 1;
			stroke.canvas.height = 1;
			this.request_mask_render(layer);
		}
	}

	/**
	 * paint with the foreground color (gray) - used by brush and pencil
	 */
	brush(tool, e, type) {
		var color = this.Helper.hexToRgb(config.COLOR);
		var gray = Math.round(0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);
		var params = tool.getParams();

		var options = {
			size: params.size || 1,
			circle: params.circle !== false,
			strict: params.strict === true,
			alpha: config.ALPHA,
			hardness: (params.hardness != null) ? params.hardness : 100,
		};

		if (type == 'start')
			this.start_paint(tool, e, gray + ', ' + gray + ', ' + gray, options);
		else if (type == 'move')
			this.move_paint(tool, e);
		else
			this.end_paint();
	}

	/**
	 * erase on a mask (paints black)
	 */
	erase(tool, e, type) {
		var params = tool.getParams();
		var options = {
			size: params.size || 1,
			circle: params.circle !== false,
			strict: params.strict === true,
			alpha: config.ALPHA,
		};

		if (type == 'start')
			this.start_paint(tool, e, '0, 0, 0', options);
		else if (type == 'move')
			this.move_paint(tool, e);
		else
			this.end_paint();
	}

	/**
	 * flood fill into the mask with the foreground color (gray)
	 */
	async fill(tool, e) {
		var mouse = tool.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;
		if (this.working === true)
			return;

		var layer = config.layer;
		var source = this.get_mask_source(layer);
		if (source == null) {
			alertify.error('This layer does not have a mask.');
			return;
		}

		var canvas = this.copy_mask_canvas(source);
		var ctx = canvas.getContext('2d');

		var point = this.world_to_mask(layer, mouse.x, mouse.y);
		var mouse_x = Math.round(point.x);
		var mouse_y = Math.round(point.y);

		var color = this.Helper.hexToRgb(config.COLOR);
		var gray = Math.round(0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);
		var color_to = {
			r: gray,
			g: gray,
			b: gray,
			a: config.ALPHA,
		};

		var params = tool.getParams();
		var fill_tool = app.GUI.GUI_tools.tools_modules['fill'].object;
		this.working = true;
		fill_tool.fill_general(ctx, canvas.width, canvas.height,
			mouse_x, mouse_y, color_to, params.power, params.anti_aliasing, params.contiguous);

		await app.State.do_action(
			new app.Actions.Bundle_action('fill_mask', 'Fill Mask', [
				new app.Actions.Update_layer_mask_image_action(canvas, layer.id),
			])
		);

		await new Promise(r => setTimeout(r, 10));
		this.working = false;
	}

	/**
	 * draws a linear or radial gradient into the mask.
	 * The gradient goes from the foreground color (gray) to transparent.
	 */
	gradient_start(tool, e) {
		var mouse = tool.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;
		this.gradient_start = { x: mouse.x, y: mouse.y };
	}

	async gradient_end(tool, e) {
		if (this.gradient_start == null)
			return;

		var mouse = tool.get_mouse_info(e);
		var start = this.gradient_start;
		this.gradient_start = null;

		var width = mouse.x - start.x;
		var height = mouse.y - start.y;
		if (width == 0 && height == 0) {
			config.need_render = true;
			return;
		}

		var layer = config.layer;
		var source = this.get_mask_source(layer);
		if (source == null) {
			alertify.error('This layer does not have a mask.');
			return;
		}

		var canvas = this.copy_mask_canvas(source);
		var ctx = canvas.getContext('2d');

		var params = tool.getParams();
		var color = this.Helper.hexToRgb(params.color_1);
		var gray = Math.round(0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);

		var start_native = this.world_to_mask(layer, start.x, start.y);
		var end_native = this.world_to_mask(layer, mouse.x, mouse.y);
		var power = params.radial_power != null ? Math.min(99, params.radial_power) : 50;

		if (params.radial === true) {
			var distance = Math.sqrt(
				(end_native.x - start_native.x) * (end_native.x - start_native.x)
				+ (end_native.y - start_native.y) * (end_native.y - start_native.y)
			);
			var gradient = ctx.createRadialGradient(
				start_native.x, start_native.y, distance * power / 100,
				start_native.x, start_native.y, Math.max(distance, 1)
			);
			gradient.addColorStop(0, 'rgb(' + gray + ', ' + gray + ', ' + gray + ')');
			gradient.addColorStop(1, 'rgb(255, 255, 255)');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		else {
			var gradient = ctx.createLinearGradient(
				start_native.x, start_native.y,
				end_native.x, end_native.y
			);
			gradient.addColorStop(0, 'rgb(' + gray + ', ' + gray + ', ' + gray + ')');
			gradient.addColorStop(1, 'rgb(255, 255, 255)');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}

		await app.State.do_action(
			new app.Actions.Bundle_action('gradient_mask', 'Gradient Mask', [
				new app.Actions.Update_layer_mask_image_action(canvas, layer.id),
			])
		);
	}

	/**
	 * serializes a mask object (for JSON export)
	 */
	serialize(layer) {
		var mask = layer.mask;
		if (mask == null)
			return null;
		var source = this.get_mask_source(layer);
		var data_url = null;
		if (source != null && typeof source.toDataURL == 'function') {
			data_url = source.toDataURL('image/png');
		}
		return {
			link: data_url,
			x: mask.x,
			y: mask.y,
			width: mask.width,
			height: mask.height,
			enabled: mask.enabled,
			linked: mask.linked,
		};
	}

	/**
	 * restores a layer mask from its serialized form.
	 *
	 * @param {object} layer
	 * @param {object} data serialized mask (link = data url string)
	 * @returns {object} mask object with a canvas link
	 */
	async restore(layer, data) {
		if (data == null)
			return null;

		var canvas = document.createElement('canvas');

		if (typeof data.link == 'string' && data.link != '') {
			await new Promise((resolve, reject) => {
				var img = new Image();
				img.crossOrigin = 'Anonymous';
				img.onload = function () {
					canvas.width = img.width;
					canvas.height = img.height;
					canvas.getContext('2d').drawImage(img, 0, 0);
					resolve();
				};
				img.onerror = function () {
					resolve();
				};
				img.src = data.link;
			});
		}

		return {
			link: canvas,
			x: data.x,
			y: data.y,
			width: data.width,
			height: data.height,
			enabled: data.enabled !== false,
			linked: data.linked !== false,
		};
	}
}

export default Mask_class;