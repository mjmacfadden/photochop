import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Mask_class from './../modules/mask/mask.js';
import Layer_raster_class from './../modules/layer/raster.js';

class Brush_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Mask = new Mask_class();
		this.Layer_raster = new Layer_raster_class();
		this.name = 'brush';
		this.pressure_supported = false;
		this.pointer_pressure = 0; // range [0 - 1]
		this.soft_stamp_cache = {};
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
		var size = params.size || 20;
		if (params.pressure && this.pressure_supported) {
			size = size * (this.pointer_pressure || 0.5) * 2;
		}

		var scale = (layer.width_original || layer.width || 1) / (layer.width || 1);
		var localSize = Math.max(1, size * scale);
		var hardness = (params.hardness != null) ? params.hardness : 100;
		var color = config.COLOR;
		var toolOpacity = (params.opacity != null) ? params.opacity / 100 : 1;
		var alpha = ((config.ALPHA != null) ? config.ALPHA / 255 : 1) * toolOpacity;

		this.paint_dab(this.tmpCanvasCtx, point.x, point.y, localSize, hardness, color, alpha);
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
		var size = params.size || 20;
		if (params.pressure && this.pressure_supported) {
			size = size * (this.pointer_pressure || 0.5) * 2;
		}

		var scale = (layer.width_original || layer.width || 1) / (layer.width || 1);
		var localSize = Math.max(1, size * scale);
		var hardness = (params.hardness != null) ? params.hardness : 100;
		var color = config.COLOR;
		var toolOpacity = (params.opacity != null) ? params.opacity / 100 : 1;
		var alpha = ((config.ALPHA != null) ? config.ALPHA / 255 : 1) * toolOpacity;

		this.paint_stroke_segment(
			this.tmpCanvasCtx,
			this.last_x, this.last_y, this.last_size,
			point.x, point.y, localSize,
			hardness, color, alpha
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
				new app.Actions.Bundle_action('brush_stroke', 'Brush Stroke', [
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

	paint_dab(ctx, x, y, size, hardness, color, alpha) {
		ctx.save();
		ctx.globalAlpha = alpha;
		if (hardness < 100) {
			this.stamp_soft(ctx, x, y, size, hardness, color, 1);
		} else {
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, size / 2, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	paint_stroke_segment(ctx, x0, y0, s0, x1, y1, s1, hardness, color, alpha) {
		var dx = x1 - x0;
		var dy = y1 - y0;
		var dist = Math.sqrt(dx * dx + dy * dy);

		if (hardness < 100) {
			ctx.save();
			ctx.globalAlpha = alpha;
			this.stamp_soft_line(ctx, x0, y0, s0, x1, y1, s1, hardness, color);
			ctx.restore();
		} else {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.strokeStyle = color;
			ctx.fillStyle = color;
			ctx.lineWidth = s1;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(x1, y1, s1 / 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}

	build_soft_stamp(size, hardness, color) {
		size = Math.max(1, Math.round(size));
		var r_outer = size / 2;
		var r_inner = r_outer * Math.max(0, Math.min(100, hardness)) / 100;
		var side = size + 2;
		var center = side / 2;

		var rgb = { r: 0, g: 0, b: 0 };
		if (typeof this.Helper.hexToRgb == 'function') {
			rgb = this.Helper.hexToRgb(color) || rgb;
		}

		var canvas = document.createElement('canvas');
		canvas.width = side;
		canvas.height = side;
		var ctx = canvas.getContext('2d');

		var gradient = ctx.createRadialGradient(center, center, r_inner, center, center, r_outer);
		gradient.addColorStop(0, 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 1)');
		gradient.addColorStop(1, 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', 0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, side, side);

		var step = Math.max(1, Math.floor(r_outer / 4));
		var integral = r_outer + r_inner;
		var amp = Math.min(1, step / Math.max(integral, 0.001));

		return {
			canvas: canvas,
			center: center,
			step: step,
			amp: amp,
			size: size,
			hardness: hardness,
			color: color,
		};
	}

	get_soft_stamp(size, hardness, color) {
		size = Math.max(1, Math.round(size));
		hardness = Math.round(hardness);
		var key = size + '_' + hardness + '_' + color;
		if (this.soft_stamp_cache[key] == null) {
			this.soft_stamp_cache[key] = this.build_soft_stamp(size, hardness, color);
		}
		return this.soft_stamp_cache[key];
	}

	stamp_soft(ctx, x, y, size, hardness, color, amplitude) {
		var stamp = this.get_soft_stamp(size, hardness, color);
		if (amplitude == null) {
			amplitude = stamp.amp;
		}
		ctx.save();
		ctx.globalAlpha = Math.max(0, Math.min(1, (ctx.globalAlpha || 1) * amplitude));
		ctx.drawImage(stamp.canvas, Math.round(x - stamp.center), Math.round(y - stamp.center));
		ctx.restore();
	}

	stamp_soft_line(ctx, x0, y0, s0, x1, y1, s1, hardness, color) {
		var dx = x1 - x0;
		var dy = y1 - y0;
		var dist = Math.sqrt(dx * dx + dy * dy);

		var stamp = this.get_soft_stamp(Math.max(s0, s1), hardness, color);
		var step = Math.max(1, stamp.step);
		var count = Math.max(1, Math.ceil(dist / step));

		for (var i = 0; i <= count; i++) {
			var t = i / count;
			this.stamp_soft(
				ctx,
				x0 + dx * t,
				y0 + dy * t,
				s0 + (s1 - s0) * t,
				hardness,
				color
			);
		}
	}

	// Backwards compatibility for legacy vector brush layers in saved files
	render(ctx, layer) {
		if (!layer.data || layer.data.length == 0)
			return;
		var params = layer.params || {};
		ctx.save();
		ctx.fillStyle = layer.color || '#000000';
		ctx.strokeStyle = layer.color || '#000000';
		ctx.lineWidth = params.size || 20;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.translate(layer.x || 0, layer.y || 0);

		var data = layer.data;
		for (var k = 0; k < data.length; k++) {
			var group = data[k];
			if (!group || group.length === 0) continue;
			ctx.beginPath();
			ctx.moveTo(group[0][0], group[0][1]);
			for (var i = 1; i < group.length; i++) {
				if (group[i] === null) {
					ctx.beginPath();
				} else {
					ctx.lineTo(group[i][0], group[i][1]);
					ctx.stroke();
				}
			}
		}
		ctx.restore();
	}

}

export default Brush_class;
