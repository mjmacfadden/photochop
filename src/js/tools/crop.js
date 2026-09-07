import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Base_gui_class from './../core/base-gui.js';
import Base_selection_class from './../core/base-selection.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

class Crop_class extends Base_tools_class {

	constructor(ctx) {
		super();
		var _this = this;
		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.GUI_tools = new GUI_tools_class();
		this.ctx = ctx;
		this.name = 'crop';
		this.selection = {
			x: null,
			y: null,
			width: null,
			height: null,
		};
		this.is_moving_selection = false;
		this.move_start = null;
		// Straighten (Photoshop-like reference line while Crop is active)
		this.straighten_mode = false;
		this.straighten_line = null; // {x1,y1,x2,y2} while dragging
		this.session_angle = 0; // cumulative degrees applied since activate
		this.ui_angle = 0; // value shown in the Angle options-bar field
		this._applying_angle_ui = false;
		var sel_config = {
			enable_background: false,
			crop_shield: true,
			enable_borders: true,
			enable_controls: true,
			crop_lines: true,
			crop_guides: 'thirds',
			border_style: 'crop_ps',
			handle_style: 'crop_ps',
			enable_rotation: false,
			enable_move: false,
			keep_ratio: false,
			fixed_ratio: null,
			data_function: function () {
				return _this.selection;
			},
			after_draw: function (ctx) {
				_this.draw_straighten_overlay(ctx);
			},
		};
		this.mousedown_selection = null;
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
	}

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	/**
	 * Resolve current aspect ratio constraint as W/H, or null for free.
	 */
	get_aspect_ratio() {
		var params = this.getParams();
		var aspect = (params.aspect && params.aspect.value) ? params.aspect.value : 'Free';
		if (aspect === 'Free') {
			return null;
		}
		if (aspect === 'Original') {
			if (!config.HEIGHT) {
				return null;
			}
			return config.WIDTH / config.HEIGHT;
		}
		if (aspect === 'Custom') {
			var cw = Math.max(1, Number(params.ratio_w) || 1);
			var ch = Math.max(1, Number(params.ratio_h) || 1);
			return cw / ch;
		}
		var parts = String(aspect).split(':');
		if (parts.length === 2) {
			var aw = parseFloat(parts[0]);
			var ah = parseFloat(parts[1]);
			if (aw > 0 && ah > 0) {
				return aw / ah;
			}
		}
		return null;
	}

	/**
	 * Map guides dropdown label to crop_guides setting key.
	 */
	get_guides_mode() {
		var params = this.getParams();
		var guides = (params.guides && params.guides.value) ? params.guides.value : 'Rule of Thirds';
		if (guides === 'Grid') {
			return 'grid';
		}
		if (guides === 'Diagonal') {
			return 'diagonal';
		}
		if (guides === 'None') {
			return 'none';
		}
		return 'thirds';
	}

	is_straighten_armed() {
		var params = this.getParams();
		if (params.straighten && typeof params.straighten === 'object') {
			return params.straighten.value === true;
		}
		return params.straighten === true || this.straighten_mode === true;
	}

	set_straighten_armed(armed) {
		this.straighten_mode = !!armed;
		var params = this.getParams();
		if (params.straighten && typeof params.straighten === 'object') {
			params.straighten.value = !!armed;
		}
		else if (params.straighten !== undefined) {
			params.straighten = !!armed;
		}
		this.GUI_tools.show_action_attributes();
	}

	sync_angle_attribute(degrees) {
		var params = this.getParams();
		var rounded = Math.round(degrees * 10) / 10;
		if (params.angle && typeof params.angle === 'object') {
			params.angle.value = rounded;
		}
		else if (params.angle !== undefined) {
			params.angle = rounded;
		}
		this._applying_angle_ui = true;
		this.GUI_tools.show_action_attributes();
		this._applying_angle_ui = false;
	}

