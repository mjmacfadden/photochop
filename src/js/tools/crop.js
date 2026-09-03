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
		config.need_render = true;
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

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		this.sync_selection_settings();
		this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));
		this.is_moving_selection = false;
		this.move_start = null;

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

	mouseup(e) {
		var mouse = this.get_mouse_info(e);

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
			this.cancel_selection();
		}
	}

	dblclick(e) {
		if (config.TOOL.name != this.name) {
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
	 * Attribute changes: aspect / guides update settings; Commit Crop runs crop.
	 */
	async on_params_update(data) {
		var key = data && data.key;

		if (key === 'aspect' || key === 'ratio_w' || key === 'ratio_h') {
			this.sync_selection_settings();
			this.constrain_existing_selection();
			return;
		}
		if (key === 'guides') {
			this.sync_selection_settings();
			return;
		}

		// Commit Crop button (or legacy crop toggle)
		if (key && key !== 'commit_crop' && key !== 'crop') {
			return;
		}

		var params = this.getParams();
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
		this.sync_selection_settings();
		this.apply_initial_crop();
	}

	on_activate() {
		this.sync_selection_settings();
		this.apply_initial_crop();
		return [];
	}

	on_leave() {
		return [
			new app.Actions.Reset_selection_action(this.selection)
		];
	}

}

export default Crop_class;
