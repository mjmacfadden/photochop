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
		}
		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
		return config.mask_active;
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
	 * returns a fresh full layer sized mask object
	 *
	 * @param {object} layer
	 * @param {Boolean} reveal true reveals (white), false hides (black)
	 * @returns {object}
	 */
	create_mask(layer, reveal) {
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(layer.width || 1));
		canvas.height = Math.max(1, Math.round(layer.height || 1));
		var ctx = canvas.getContext('2d');
		ctx.fillStyle = (reveal === false) ? '#000000' : '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		return {
			link: canvas,
			x: Math.round(layer.x || 0),
			y: Math.round(layer.y || 0),
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

		//find intersection between selection and layer bounds (world coords)
		var x1 = Math.max(selection.x, layer.x);
		var y1 = Math.max(selection.y, layer.y);
		var x2 = Math.min(selection.x + selection.width, layer.x + layer.width);
		var y2 = Math.min(selection.y + selection.height, layer.y + layer.height);
		if (x2 <= x1 || y2 <= y1) {
			return mask;
		}

		var local_x = Math.round(x1 - layer.x);
		var local_y = Math.round(y1 - layer.y);
		var width = Math.round(x2 - x1);
		var height = Math.round(y2 - y1);

		var color = (reveal === false) ? '#000000' : '#ffffff';
		ctx.fillStyle = color;
		ctx.fillRect(local_x, local_y, width, height);

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
	 * @param {context} ctx content drawn in world coordinates
	 * @param {object} layer
	 */
	multiply_alpha_by_mask_world(ctx, layer) {
		var mask = layer.mask;
		if (mask == null || mask.enabled === false)
			return;

		var cache = this._prepare_mask_cache(layer);
		if (cache == null)
			return;

		var lx = Math.round(layer.x || 0);
		var ly = Math.round(layer.y || 0);
		var lw = layer.width || 0;
		var lh = layer.height || 0;
		if (lw <= 0 || lh <= 0)
			return;

		var rotate = layer.rotate || 0;
		var rad = rotate * Math.PI / 180;

		var cw = ctx.canvas.width;
		var ch = ctx.canvas.height;

		//read the current transform (zoom/pan) so world coords can map to pixels
		var t = null;
		if (typeof ctx.getTransform == 'function')
			t = ctx.getTransform();
		var a = t ? t.a : 1, b = t ? t.b : 0, c = t ? t.c : 0, d = t ? t.d : 1, e = t ? t.e : 0, f = t ? t.f : 0;
		var det = a * d - b * c;
		if (det === 0)
			return;

		var world_to_px = function (wx, wy) {
			return [a * wx + c * wy + e, b * wx + d * wy + f];
		};

		//axis aligned pixel region occupied by the (possibly rotated) object
		var left, top, right, bottom;
		var corners = [];
		if (rad === 0) {
			corners.push(world_to_px(lx, ly));
			corners.push(world_to_px(lx + lw, ly));
			corners.push(world_to_px(lx + lw, ly + lh));
			corners.push(world_to_px(lx, ly + lh));
		}
		else {
			var cx = lx + lw / 2;
			var cy = ly + lh / 2;
			var hw = lw / 2;
			var hh = lh / 2;
			var cos = Math.cos(rad);
			var sin = Math.sin(rad);
			corners.push(world_to_px(cx - hw * cos + hh * sin, cy - hw * sin - hh * cos));
			corners.push(world_to_px(cx + hw * cos + hh * sin, cy + hw * sin - hh * cos));
			corners.push(world_to_px(cx + hw * cos - hh * sin, cy + hw * sin + hh * cos));
			corners.push(world_to_px(cx - hw * cos - hh * sin, cy - hw * sin + hh * cos));
		}

		left = Math.floor(Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0]));
		top = Math.floor(Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1]));
		right = Math.ceil(Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0]));
		bottom = Math.ceil(Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]));

		left = Math.max(0, left);
		top = Math.max(0, top);
		right = Math.min(cw, right);
		bottom = Math.min(ch, bottom);
		if (right <= left || bottom <= top)
			return;

		var width = right - left;
		var height = bottom - top;
		var imageData = ctx.getImageData(left, top, width, height);
		var data = imageData.data;

		//world <=> pixel mapping for the inverse transform
		var ia = d / det, ib = -c / det, ic = -b / det, idm = a / det;
		var world_x = function (px, py) {
			return ia * (px - e) + ib * (py - f);
		};
		var world_y = function (px, py) {
			return ic * (px - e) + idm * (py - f);
		};

		var mx = mask.x || 0;
		var my = mask.y || 0;
		var center_x = lx + lw / 2;
		var center_y = ly + lh / 2;
		var cos2 = (rad !== 0) ? Math.cos(rad) : 0;
		var sin2 = (rad !== 0) ? Math.sin(rad) : 0;

		for (var y = 0; y < height; y++) {
			for (var x = 0; x < width; x++) {
				var px = left + x;
				var py = top + y;
				var wx = world_x(px, py);
				var wy = world_y(px, py);

				var u_local, v_local;
				if (rad !== 0) {
					var dx = wx - center_x;
					var dy = wy - center_y;
					u_local = dx * cos2 + dy * sin2 + lw / 2;
					v_local = -dx * sin2 + dy * cos2 + lh / 2;
					if (u_local < 0 || v_local < 0 || u_local >= lw || v_local >= lh) {
						continue;
					}
				}
				else {
					u_local = wx - lx;
					v_local = wy - ly;
				}

				var sample_x = Math.floor((u_local + lx - mx) * cache.sx);
				var sample_y = Math.floor((v_local + ly - my) * cache.sy);
				if (sample_x < 0 || sample_y < 0 || sample_x >= cache.sw || sample_y >= cache.sh) {
					continue;
				}

				var index = (sample_y * cache.sw + sample_x) * 4;
				var value = cache.data[index] * 0.2126 + cache.data[index + 1] * 0.7152 + cache.data[index + 2] * 0.0722;
				if (value >= 254)
					continue; //fully white - no change

				var pixel_index = (y * width + x) * 4 + 3;
				data[pixel_index] = (data[pixel_index] * value / 255) | 0;
			}
		}

		ctx.putImageData(imageData, left, top);
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

		var cache = this._prepare_mask_cache(layer);
		if (cache == null)
			return;

		var width = ctx.canvas.width;
		var height = ctx.canvas.height;
		var imageData = ctx.getImageData(0, 0, width, height);
		var data = imageData.data;
		var mx = mask.x || 0;
		var my = mask.y || 0;
		var layer_x = Math.round(layer.x || 0);
		var layer_y = Math.round(layer.y || 0);

		for (var y = 0; y < height; y++) {
			for (var x = 0; x < width; x++) {
				var sample_x = Math.floor((layer_x + x - mx) * cache.sx);
				var sample_y = Math.floor((layer_y + y - my) * cache.sy);
				if (sample_x < 0 || sample_y < 0 || sample_x >= cache.sw || sample_y >= cache.sh) {
					continue;
				}
				var index = (sample_y * cache.sw + sample_x) * 4;
				var value = cache.data[index] * 0.2126 + cache.data[index + 1] * 0.7152 + cache.data[index + 2] * 0.0722;
				if (value >= 254)
					continue;
				var pixel_index = (y * width + x) * 4 + 3;
				data[pixel_index] = (data[pixel_index] * value / 255) | 0;
			}
		}

		ctx.putImageData(imageData, 0, 0);
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

		var mask = layer.mask;
		if (new_props.x !== old_props.x || new_props.y !== old_props.y
			|| new_props.width !== old_props.width || new_props.height !== old_props.height) {
			//move or resize - keep the mask anchored to the layer bounds
			actions.push(new app.Actions.Update_layer_mask_action(layer.id, {
				x: Math.round(new_props.x),
				y: Math.round(new_props.y),
				width: Math.round(new_props.width),
				height: Math.round(new_props.height),
			}));
		}

		return actions;
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
		return {
			x: (x - (layer.mask.x || 0)) * sw / mw,
			y: (y - (layer.mask.y || 0)) * sh / mh,
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
		var size = options.size || 1;
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
			last_x: null,
			last_y: null,
			painted: false,
		};

		layer.mask.link_canvas = canvas;
		this.paint_point(tool, e, true);
		config.need_render = true;
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

		if (this.stroke.circle === true) {
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

		if (last) {
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
		config.need_render = true;
	}

	paint_point(tool, e, first) {
		var mouse = tool.get_mouse_info(e);
		var layer = config.layer;
		var point = this.world_to_mask(layer, mouse.x, mouse.y);

		this.stroke.ctx.save();
		if (this.stroke.circle === true) {
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
		config.need_render = true;
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
		if (config.layer.mask != null) {
			delete config.layer.mask.link_canvas;
		}

		if (stroke.painted === true) {
			await app.State.do_action(
				new app.Actions.Bundle_action('paint_mask', 'Paint Mask', [
					new app.Actions.Update_layer_mask_image_action(stroke.canvas, layer.id),
				])
			);
		}
		else {
			config.need_render = true;
		}

		//decrease memory
		stroke.canvas.width = 1;
		stroke.canvas.height = 1;
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