	/**
	 * Largest crop rect for the current aspect (full canvas when Free).
	 */
	compute_initial_crop_rect() {
		var doc_w = config.WIDTH || 1;
		var doc_h = config.HEIGHT || 1;
		var ratio = this.get_aspect_ratio();
		if (ratio == null || ratio <= 0) {
			return { x: 0, y: 0, width: doc_w, height: doc_h };
		}
		var w;
		var h;
		if (doc_w / doc_h > ratio) {
			h = doc_h;
			w = Math.round(h * ratio);
		}
		else {
			w = doc_w;
			h = Math.round(w / ratio);
		}
		w = Math.max(1, Math.min(w, doc_w));
		h = Math.max(1, Math.min(h, doc_h));
		return {
			x: Math.round((doc_w - w) / 2),
			y: Math.round((doc_h - h) / 2),
			width: w,
			height: h,
		};
	}

	/**
	 * Apply an initial / refreshed full-document crop (aspect-aware).
	 */
	apply_initial_crop() {
		var rect = this.compute_initial_crop_rect();
		this.selection.x = rect.x;
		this.selection.y = rect.y;
		this.selection.width = rect.width;
		this.selection.height = rect.height;
		config.need_render = true;
	}

	/**
	 * Sync Base_selection settings from current tool attributes.
	 */
	sync_selection_settings() {
		var settings = this.Base_selection.find_settings(this.name);
		if (!settings) {
			return;
		}
		var ratio = this.get_aspect_ratio();
		settings.keep_ratio = ratio != null;
		settings.fixed_ratio = ratio;
		settings.crop_guides = this.get_guides_mode();
		settings.crop_lines = settings.crop_guides === 'thirds';
		settings.crop_shield = true;
		settings.border_style = 'crop_ps';
		settings.handle_style = 'crop_ps';
		// While drawing a straighten line, hide resize handles so they don't steal hits
		settings.enable_controls = !this.is_straighten_armed();
		config.need_render = true;
	}

	/**
	 * Show Custom ratio W/H attrs only when Aspect is Custom.
	 * gui-tools skips attrs with visible:false on rebuild (select change
	 * calls show_action_attributes after on_params_update).
	 */
	sync_custom_ratio_visibility() {
		var params = this.getParams();
		var aspect = (params.aspect && params.aspect.value) ? params.aspect.value : 'Free';
		var show = (aspect === 'Custom');
		var attrs = (config.TOOL && config.TOOL.attributes) ? config.TOOL.attributes : null;
		if (!attrs) {
			return;
		}
		if (attrs.ratio_w && typeof attrs.ratio_w === 'object') {
			attrs.ratio_w.visible = show;
		}
		if (attrs.ratio_h && typeof attrs.ratio_h === 'object') {
			attrs.ratio_h.visible = show;
		}
	}

	/**
	 * Apply aspect constraint to width/height (signed, from drag origin).
	 */
	apply_ratio_to_drag(width, height, ratio) {
		if (ratio == null || ratio <= 0) {
			return { width: width, height: height };
		}
		var width_new = Math.round(height * ratio);
		var height_new = Math.round(width / ratio);

		if (Math.abs(width * 100 / (width_new || 1)) > Math.abs(height * 100 / (height_new || 1))) {
			if (width * 100 / (width_new || 1) > 0) {
				height = height_new;
			}
			else {
				height = -height_new;
			}
		}
		else {
			if (height * 100 / (height_new || 1) > 0) {
				width = width_new;
			}
			else {
				width = -width_new;
			}
		}
		return { width: width, height: height };
	}

	/**
	 * Re-fit an existing selection to the current aspect (centered).
	 */
	constrain_existing_selection() {
		var ratio = this.get_aspect_ratio();
		if (this.selection.width == null || this.selection.width == 0 || this.selection.height == 0) {
			this.apply_initial_crop();
			return;
		}
		if (ratio == null || ratio <= 0) {
			return;
		}
		var x = this.selection.x;
		var y = this.selection.y;
		var w = Math.abs(this.selection.width);
		var h = Math.abs(this.selection.height);
		var cx = x + w / 2;
		var cy = y + h / 2;
		var new_w = w;
		var new_h = h;
		if (w / h > ratio) {
			new_w = Math.round(h * ratio);
		}
		else {
			new_h = Math.round(w / ratio);
		}
		new_w = Math.max(1, Math.min(new_w, config.WIDTH));
		new_h = Math.max(1, Math.min(new_h, config.HEIGHT));
		// Keep aspect after canvas clamp
		if (new_w / new_h > ratio) {
			new_w = Math.max(1, Math.round(new_h * ratio));
		}
		else {
			new_h = Math.max(1, Math.round(new_w / ratio));
		}
		var nx = Math.round(cx - new_w / 2);
		var ny = Math.round(cy - new_h / 2);
		nx = Math.max(0, Math.min(nx, config.WIDTH - new_w));
		ny = Math.max(0, Math.min(ny, config.HEIGHT - new_h));
		this.selection.x = nx;
		this.selection.y = ny;
		this.selection.width = new_w;
		this.selection.height = new_h;
		config.need_render = true;
	}

