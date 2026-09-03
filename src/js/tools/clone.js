import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Layer_raster_class from './../modules/layer/raster.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Clone_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Layer_raster = new Layer_raster_class();
		this.ctx = ctx;
		this.name = 'clone';
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.sourceCanvas = null;
		this.started = false;
		this.sampling = false;
		this.clone_coords = null;
		this.selection_snapshot = null;
		this.last_mouse_x = null;
		this.last_mouse_y = null;
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

	keydown(event) {
		if (event.key === 'Alt' || event.altKey) {
			this.update_cursor(true);
		}
	}

	keyup(event) {
		if (event.key === 'Alt' || !event.altKey) {
			this.update_cursor(false);
		}
	}

	update_cursor(is_alt) {
		if (config.mouse && config.mouse.x != null && config.mouse.valid !== false) {
			var params = this.getParams();
			this.show_mouse_cursor(config.mouse.x, config.mouse.y, params.size, is_alt ? 'crosshair' : 'circle');
		}
	}

	on_params_update() {
		var params = this.getParams();
		var strict_element = document.getElementById('strict');
		if (strict_element) {
			if (params.circle == false) {
				strict_element.style.display = 'none';
			} else {
				strict_element.style.display = 'block';
			}
		}
	}

	sample_source(e) {
		var mouse = this.get_mouse_info(e);

		this.clone_coords = {
			x: mouse.x,
			y: mouse.y,
		};
		alertify.success('Source coordinates saved.');
		return true;
	}

	mouseRightClick(e) {
		if (config.TOOL.name != this.name)
			return;
		if (e && typeof e.preventDefault === 'function') e.preventDefault();
		this.sample_source(e);
	}

	mouseLongClick() {
		this.sample_source();
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);

		var is_alt = (e && e.altKey)
			|| (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down)
			|| (e && (e.button === 2 || e.which === 3));

		if (is_alt) {
			this.sampling = true;
			this.sample_source(e);
			return;
		}

		this.sampling = false;

		if (mouse.click_valid == false) {
			return;
		}

		if (this.clone_coords === null) {
			alertify.error('Source is empty. Hold Alt/Option and click to set the clone source.');
			return;
		}

		if (!config.layer) {
			alertify.error('Please select a layer to paint on.');
			return;
		}

		if (config.layer.type === 'adjustment') {
			alertify.error('Cannot paint directly on an adjustment layer.');
			return;
		}

		if (config.layer.type !== 'image') {
			this.Layer_raster.raster();
		}

		var layer = config.layer;
		var src = layer.link_canvas || layer.link;
		if (!src) {
			alertify.error('Layer image is not ready.');
			return;
		}

		var params = this.getParams();
		var previous_layer = this.Base_layers.find_previous(config.layer.id);
		if (params.source_layer && params.source_layer.value == 'Previous') {
			if (previous_layer == null) {
				alertify.error('Can not find previous layer.');
				return;
			}
			if (previous_layer.type != 'image') {
				alertify.error('Previous layer must be image, convert it to raster to apply this tool.');
				return;
			}
		}

		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;

		this.started = true;
		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;

		// Snapshot composite canvas for 'All Layers' mode
		if (params.source_layer && params.source_layer.value === 'All Layers') {
			this.sourceCanvas = document.createElement('canvas');
			this.sourceCanvas.width = config.WIDTH;
			this.sourceCanvas.height = config.HEIGHT;
			var main_canvas = document.getElementById('canvas_minipaint');
			if (main_canvas) {
				this.sourceCanvas.getContext('2d').drawImage(main_canvas, 0, 0);
			}
		}

		// get canvas from layer
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
		this.tmpCanvas.width = lwo;
		this.tmpCanvas.height = lho;
		this.tmpCanvasCtx.drawImage(src, 0, 0, lwo, lho);
		this.selection_snapshot = this.copy_layer_snapshot();

		// clone first stamp
		this.clone_general(this.tmpCanvas, this.tmpCanvas, 'click', mouse);
		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		// register tmp canvas for progress redraw
		config.layer.link_canvas = this.tmpCanvas;
		if (this.Base_layers.render_interactive_layer) {
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
		this.Base_layers.render();
	}

	mousemove(e) {
		if (this.sampling) {
			return;
		}

		var mouse = this.get_mouse_info(e);
		var params = this.getParams();

		var is_alt = (e && e.altKey) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down);
		this.show_mouse_cursor(mouse.x, mouse.y, params.size, is_alt ? 'crosshair' : 'circle');

		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}
		if (this.started == false) {
			return;
		}

		var size = Math.max(1, params.size || 30);
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
				this.clone_general(this.tmpCanvas, this.tmpCanvas, 'move', inter_mouse);
			}
		} else {
			this.clone_general(this.tmpCanvas, this.tmpCanvas, 'move', mouse);
		}

		this.last_mouse_x = mouse.x;
		this.last_mouse_y = mouse.y;

		this.constrain_edit_to_selection(this.tmpCanvas, this.selection_snapshot);

		// draw draft preview
		if (this.Base_layers.render_interactive_layer) {
			this.Base_layers.render_interactive_layer(config.layer.id);
		}
		this.Base_layers.render();
	}

	async mouseup(e) {
		if (this.sampling) {
			this.sampling = false;
			return;
		}
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

		// Await commit before dropping the temp canvas — shrinking to 1×1
		// while toBlob is in flight would save a blank image.
		try {
			await app.State.do_action(
				new app.Actions.Bundle_action('clone_tool', 'Clone Tool', [
					new app.Actions.Update_layer_image_action(canvas, layer.id)
				])
			);
		} finally {
			if (layer.link_canvas === canvas) {
				delete layer.link_canvas;
			}
			this.tmpCanvas = null;
			this.tmpCanvasCtx = null;
			this.sourceCanvas = null;
			this.selection_snapshot = null;
			this.started = false;
			this.last_mouse_x = null;
			this.last_mouse_y = null;
		}
	}

	clone_general(canvas_from, canvas_to, type, mouse) {
		var params = this.getParams();
		if (!this.clone_coords) return;

		var layer = config.layer;
		if (!layer) return;

		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;
		var scale_x = lwo / lw;
		var scale_y = lho / lh;

		var mouse_x = (mouse.x - (layer.x || 0)) * scale_x;
		var mouse_y = (mouse.y - (layer.y || 0)) * scale_y;
		var half = Math.round(params.size / 2);

		var canvas_source = document.createElement("canvas");
		var ctx_source = canvas_source.getContext("2d");
		var w = Math.max(1, Math.ceil(params.size));
		var h = Math.max(1, Math.ceil(params.size));
		canvas_source.width = w;
		canvas_source.height = h;

		// Calculate source sample position in document coordinates
		var src_doc_x = this.clone_coords.x + (mouse.x - mouse.click_x);
		var src_doc_y = this.clone_coords.y + (mouse.y - mouse.click_y);

		var x_from, y_from;
		if (params.source_layer && params.source_layer.value === 'All Layers' && this.sourceCanvas) {
			ctx_source.drawImage(this.sourceCanvas, -(src_doc_x - half), -(src_doc_y - half));
		}
		else if (params.source_layer && params.source_layer.value === 'Previous') {
			var previous_layer = this.Base_layers.find_previous(layer.id);
			if (!previous_layer) return;

			var plw = (previous_layer.width != null && previous_layer.width > 0) ? previous_layer.width : (config.WIDTH || 1);
			var plh = (previous_layer.height != null && previous_layer.height > 0) ? previous_layer.height : (config.HEIGHT || 1);
			var plwo = previous_layer.width_original || plw;
			var plho = previous_layer.height_original || plh;
			var p_scale_x = plwo / plw;
			var p_scale_y = plho / plh;

			x_from = (src_doc_x - (previous_layer.x || 0)) * p_scale_x;
			y_from = (src_doc_y - (previous_layer.y || 0)) * p_scale_y;

			var prev_source = previous_layer.link_canvas || previous_layer.link;
			if (prev_source) {
				ctx_source.drawImage(prev_source, -(x_from - half), -(y_from - half));
			}
		}
		else {
			x_from = (src_doc_x - (layer.x || 0)) * scale_x;
			y_from = (src_doc_y - (layer.y || 0)) * scale_y;

			ctx_source.drawImage(canvas_from, -(x_from - half), -(y_from - half));
		}

		if (params.anti_aliasing == false) {
			ctx_source.arc(half, half, half, 0, Math.PI * 2, false);
			ctx_source.clip();
		}

		// apply anti aliasing
		if (params.anti_aliasing == true) {
			var gradient = ctx_source.createRadialGradient(half, half, 0, half, half, half + 1);
			gradient.addColorStop(0, 'white');
			gradient.addColorStop(0.3, 'white');
			gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
			ctx_source.fillStyle = gradient;

			ctx_source.globalCompositeOperation = 'destination-in';
			ctx_source.fillRect(0, 0, params.size, params.size);
			ctx_source.globalCompositeOperation = 'source-over';
		}

		// finish
		canvas_to.getContext("2d").drawImage(canvas_source, mouse_x - half, mouse_y - half);
	}

}
export default Clone_class;
