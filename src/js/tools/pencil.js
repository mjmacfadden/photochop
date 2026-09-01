import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Mask_class from './../modules/mask/mask.js';
import Layer_raster_class from './../modules/layer/raster.js';

class Pencil_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.Layer_raster = new Layer_raster_class();
		this.name = 'pencil';
		this.pressure_supported = false;
		this.pointer_pressure = 0; // range [0 - 1]
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.selection_snapshot = null;
		this.started = false;
		this.last_x = null;
		this.last_y = null;
		this.last_size = null;
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	ensure_raster_layer() {
		if (config.layer == null || config.layers.length === 0) {
			var new_layer = {
				name: 'Layer ' + (app.Layers ? app.Layers.auto_increment : 1),
				type: 'image',
				link: document.createElement('canvas'),
				data: null,
				width: config.WIDTH,
				height: config.HEIGHT,
				width_original: config.WIDTH,
				height_original: config.HEIGHT,
				x: 0,
				y: 0,
			};
			new_layer.link.width = config.WIDTH;
			new_layer.link.height = config.HEIGHT;
			app.State.do_action(new app.Actions.Insert_layer_action(new_layer, false));
			return config.layer;
		}

		if (config.layer.type === 'adjustment') {
			alertify.error('Cannot paint directly on an adjustment layer. Create a new layer or edit the layer mask.');
			return null;
		}

		if (config.layer.type !== 'image') {
			this.Layer_raster.raster();
		}

		return config.layer;
	}

	get_layer_local_coords(world_x, world_y, layer) {
		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;
		var rot = layer.rotate || 0;

		var px = world_x;
		var py = world_y;

		if (rot !== 0) {
			var rad = -rot * Math.PI / 180;
			var cx = lx + lw / 2;
			var cy = ly + lh / 2;
			var cos = Math.cos(rad);
			var sin = Math.sin(rad);
			px = cx + (world_x - cx) * cos - (world_y - cy) * sin;
			py = cy + (world_x - cx) * sin + (world_y - cy) * cos;
		}

		var local_x = (px - lx) * (lwo / lw);
		var local_y = (py - ly) * (lho / lh);

		return { x: local_x, y: local_y };
	}

	mousedown(e) {
		this.started = false;
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}

		var p = (e && e.pressure) || (config.mouse && config.mouse.pressure);
		if (p && p > 0 && p < 1) {
			this.pressure_supported = true;
			this.pointer_pressure = p;
		} else {
			this.pressure_supported = false;
		}

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.started = true;
			this.Mask.brush(this, e, 'start');
			return;
		}

		var layer = this.ensure_raster_layer();
		if (!layer || layer.type !== 'image') {
			return;
		}

		this.started = true;

		var lw = layer.width_original || layer.width || config.WIDTH;
		var lh = layer.height_original || layer.height || config.HEIGHT;

		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvas.width = lw;
		this.tmpCanvas.height = lh;
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d');

		var src = layer.link_canvas || layer.link;
		if (src) {
			this.tmpCanvasCtx.drawImage(src, 0, 0, lw, lh);
		}
		this.selection_snapshot = this.copy_layer_snapshot();

		var point = this.get_layer_local_coords(mouse.x, mouse.y, layer);
		var params = this.getParams();
		var size = params.size || 1;
		if (params.pressure && this.pressure_supported) {
			size = size * (this.pointer_pressure || 0.5) * 2;
		}

		var scale = (layer.width_original || layer.width || 1) / (layer.width || 1);
		var localSize = Math.max(1, Math.round(size * scale));
		var color = config.COLOR;
		var toolOpacity = (params.opacity != null) ? params.opacity / 100 : 1;
		var alpha = ((config.ALPHA != null) ? config.ALPHA / 255 : 1) * toolOpacity;

		this.paint_dab(this.tmpCanvasCtx, point.x, point.y, localSize, color, alpha);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		config.layer.link_canvas = this.tmpCanvas;
		this.Base_layers.render_interactive_layer(config.layer.id);
		this.Base_layers.render();

		this.last_x = point.x;
		this.last_y = point.y;
		this.last_size = localSize;
	}

	mousemove(e, is_touch) {
		if (this.started == false) return;
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false || mouse.click_valid == false) return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.brush(this, e, 'move');
			return;
		}

		var layer = config.layer;
		if (!layer || layer.type !== 'image' || !this.tmpCanvasCtx) return;

		var point = this.get_layer_local_coords(mouse.x, mouse.y, layer);
		if (point.x === this.last_x && point.y === this.last_y) return;

		var params = this.getParams();
		var size = params.size || 1;
		if (params.pressure && this.pressure_supported) {
			size = size * (this.pointer_pressure || 0.5) * 2;
		}

		var scale = (layer.width_original || layer.width || 1) / (layer.width || 1);
		var localSize = Math.max(1, Math.round(size * scale));
		var color = config.COLOR;
		var toolOpacity = (params.opacity != null) ? params.opacity / 100 : 1;
		var alpha = ((config.ALPHA != null) ? config.ALPHA / 255 : 1) * toolOpacity;

		this.paint_stroke_segment(
			this.tmpCanvasCtx,
			this.last_x, this.last_y, this.last_size,
			point.x, point.y, localSize,
			color, alpha
		);

		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);
		this.Base_layers.render_interactive_layer(config.layer.id);
		this.Base_layers.render();

		this.last_x = point.x;
		this.last_y = point.y;
		this.last_size = localSize;
	}

	mouseup(e) {
		if (this.started == false) return;

		if (config.mask_active === true && config.layer && config.layer.mask != null) {
			this.Mask.brush(this, e, 'end');
			this.started = false;
			return;
		}

		if (this.tmpCanvas && config.layer && config.layer.type === 'image') {
			app.State.do_action(
				new app.Actions.Bundle_action('pencil_stroke', 'Pencil Stroke', [
					new app.Actions.Update_layer_image_action(this.tmpCanvas, config.layer.id)
				])
			);
		}

		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.selection_snapshot = null;
		this.started = false;
		this.last_x = null;
		this.last_y = null;
	}

	paint_dab(ctx, x, y, size, color, alpha) {
		ctx.save();
		ctx.fillStyle = color;
		ctx.globalAlpha = alpha;
		ctx.imageSmoothingEnabled = false;
		var s = Math.max(1, Math.round(size));
		var sh = Math.floor(s / 2);
		ctx.fillRect(Math.round(x - sh), Math.round(y - sh), s, s);
		ctx.restore();
	}

	paint_stroke_segment(ctx, x0, y0, s0, x1, y1, s1, color, alpha) {
		var dx = x1 - x0;
		var dy = y1 - y0;
		var dist = Math.sqrt(dx * dx + dy * dy);
		var s = Math.max(1, Math.round(s1));
		var sh = Math.floor(s / 2);
		var steps = Math.max(1, Math.ceil(dist / Math.max(1, s * 0.5)));

		ctx.save();
		ctx.fillStyle = color;
		ctx.globalAlpha = alpha;
		ctx.imageSmoothingEnabled = false;
		for (var i = 0; i <= steps; i++) {
			var t = i / steps;
			var px = x0 + dx * t;
			var py = y0 + dy * t;
			ctx.fillRect(Math.round(px - sh), Math.round(py - sh), s, s);
		}
		ctx.restore();
	}

	// Backwards compatibility for legacy vector pencil layers in saved files
	render(ctx, layer) {
		if (!layer.data || layer.data.length == 0)
			return;
		var params = layer.params || {};
		ctx.save();
		ctx.fillStyle = layer.color || '#000000';
		ctx.strokeStyle = layer.color || '#000000';
		ctx.lineWidth = params.size || 1;
		ctx.imageSmoothingEnabled = false;
		ctx.translate(layer.x || 0, layer.y || 0);

		var data = layer.data;
		for (var i = 0; i < data.length; i++) {
			if (data[i] !== null) {
				var size = data[i][2] || params.size || 1;
				ctx.fillRect(data[i][0] - Math.floor(size / 2), data[i][1] - Math.floor(size / 2), size, size);
			}
		}
		ctx.restore();
	}

}

export default Pencil_class;