	point_in_selection(mx, my) {
		if (this.selection.width == null || this.selection.width == 0 || this.selection.height == 0) {
			return false;
		}
		var x = this.selection.x;
		var y = this.selection.y;
		var w = this.selection.width;
		var h = this.selection.height;
		return mx >= x && mx <= x + w && my >= y && my <= y + h;
	}

	/**
	 * Correction angle (degrees) so the drawn line lands on the nearest axis
	 * (horizontal or vertical) — Photoshop Crop Straighten behavior.
	 */
	line_to_straighten_angle(x1, y1, x2, y2) {
		var dx = x2 - x1;
		var dy = y2 - y1;
		if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
			return 0;
		}
		var a = Math.atan2(dy, dx) * 180 / Math.PI;
		// Bring into (-90, 90]
		while (a > 90) {
			a -= 180;
		}
		while (a <= -90) {
			a += 180;
		}
		if (Math.abs(a) > 45) {
			// Closer to vertical
			return (a > 0 ? 90 : -90) - a;
		}
		// Closer to horizontal
		return -a;
	}

	draw_straighten_overlay(ctx) {
		var line = this.straighten_line;
		if (!line) {
			return;
		}
		var zoom = config.ZOOM || 1;
		ctx.save();
		ctx.lineWidth = 1 / zoom;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.beginPath();
		ctx.moveTo(line.x1, line.y1);
		ctx.lineTo(line.x2, line.y2);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
		ctx.setLineDash([4 / zoom, 4 / zoom]);
		ctx.beginPath();
		ctx.moveTo(line.x1, line.y1);
		ctx.lineTo(line.x2, line.y2);
		ctx.stroke();
		ctx.setLineDash([]);

		// Endpoints
		var r = 3 / zoom;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
		ctx.strokeStyle = 'rgba(40, 40, 40, 0.85)';
		ctx.beginPath();
		ctx.arc(line.x1, line.y1, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(line.x2, line.y2, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * Trim fully transparent edges from a canvas. Returns {canvas, x, y}.
	 */
	trim_canvas_alpha(src) {
		var ctx = src.getContext('2d');
		var img = ctx.getImageData(0, 0, src.width, src.height);
		var data = img.data;
		var top = 0;
		var left = 0;
		var bottom = 0;
		var right = 0;
		var y;
		var x;
		var k;

		main1:
		for (y = 0; y < img.height; y++) {
			for (x = 0; x < img.width; x++) {
				k = (y * img.width + x) * 4;
				if (data[k + 3] > 0) {
					break main1;
				}
			}
			top++;
		}
		main2:
		for (x = 0; x < img.width; x++) {
			for (y = 0; y < img.height; y++) {
				k = (y * img.width + x) * 4;
				if (data[k + 3] > 0) {
					break main2;
				}
			}
			left++;
		}
		main3:
		for (y = img.height - 1; y >= 0; y--) {
			for (x = img.width - 1; x >= 0; x--) {
				k = (y * img.width + x) * 4;
				if (data[k + 3] > 0) {
					break main3;
				}
			}
			bottom++;
		}
		main4:
		for (x = img.width - 1; x >= 0; x--) {
			for (y = img.height - 1; y >= 0; y--) {
				k = (y * img.width + x) * 4;
				if (data[k + 3] > 0) {
					break main4;
				}
			}
			right++;
		}

		var w = src.width - left - right;
		var h = src.height - top - bottom;
		if (w < 1 || h < 1 || (left === 0 && top === 0 && right === 0 && bottom === 0)) {
			return { canvas: src, x: 0, y: 0 };
		}
		var out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		out.getContext('2d').drawImage(src, left, top, w, h, 0, 0, w, h);
		return { canvas: out, x: left, y: top };
	}

	normalize_angle(deg) {
		var a = deg % 360;
		if (a < 0) {
			a += 360;
		}
		return a;
	}

	/**
	 * Rotate the whole document by angle_deg around the canvas center,
	 * expand canvas to fit, bake image-layer pixels, re-fit crop.
	 */
	async apply_document_straighten(angle_deg, opts) {
		opts = opts || {};
		var angle = Number(angle_deg);
		if (!isFinite(angle) || Math.abs(angle) < 0.001) {
			return false;
		}

		var W = config.WIDTH;
		var H = config.HEIGHT;
		var rad = angle * Math.PI / 180;
		var cos = Math.cos(rad);
		var sin = Math.sin(rad);
		var new_W = Math.max(1, Math.ceil(Math.abs(W * cos) + Math.abs(H * sin)));
		var new_H = Math.max(1, Math.ceil(Math.abs(W * sin) + Math.abs(H * cos)));

		var actions = [];
		actions.push(new app.Actions.Prepare_canvas_action('undo'));

		for (var i in config.layers) {
			var layer = config.layers[i];
			if (layer.type == null) {
				continue;
			}

			if (layer.type === 'image' && layer.link) {
				var canvas = document.createElement('canvas');
				canvas.width = new_W;
				canvas.height = new_H;
				var ctx = canvas.getContext('2d');
				ctx.translate(new_W / 2, new_H / 2);
				ctx.rotate(rad);
				ctx.translate(-W / 2, -H / 2);
				// Draw current visual (position + existing layer.rotate)
				this.Base_layers.render_object(ctx, layer);

				var trimmed = this.trim_canvas_alpha(canvas);
				actions.push(
					new app.Actions.Update_layer_image_action(trimmed.canvas, layer.id)
				);
				actions.push(
					new app.Actions.Update_layer_action(layer.id, {
						x: trimmed.x,
						y: trimmed.y,
						width: trimmed.canvas.width,
						height: trimmed.canvas.height,
						width_original: trimmed.canvas.width,
						height_original: trimmed.canvas.height,
						rotate: 0,
					})
				);
				continue;
			}

			// Vector / text / shapes: rotate around document center + add angle
			if (layer.x != null && layer.y != null && layer.width != null && layer.height != null) {
				var lcx = layer.x + layer.width / 2;
				var lcy = layer.y + layer.height / 2;
				var nlx = (lcx - W / 2) * cos - (lcy - H / 2) * sin + new_W / 2;
				var nly = (lcx - W / 2) * sin + (lcy - H / 2) * cos + new_H / 2;
				var update = {
					x: Math.round(nlx - layer.width / 2),
					y: Math.round(nly - layer.height / 2),
				};
				if (layer.rotate != null) {
					update.rotate = this.normalize_angle((layer.rotate || 0) + angle);
				}
				actions.push(new app.Actions.Update_layer_action(layer.id, update));
			}
		}

		actions.push(
			new app.Actions.Update_config_action({
				WIDTH: new_W,
				HEIGHT: new_H,
			})
		);
		actions.push(new app.Actions.Prepare_canvas_action('do'));

		await app.State.do_action(
			new app.Actions.Bundle_action('crop_straighten', 'Crop Straighten', actions)
		);

		this.session_angle = Math.round((this.session_angle + angle) * 10) / 10;
		// Options bar: explicit ui_angle (manual field) or last delta (line straighten)
		var display;
		if (opts.ui_angle != null && isFinite(opts.ui_angle)) {
			display = Math.round(Number(opts.ui_angle) * 10) / 10;
		}
		else {
			display = Math.round(angle * 10) / 10;
		}
		display = Math.max(-45, Math.min(45, display));
		this.ui_angle = display;
		this.sync_angle_attribute(display);

		this.sync_selection_settings();
		this.apply_initial_crop();
		return true;
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		this.sync_selection_settings();
		this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));
		this.is_moving_selection = false;
		this.move_start = null;

		// Straighten: draw a reference line instead of creating/moving crop
		if (this.is_straighten_armed()) {
			this.straighten_line = {
				x1: mouse.x,
				y1: mouse.y,
				x2: mouse.x,
				y2: mouse.y,
			};
			config.need_render = true;
			return;
		}

		// Hit test resize handles first (forces the lock synchronously - the
		// global document pointerdown listener that normally does this runs
		// after this tool's own mousedown, which is too late to check here).
		this.Base_selection.selected_object_actions(e);

		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		// Drag inside existing crop moves it (PS-like)
		if (this.point_in_selection(mouse.x, mouse.y)) {
			this.is_moving_selection = true;
			this.move_start = {
				mouse_x: mouse.x,
				mouse_y: mouse.y,
				sel_x: this.selection.x,
				sel_y: this.selection.y,
			};
			return;
		}

		// Create new selection
		this.Base_selection.set_selection(mouse.x, mouse.y, 0, 0);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}

		if (this.straighten_line) {
			this.straighten_line.x2 = mouse.x;
			this.straighten_line.y2 = mouse.y;
			config.need_render = true;
			return;
		}

		if (this.Base_selection.mouse_lock !== null) {
			return;
		}

		if (this.is_moving_selection && this.move_start) {
			var dx = mouse.x - this.move_start.mouse_x;
			var dy = mouse.y - this.move_start.mouse_y;
			var w = this.selection.width;
			var h = this.selection.height;
			var nx = this.move_start.sel_x + dx;
			var ny = this.move_start.sel_y + dy;
			nx = Math.max(0, Math.min(nx, config.WIDTH - w));
			ny = Math.max(0, Math.min(ny, config.HEIGHT - h));
			this.selection.x = nx;
			this.selection.y = ny;
			config.need_render = true;
			return;
		}

		var width = mouse.x - mouse.click_x;
		var height = mouse.y - mouse.click_y;

		var ratio = this.get_aspect_ratio();
		// Free + Ctrl/Cmd locks to document aspect (legacy behavior)
		if (ratio == null && (e.ctrlKey == true || e.metaKey)) {
			ratio = config.WIDTH / config.HEIGHT;
		}
		if (ratio != null) {
			var constrained = this.apply_ratio_to_drag(width, height, ratio);
			width = constrained.width;
			height = constrained.height;
		}

		this.Base_selection.set_selection(null, null, width, height);
	}

	async mouseup(e) {
		var mouse = this.get_mouse_info(e);

		if (this.straighten_line) {
			var line = this.straighten_line;
			this.straighten_line = null;
			// straighten_line implies mousedown already passed click_valid (same pattern as Move in-progress resize).
			var len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
			if (len < 4) {
				// Too short — cancel line, stay armed
				config.need_render = true;
				return;
			}
			var correction = this.line_to_straighten_angle(line.x1, line.y1, line.x2, line.y2);
			// Disarm straighten mode after a successful line (PS-like one-shot)
			this.set_straighten_armed(false);
			this.sync_selection_settings();
			if (Math.abs(correction) < 0.05) {
				alertify.success('Already straight');
				config.need_render = true;
				return;
			}
			await this.apply_document_straighten(correction);
			return;
		}

		if (mouse.click_valid == false) {
			this.is_moving_selection = false;
			this.move_start = null;
			return;
		}

		if (this.is_moving_selection) {
			this.is_moving_selection = false;
			this.move_start = null;
			if (this.selection.width != null && this.selection.width != 0) {
				app.State.do_action(
					new app.Actions.Set_selection_action(this.selection.x, this.selection.y, this.selection.width, this.selection.height, this.mousedown_selection)
				);
			}
			return;
		}

		var width = mouse.x - this.selection.x;
		var height = mouse.y - this.selection.y;

		if (width == 0 || height == 0) {
			// Click without drag: keep / restore full-document crop
			if (this.mousedown_selection && this.mousedown_selection.width) {
				this.selection.x = this.mousedown_selection.x;
				this.selection.y = this.mousedown_selection.y;
				this.selection.width = this.mousedown_selection.width;
				this.selection.height = this.mousedown_selection.height;
			}
			else {
				this.apply_initial_crop();
			}
			config.need_render = true;
			return;
		}

		if (this.selection.width != null) {
			//make sure coords not negative
			var details = this.selection;
			var x = details.x;
			var y = details.y;
			if (details.width < 0) {
				x = x + details.width;
			}
			if (details.height < 0) {
				y = y + details.height;
			}
			this.selection = {
				x: x,
				y: y,
				width: Math.abs(details.width),
				height: Math.abs(details.height),
			};
		}

		//control boundaries
		if (this.selection.x < 0) {
			this.selection.width += this.selection.x;
			this.selection.x = 0;
		}
		if (this.selection.y < 0) {
			this.selection.height += this.selection.y;
			this.selection.y = 0;
		}
		if (this.selection.x + this.selection.width > config.WIDTH) {
			this.selection.width = config.WIDTH - this.selection.x;
		}
		if (this.selection.y + this.selection.height > config.HEIGHT) {
			this.selection.height = config.HEIGHT - this.selection.y;
		}

		app.State.do_action(
			new app.Actions.Set_selection_action(this.selection.x, this.selection.y, this.selection.width, this.selection.height, this.mousedown_selection)
		);
	}

	keydown(event) {
		if (config.TOOL.name != this.name) {
			return;
		}
		var key = event.key;
		if (key === 'Enter') {
			event.preventDefault();
			this.commit_crop();
			return;
		}
		if (key === 'Escape') {
			event.preventDefault();
			if (this.straighten_line) {
				this.straighten_line = null;
				config.need_render = true;
				return;
			}
			if (this.is_straighten_armed()) {
				this.set_straighten_armed(false);
				this.sync_selection_settings();
				return;
			}
			this.cancel_selection();
		}
	}

	dblclick(e) {
		if (config.TOOL.name != this.name) {
			return;
		}
		if (this.is_straighten_armed()) {
			return;
		}
		var mouse = this.get_mouse_info(e);
		if (!mouse || mouse.click_valid == false) {
			return;
		}
		if (this.point_in_selection(mouse.x, mouse.y)) {
			e.preventDefault();
			this.commit_crop();
		}
	}

	cancel_selection() {
		// Escape while Crop is active: reset to a fresh full-document (aspect-aware) crop
		this.sync_selection_settings();
		this.apply_initial_crop();
	}

	render(ctx, layer) {
		//nothing
	}

	/**
	 * Attribute changes: aspect / guides / straighten / angle; Commit Crop runs crop.
	 */
	async on_params_update(data) {
		var key = data && data.key;

		if (key === 'aspect' || key === 'ratio_w' || key === 'ratio_h') {
			if (key === 'aspect') {
				this.sync_custom_ratio_visibility();
			}
			this.sync_selection_settings();
			this.constrain_existing_selection();
			return;
		}
		if (key === 'guides') {
			this.sync_selection_settings();
			return;
		}
		if (key === 'straighten') {
			this.straighten_mode = this.is_straighten_armed();
			this.straighten_line = null;
			this.sync_selection_settings();
			if (this.straighten_mode) {
				alertify.success('Draw a line along the horizon or edge to straighten');
			}
			return;
		}
		if (key === 'angle') {
			if (this._applying_angle_ui) {
				return;
			}
			var params = this.getParams();
			var target = (params.angle && typeof params.angle === 'object')
				? Number(params.angle.value)
				: Number(params.angle);
			if (!isFinite(target)) {
				return;
			}
			var delta = target - this.ui_angle;
			if (Math.abs(delta) < 0.001) {
				return;
			}
			await this.apply_document_straighten(delta, { ui_angle: target });
			return;
		}

		// Commit Crop button (or legacy crop toggle)
		if (key && key !== 'commit_crop' && key !== 'crop') {
			return;
		}

		params = this.getParams();
		if (params.commit_crop !== undefined) {
			params.commit_crop = true;
		}
		if (params.crop !== undefined) {
			params.crop = true;
		}
		this.GUI_tools.show_action_attributes();

		await this.commit_crop();
	}

	/**
	 * do actual crop
	 */
	async commit_crop() {
		var selection = this.selection;

		if (selection.width == null || selection.width == 0 || selection.height == 0) {
			alertify.error('Empty selection');
			return;
		}

		//check for rotation
		var rotated_name = false;
		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;

			if (link.rotate > 0) {
				rotated_name = link.name;
				break;
			}
		}
		if (rotated_name !== false) {
			alertify.error('Crop on rotated layer is not supported. Convert it to raster to continue.' + '(' + rotated_name + ')');
			return;
		}

		//controll boundaries
		selection.x = Math.max(selection.x, 0);
		selection.y = Math.max(selection.y, 0);
		selection.width = Math.min(selection.width, config.WIDTH);
		selection.height = Math.min(selection.height, config.HEIGHT);

		let actions = [];

		for (var i in config.layers) {
			var link = config.layers[i];
			if (link.type == null)
				continue;

			let x = link.x;
			let y = link.y;
			let width = link.width;
			let height = link.height;
			let width_original = link.width_original;
			let height_original = link.height_original;

			//move
			x -= parseInt(selection.x);
			y -= parseInt(selection.y);

			if (link.type == 'image') {
				//also remove unvisible data
				let left = 0;
				if (x < 0)
					left = -x;
				let top = 0;
				if (y < 0)
					top = -y;
				let right = 0;
				if (x + width > selection.width)
					right = x + width - selection.width;
				let bottom = 0;
				if (y + height > selection.height)
					bottom = y + height - selection.height;
				let crop_width = width - left - right;
				let crop_height = height - top - bottom;

				//if image was streched
				let width_ratio = (width / width_original);
				let height_ratio = (height / height_original);

				//create smaller canvas
				let canvas = document.createElement('canvas');
				let ctx = canvas.getContext("2d");
				canvas.width = crop_width / width_ratio;
				canvas.height = crop_height / height_ratio;

				//cut required part
				ctx.translate(-left / width_ratio, -top / height_ratio);
				canvas.getContext("2d").drawImage(link.link, 0, 0);
				ctx.translate(0, 0);
				actions.push(
					new app.Actions.Update_layer_image_action(canvas, link.id)
				);

				//update attributes
				width = Math.ceil(canvas.width * width_ratio);
				height = Math.ceil(canvas.height * height_ratio);
				x += left;
				y += top;
				width_original = canvas.width;
				height_original = canvas.height;
			}

			actions.push(
				new app.Actions.Update_layer_action(link.id, {
					x,
					y,
					width,
					height,
					width_original,
					height_original
				})
			);
		}

		actions.push(
			new app.Actions.Prepare_canvas_action('undo'),
			new app.Actions.Update_config_action({
				WIDTH: parseInt(selection.width),
				HEIGHT: parseInt(selection.height)
			}),
			new app.Actions.Prepare_canvas_action('do'),
			new app.Actions.Reset_selection_action(this.selection)
		);
		await app.State.do_action(
			new app.Actions.Bundle_action('crop_tool', 'Crop Tool', actions)
		);

		// Stay on Crop with a fresh full-document rect ready to adjust
		this.session_angle = 0;
		this.ui_angle = 0;
		this.sync_angle_attribute(0);
		this.sync_selection_settings();
		this.apply_initial_crop();
	}

	on_activate() {
		this.straighten_line = null;
		this.straighten_mode = false;
		this.session_angle = 0;
		this.ui_angle = 0;
		var params = this.getParams();
		if (params.straighten && typeof params.straighten === 'object') {
			params.straighten.value = false;
		}
		if (params.angle && typeof params.angle === 'object') {
			params.angle.value = 0;
		}
		this.sync_custom_ratio_visibility();
		this.sync_selection_settings();
		this.apply_initial_crop();
		return [];
	}

	on_leave() {
		this.straighten_line = null;
		this.straighten_mode = false;
		return [
			new app.Actions.Reset_selection_action(this.selection)
		];
	}

}

export default Crop_class;
