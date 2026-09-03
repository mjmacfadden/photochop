import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import { buildBrushMask, findSourcePatch, blendSeamless } from './../libs/heal/index.js';

/**
 * Spot Healing Brush — samples surrounding texture and blends it under the brush.
 * No Alt-click source (unlike Clone). Pure CPU Canvas2D for v1.
 */
class Spot_heal_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'spot_heal';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.started = false;
		this.selection_snapshot = null;
		this.last_mouse_x = null;
		this.last_mouse_y = null;
		this.layerImageData = null;
		this.maskCache = {};
		this.recentOffsets = [];
		this.maxRecentOffsets = 6;
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	dragStart(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousedown(event);
	}

	dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
	}

	dragEnd(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mouseup(event);
	}

	_param_number(params, key, fallback) {
		var v = params[key];
		if (v == null) return fallback;
		if (typeof v === 'object' && v.value != null) return Number(v.value);
		return Number(v);
	}

	_get_mask(size, hardness) {
		size = Math.max(1, Math.round(size));
		hardness = Math.round(hardness);
		var key = size + '_' + hardness;
		if (!this.maskCache[key]) {
			this.maskCache[key] = buildBrushMask(size, hardness);
		}
		return this.maskCache[key];
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);

		if (mouse.click_valid == false) {
			return;
		}

		if (!config.layer) {
			alertify.error('Please select a layer to paint on.');
			return;
		}

		if (config.layer.type === 'adjustment') {
			alertify.error('Cannot heal directly on an adjustment layer.');
			return;
		}

		if (config.layer.type === 'text') {
			alertify.error('Cannot heal a text layer. Rasterize it first, or paint on an image layer.');
			return;
		}

		if (config.layer.type === 'group') {
			alertify.error('Cannot heal a group. Select an image layer inside the group.');
			return;
		}

		if (config.layer.type !== 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		if ((config.layer.rotate || 0) > 0) {
			alertify.error('Heal on a rotated layer is disabled. Please rasterize first.');
			return;
		}

		var layer = config.layer;
		var src = layer.link_canvas || layer.link;
		if (!src) {
			alertify.error('Layer image is not ready. Add pixels or open an image first.');
			return;
		}

		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;

		this.started = true;
		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;
		this.recentOffsets = [];
		this.maskCache = {};

		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext('2d');
		this.tmpCanvas.width = lwo;
		this.tmpCanvas.height = lho;
		this.tmpCanvasCtx.drawImage(src, 0, 0, lwo, lho);
		this.selection_snapshot = this.copy_layer_snapshot();

		// Working ImageData — updated after each stamp so later stamps see healed pixels
		this.layerImageData = this.tmpCanvasCtx.getImageData(0, 0, lwo, lho);

		this.heal_stamp(mouse);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		config.layer.link_canvas = this.tmpCanvas;
		if (this.Base_layers.render_interactive_layer) {
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
		this.Base_layers.render();
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();
		var size = this._param_number(params, 'size', 30);

		this.show_mouse_cursor(mouse.x, mouse.y, size, 'circle');

		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}
		if (this.started == false) {
			return;
		}

		// Spacing along path (~25% of brush size) for smooth strokes without freezing
		var step = Math.max(1, size / 4);

		if (this.last_mouse_x != null && this.last_mouse_y != null) {
			var dist = Math.hypot(mouse.x - this.last_mouse_x, mouse.y - this.last_mouse_y);
			var steps = Math.ceil(dist / step);
			for (var s = 1; s <= steps; s++) {
				var t = s / steps;
				var inter_mouse = {
					x: this.last_mouse_x + (mouse.x - this.last_mouse_x) * t,
					y: this.last_mouse_y + (mouse.y - this.last_mouse_y) * t,
					click_x: mouse.click_x,
					click_y: mouse.click_y
				};
				this.heal_stamp(inter_mouse);
			}
		}
		else {
			this.heal_stamp(mouse);
		}

		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;

		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		if (this.Base_layers.render_interactive_layer) {
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
		this.Base_layers.render();
	}

	async mouseup(e) {
		if (this.started == false) {
			return;
		}
		var layer = config.layer;
		var canvas = this.tmpCanvas;
		if (!layer || !canvas) {
			this.started = false;
			return;
		}
		this.constrain_edit_to_selection(canvas, this.selection_snapshot);

		// Keep link_canvas until Update_layer_image_action reads the pixels.
		// Never shrink the canvas before toBlob finishes (that saved a blank 1×1
		// image and made the layer flash white / disappear).
		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('spot_heal_tool', 'Spot Healing Brush', [
					new app.Actions.Update_layer_image_action(canvas, layer.id)
				])
			);
		} finally {
			if (layer.link_canvas === canvas) {
				delete layer.link_canvas;
			}
			this.tmpCanvas = null;
			this.tmpCanvasCtx = null;
			this.layerImageData = null;
			this.selection_snapshot = null;
			this.started = false;
			this.last_mouse_x = null;
			this.last_mouse_y = null;
			this.recentOffsets = [];
			this.maskCache = {};
		}
	}

	abort_stroke() {
		if (!this.started) return;
		var layer = config.layer;
		var canvas = this.tmpCanvas;
		if (layer && layer.link_canvas === canvas) {
			delete layer.link_canvas;
		}
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.layerImageData = null;
		this.selection_snapshot = null;
		this.started = false;
		this.last_mouse_x = null;
		this.last_mouse_y = null;
		this.recentOffsets = [];
		this.maskCache = {};
		config.need_render = true;
		if (this.Base_layers) this.Base_layers.render();
	}

	on_leave() {
		// Space→Pan (and any tool switch) must drop an in-progress heal
		// without committing a half stroke.
		this.abort_stroke();
		return [];
	}

	/**
	 * One heal stamp at mouse position (document coords).
	 * 1) Map to layer-original coords
	 * 2) Find best nearby source patch (SSD)
	 * 3) Soft-blend with mean-color match
	 */
	heal_stamp(mouse) {
		var params = this.getParams();
		var layer = config.layer;
		if (!layer || !this.tmpCanvasCtx || !this.layerImageData) return;

		var size = this._param_number(params, 'size', 30);
		var hardness = this._param_number(params, 'hardness', 50);
		var strength = this._param_number(params, 'strength', 100) / 100;

		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;
		var scale_x = lwo / lw;
		var scale_y = lho / lh;

		var mouse_x = (mouse.x - (layer.x || 0)) * scale_x;
		var mouse_y = (mouse.y - (layer.y || 0)) * scale_y;

		// Brush size in layer-original pixels
		var size_w = Math.max(1, Math.round(size * scale_x));
		var size_h = Math.max(1, Math.round(size * scale_y));
		var brushSize = Math.max(size_w, size_h);
		// Cap very large brushes for responsiveness (still heals; just coarser search)
		var searchMul = brushSize > 80 ? 2.5 : 3.5;
		var radius = brushSize / 2;

		var match = findSourcePatch(
			this.layerImageData,
			mouse_x,
			mouse_y,
			radius,
			{
				searchMul: searchMul,
				step: Math.max(2, Math.floor(radius / 3)),
				avoidOffsets: this.recentOffsets
			}
		);

		if (!match) {
			return;
		}

		// Remember offset for anti-repeat
		this.recentOffsets.push({ dx: match.dx, dy: match.dy });
		if (this.recentOffsets.length > this.maxRecentOffsets) {
			this.recentOffsets.shift();
		}

		var half = Math.floor(brushSize / 2);
		var sx0 = Math.round(match.sx - half);
		var sy0 = Math.round(match.sy - half);

		// Extract source patch ImageData from current working buffer
		var srcPatch;
		try {
			srcPatch = this.tmpCanvasCtx.getImageData(sx0, sy0, brushSize, brushSize);
		}
		catch (err) {
			return;
		}

		var mask = this._get_mask(brushSize, hardness);

		blendSeamless(this.layerImageData, srcPatch, mask, mouse_x, mouse_y, {
			strength: strength,
			meanColorMatch: true
		});

		// Write only the touched rect back to the canvas for speed
		var dx0 = Math.round(mouse_x - half);
		var dy0 = Math.round(mouse_y - half);
		var x0 = Math.max(0, dx0);
		var y0 = Math.max(0, dy0);
		var x1 = Math.min(lwo, dx0 + brushSize);
		var y1 = Math.min(lho, dy0 + brushSize);
		if (x1 <= x0 || y1 <= y0) return;

		var tw = x1 - x0;
		var th = y1 - y0;
		var tile = this.tmpCanvasCtx.createImageData(tw, th);
		var td = tile.data;
		var ld = this.layerImageData.data;
		for (var y = 0; y < th; y++) {
			for (var x = 0; x < tw; x++) {
				var si = ((y0 + y) * lwo + (x0 + x)) * 4;
				var ti = (y * tw + x) * 4;
				td[ti] = ld[si];
				td[ti + 1] = ld[si + 1];
				td[ti + 2] = ld[si + 2];
				td[ti + 3] = ld[si + 3];
			}
		}
		this.tmpCanvasCtx.putImageData(tile, x0, y0);
	}

}

export default Spot_heal_class;
