import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';
import GUI_tools_class from './../core/gui/gui-tools.js';
import Helper_class from './../libs/helpers.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

class Selection_class extends Base_tools_class {

	constructor(ctx) {
		super();

		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		var _this = this;

		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.ctx = ctx;
		this.name = 'selection';
		this.type = null;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
		this.selection_coords_from = null;
		this.selection_start = null;
		this.shift_key = false;
		this.mode = null;
		this.selection = {
			x: null,
			y: null,
			width: null,
			height: null,
			shape: 'rect',
			path: null,
			regions: null,
			active_region: null,
		};

		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			marching_ants_mode: true,
			data_function: function () {
				return _this.selection;
			},
		};
		this.mousedown_selection = null;
		this.Base_selection = new Base_selection_class(ctx, sel_config, this.name);
		this.GUI_tools = new GUI_tools_class();
	}

	/**
	 * returns the active marquee shape: 'rect' | 'ellipse' | 'lasso'
	 */
	get_shape() {
		for (var i in config.TOOLS) {
			if (config.TOOLS[i].name == 'selection' && config.TOOLS[i].tool_group != null
				&& config.TOOLS[i].tool_group.active_shape != null) {
				return config.TOOLS[i].tool_group.active_shape;
			}
		}
		return 'rect';
	}

	load() {
		var _this = this;

		//mouse events
		document.addEventListener('mousedown', function (event) {
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('mouseup', function (event) {
			_this.dragEnd(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('touchend', function (event) {
			_this.dragEnd(event);
		});

		document.addEventListener('keydown', (e) => {
			var code = e.keyCode;
			if (this.Helper.is_input(e.target))
				return;

			if (code == 27) {
				//escape - clear the (persistent) selection
				if (this.selection.width != null && this.selection.height != null) {
					this.clear_selection();
				}
			}
			if (code == 46) {
				//delete - delete the selected area
				if (this.selection.width != null && this.selection.height != null) {
					this.delete_selection();
				}
			}
			if (code == 65 && (e.ctrlKey == true || e.metaKey)) {
				//A
				e.preventDefault();
				this.select_all();
			}
			if (code == 68 && (e.ctrlKey == true || e.metaKey)) {
				//Ctrl+D - deselect
				e.preventDefault();
				this.clear_selection();
			}
			if (code >= 37 && code <= 40 && config.TOOL.name == this.name
				&& this.selection.width != null && this.selection.height != null) {
				//arrow keys - nudge selection
				e.preventDefault();
				var step = e.shiftKey ? 10 : 1;
				var dx = 0;
				var dy = 0;
				if (code == 37)
					dx = -step;
				else if (code == 39)
					dx = step;
				else if (code == 38)
					dy = -step;
				else if (code == 40)
					dy = step;
				this.translate_selection(dx, dy);
				config.need_render = true;
			}
		}, false);
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousedown(event);
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mousemove(event);
	}

	dragEnd(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		_this.mouseup(event);
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.click_valid == false)
			return;

		var shift = (e.shiftKey == true);
		var alt = (e.altKey == true);

		//selection composition mode (Photoshop style)
		var mode = null;
		if (shift && alt) {
			mode = 'intersect';
		}
		else if (shift) {
			mode = 'add';
		}
		else if (alt) {
			mode = 'subtract';
		}
		this.mode = mode;

		//nobody likes stale preview state
		this.selection.active_region = null;

		var has_selection = this.has_selection_regions()
			&& this.selection.width != null && this.selection.height != null;

		if (mode == null && has_selection && this.point_inside_selection(mouse.x, mouse.y)) {
			//move selection box
			this.type = 'move';
			this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));
			this.selection_start = { x: this.selection.x, y: this.selection.y };
			this.mousedown_regions = JSON.parse(JSON.stringify(this.get_regions(this.selection)));
		}
		else {
			//create a new region (replaces, adds, subtracts or intersects)
			this.type = 'create';
			this.selection_coords_from = { x: mouse.x, y: mouse.y };

			//keep the committed regions when composing, drop them on replace
			var committed = (mode != null) ? this.get_regions(this.selection) : [];

			this.mousedown_selection = JSON.parse(JSON.stringify(this.selection));

			if (this.get_shape() == 'lasso') {
				this.selection = {
					x: mouse.x,
					y: mouse.y,
					width: 0,
					height: 0,
					shape: 'lasso',
					path: [[mouse.x, mouse.y]],
					regions: committed.length ? committed : null,
					active_region: null,
				};
			}
			else {
				this.selection = {
					x: mouse.x,
					y: mouse.y,
					width: 0,
					height: 0,
					shape: this.get_shape(),
					path: null,
					regions: committed.length ? committed : null,
					active_region: null,
				};
			}
		}
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (this.Base_selection.is_drag == false || mouse.is_drag == false)
			return;
		if (e.type == 'mousedown' && (mouse.click_valid == false)) {
			return;
		}
		if (this.selection_coords_from === null && this.type != 'move') {
			return;
		}
		this.shift_key = (e.shiftKey == true);

		if (this.type == 'move') {
			//move whole selection box
			var dx = mouse.x - mouse.click_x;
			var dy = mouse.y - mouse.click_y;
			this.selection.x = this.selection_start.x + dx;
			this.selection.y = this.selection_start.y + dy;
			if (this.selection.regions != null && this.mousedown_regions != null) {
				for (var i = 0; i < this.selection.regions.length; i++) {
					var r = this.selection.regions[i];
					var mr = this.mousedown_regions[i];
					if (mr == null)
						continue;
					r.x = mr.x + dx;
					r.y = mr.y + dy;
					if (r.path != null && mr.path != null) {
						for (var p = 0; p < r.path.length && p < mr.path.length; p++) {
							r.path[p][0] = mr.path[p][0] + dx;
							r.path[p][1] = mr.path[p][1] + dy;
						}
					}
				}
			}
			config.need_render = true;
			return;
		}

		if (this.type == 'create') {
			config.need_render = true;

			if (this.get_shape() == 'lasso') {
				//lasso - collect freehand points
				var points = this.selection.path;
				var last = points[points.length - 1];
				var dx = mouse.x - last[0];
				var dy = mouse.y - last[1];
				if (dx * dx + dy * dy >= 4) {
					points.push([mouse.x, mouse.y]);
				}
				//track bounding box
				this.selection.x = Math.min(this.selection.x, mouse.x);
				this.selection.y = Math.min(this.selection.y, mouse.y);
				var max_x = Math.max(this.selection.x + this.selection.width, mouse.x);
				var max_y = Math.max(this.selection.y + this.selection.height, mouse.y);
				this.selection.width = max_x - this.selection.x;
				this.selection.height = max_y - this.selection.y;
				this.selection.active_region = {
					shape: 'lasso',
					x: this.selection.x,
					y: this.selection.y,
					width: this.selection.width,
					height: this.selection.height,
					path: points,
					mode: this.mode,
				};
				return;
			}

			//rect / ellipse - grow from click point
			var w = Math.round(mouse.x - mouse.click_x);
			var h = Math.round(mouse.y - mouse.click_y);

			if (this.shift_key && this.mode != 'add' && this.mode != 'intersect') {
				//constrain to square / circle
				var size = Math.max(Math.abs(w), Math.abs(h));
				this.selection.width = w < 0 ? -size : size;
				this.selection.height = h < 0 ? -size : size;
			}
			else {
				this.selection.width = w;
				this.selection.height = h;
			}
			this.selection.active_region = {
				shape: this.get_shape(),
				x: this.selection.x,
				y: this.selection.y,
				width: this.selection.width,
				height: this.selection.height,
				path: null,
				mode: this.mode,
			};
		}
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);

		if (!this.Base_selection.is_drag) {
			return;
		}
		if (e.type == 'mousedown' && mouse.click_valid == false) {
			return;
		}

		if (this.type == 'move') {
			//finished moving selection box
			app.State.do_action(
				new app.Actions.Set_selection_action(
					this.selection.x,
					this.selection.y,
					this.selection.width,
					this.selection.height,
					this.mousedown_selection,
					this.selection_data_extra()
				)
			);
			this.type = null;
			this.mode = null;
			this.selection.active_region = null;
			this.mousedown_regions = null;
			return;
		}

		if (this.type != 'create') {
			return;
		}
		this.type = null;

		var mode = this.mode;
		this.mode = null;
		var was_combining = (mode != null);

		var shape = this.get_shape();
		var region = null;

		if (shape == 'lasso') {
			var path = this.selection.path;
			if (path == null || path.length < 3
				|| this.selection.width < 2 || this.selection.height < 2) {
				//too small - cancel
				if (was_combining) {
					this.restore_snapshot();
				}
				else {
					this.clear_selection_from_history();
				}
				return;
			}
			region = {
				shape: 'lasso',
				x: Math.round(this.selection.x),
				y: Math.round(this.selection.y),
				width: Math.round(this.selection.width),
				height: Math.round(this.selection.height),
				path: path,
				mode: mode || 'add',
			};
		}
		else {
			var width = this.selection.width;
			var height = this.selection.height;

			if (width == 0 || height == 0) {
				//cancelled - nothing dragged
				if (was_combining) {
					this.restore_snapshot();
				}
				else {
					this.clear_selection_from_history();
				}
				return;
			}

			if (width == null || height == null) {
				return;
			}

			//make sure coords are not negative
			var x = this.selection.x;
			var y = this.selection.y;
			if (width < 0) {
				x = x + width;
			}
			if (height < 0) {
				y = y + height;
			}
			region = {
				shape: shape,
				x: x,
				y: y,
				width: Math.abs(width),
				height: Math.abs(height),
				path: null,
				mode: mode || 'add',
			};
		}

		//store the new region as the active selection geometry
		this.selection.x = region.x;
		this.selection.y = region.y;
		this.selection.width = region.width;
		this.selection.height = region.height;
		this.selection.shape = region.shape;
		this.selection.path = region.path;
		this.selection.active_region = null;

		if (was_combining) {
			//compose: keep previous regions and append the new one
			var committed = this.get_regions(this.mousedown_selection);
			if (committed.length == 0 && this.selection.regions != null) {
				committed = this.selection.regions;
			}
			committed.push(region);
			this.selection.regions = committed;
		}
		else {
			//fresh selection - replaces anything before it
			this.selection.regions = null;
		}

		app.State.do_action(
			new app.Actions.Set_selection_action(
				this.selection.x,
				this.selection.y,
				this.selection.width,
				this.selection.height,
				this.mousedown_selection,
				this.selection_data_extra()
			)
		);
	}

	/**
	 * adds/removes a line or region geometry translation.
	 */
	translate_selection(dx, dy) {
		this.selection.x += dx;
		this.selection.y += dy;
		if (this.selection.regions != null) {
			for (var i = 0; i < this.selection.regions.length; i++) {
				var r = this.selection.regions[i];
				r.x += dx;
				r.y += dy;
				if (r.path != null) {
					for (var p = 0; p < r.path.length; p++) {
						r.path[p][0] += dx;
						r.path[p][1] += dy;
					}
				}
			}
		}
		else if (this.selection.path != null) {
			for (var p = 0; p < this.selection.path.length; p++) {
				this.selection.path[p][0] += dx;
				this.selection.path[p][1] += dy;
			}
		}
		config.need_render = true;
	}

	/**
	 * undoes the last drag: restores the selection to the state before it
	 */
	restore_snapshot() {
		this.selection = this.mousedown_selection
			|| { x: null, y: null, width: null, height: null, shape: 'rect', path: null, regions: null, active_region: null };
		config.need_render = true;
	}

	/**
	 * returns the committed selection regions. A single simple selection is
	 * wrapped into one add region.
	 */
	get_regions(data) {
		if (data == null)
			return [];
		if (Array.isArray(data.regions))
			return data.regions;
		if (data.x == null || data.y == null || data.width == null || data.height == null)
			return [];
		return [{
			shape: data.shape || 'rect',
			x: data.x,
			y: data.y,
			width: data.width,
			height: data.height,
			path: data.path || null,
			mode: 'add',
		}];
	}

	has_selection_regions() {
		return this.get_regions(this.selection).length > 0;
	}

	/**
	 * returns shape/path/regions extras for history actions
	 */
	selection_data_extra() {
		return {
			shape: this.selection.shape || this.get_shape(),
			path: this.selection.path || null,
			regions: this.selection.regions || null,
		};
	}

	/**
	 * builds the current selection path (rect/ellipse/lasso) in world coordinates.
	 */
	build_selection_path(ctx, data) {
		data = data || this.selection;
		if (data == null || data.x == null || data.y == null || data.width == null || data.height == null)
			return;
		this.Base_selection.build_selection_path(ctx, data);
	}

	point_in_polygon(x, y, vertices) {
		var inside = false;
		for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			var xi = vertices[i][0];
			var yi = vertices[i][1];
			var xj = vertices[j][0];
			var yj = vertices[j][1];
			if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
				inside = !inside;
			}
		}
		return inside;
	}

	point_inside_shape(x, y, data) {
		data = data || this.selection;
		if (data == null || data.x == null || data.width == null)
			return false;

		var shape = data.shape || 'rect';
		if (shape == 'ellipse') {
			var rx = Math.abs(data.width) / 2;
			var ry = Math.abs(data.height) / 2;
			if (rx == 0 || ry == 0)
				return false;
			var nx = (x - (data.x + data.width / 2)) / rx;
			var ny = (y - (data.y + data.height / 2)) / ry;
			return (nx * nx + ny * ny) <= 1;
		}
		if (shape == 'lasso' && data.path != null && data.path.length > 2) {
			return this.point_in_polygon(x, y, data.path);
		}
		return x >= data.x && x <= data.x + data.width && y >= data.y && y <= data.y + data.height;
	}

	/**
	 * true when the point is inside any committed selection region
	 * (subtract regions are holes and never start a move).
	 */
	point_inside_selection(x, y) {
		var regions = this.get_regions(this.selection);
		for (var i = 0; i < regions.length; i++) {
			var r = regions[i];
			if (r.mode == 'subtract')
				continue;
			if (this.point_inside_shape(x, y, r))
				return true;
		}
		return false;
	}

	select_all() {
		let actions = [];

		if (config.TOOL.name != this.name) {
			actions.push(
				new app.Actions.Activate_tool_action(this.name)
			);
		}
		actions.push(
			new app.Actions.Set_selection_action(0, 0, config.WIDTH, config.HEIGHT, this.selection,
				{ shape: 'rect', path: null, regions: null })
		);
		app.State.do_action(
			new app.Actions.Bundle_action('select_all', 'Select All', actions)
		);
	}

	render(ctx, layer) {
		//nothing
	}

	/**
	 * creates a canvas whose opaque white pixels equal the committed selection
	 * interior, mapped from world coordinates into the given space.
	 * Used to clear multi-region selections out of raster layers.
	 */
	create_selection_mask_canvas(width, height, layer) {
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(width));
		canvas.height = Math.max(1, Math.round(height));
		var ctx = canvas.getContext('2d');

		var regions = this.get_regions(this.selection);
		if (!regions.length)
			return canvas;

		var ow = layer.width_original;
		var oh = layer.height_original;
		var ratio_w = (layer.width || ow) / ow;
		var ratio_h = (layer.height || oh) / oh;

		ctx.save();
		ctx.translate(-(layer.x || 0), -(layer.y || 0));
		ctx.scale(1 / ratio_w, 1 / ratio_h);
		ctx.globalCompositeOperation = 'source-over';

		//union of all add / intersect regions
		ctx.beginPath();
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			this.Base_selection._build_shape_path(ctx, regions[i]);
		}
		ctx.fillStyle = '#ffffff';
		ctx.fill();

		//subtract regions carve holes
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'subtract')
				continue;
			ctx.beginPath();
			this.build_selection_path(ctx, regions[i]);
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fill();
		}

		ctx.restore();
		return canvas;
	}

	delete_selection() {
		var layer = config.layer;

		if (config.layer.type != 'image') {
			alertify.error('This layer must contain an image. Please convert it to raster to apply this tool.');
			return;
		}

		var regions = this.get_regions(this.selection);
		if (!regions.length) {
			alertify.error('Nothing is selected.');
			return;
		}

		this.init_tmp_canvas();

		var ow = layer.width_original;
		var oh = layer.height_original;
		var lw = layer.width || ow;
		var lh = layer.height || oh;
		var ratio_w = lw / ow;
		var ratio_h = lh / oh;

		var simple = (regions.length == 1);
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'add' && regions[i].mode != null) {
				simple = false;
				break;
			}
		}

		if (simple) {
			var selection = regions[0];
			var shape = selection.shape || 'rect';
			if (shape == 'rect') {
				//rectangle - simple clear
				var mouse_x = (selection.x - layer.x) / ratio_w;
				var mouse_y = (selection.y - layer.y) / ratio_h;
				this.tmpCanvasCtx.clearRect(mouse_x, mouse_y, selection.width / ratio_w, selection.height / ratio_h);
			}
			else {
				//ellipse / lasso - clear only inside the shape
				this.tmpCanvasCtx.save();
				this.tmpCanvasCtx.translate(-layer.x, -layer.y);
				this.tmpCanvasCtx.scale(1 / ratio_w, 1 / ratio_h);
				this.build_selection_path(this.tmpCanvasCtx, selection);
				this.tmpCanvasCtx.clip();
				this.tmpCanvasCtx.clearRect(0, 0, ow, oh);
				this.tmpCanvasCtx.restore();
			}
		}
		else {
			//multi-region or composed selection - raster mask clears add-union minus subtract
			var mask = this.create_selection_mask_canvas(ow, oh, layer);
			this.tmpCanvasCtx.globalCompositeOperation = 'destination-out';
			this.tmpCanvasCtx.drawImage(mask, 0, 0);
			this.tmpCanvasCtx.globalCompositeOperation = 'source-over';
			mask.width = 1;
			mask.height = 1;
		}

		app.State.do_action(
			new app.Actions.Bundle_action('delete_selection', 'Delete Selection', [
				new app.Actions.Update_layer_image_action(this.tmpCanvas),
				new app.Actions.Reset_selection_action(this.selection)
			])
		);

		this.reset_tmp_canvas();
		delete config.layer.link_canvas;
	}

	init_tmp_canvas() {
		this.tmpCanvas = document.createElement('canvas');
		this.tmpCanvasCtx = this.tmpCanvas.getContext("2d");
		this.tmpCanvas.width = config.layer.width_original;
		this.tmpCanvas.height = config.layer.height_original;
		this.tmpCanvasCtx.drawImage(config.layer.link, 0, 0);
	}

	/**
	 * keeps the selection alive while switching tools - it only goes away
	 * when explicitly cleared (Escape / Ctrl+D / new selection outside).
	 */
	on_leave() {
		delete config.layer.link_canvas;
		this.reset_tmp_canvas();
		return [];
	}

	clear_selection_actions() {
		return [new app.Actions.Reset_selection_action(this.selection)];
	}

	clear_selection_from_history() {
		app.State.do_action(
			new app.Actions.Bundle_action('clear_selection', 'Clear Selection', this.clear_selection_actions())
		);
	}

	clear_selection() {
		this.clear_selection_from_history();
	}

	reset_tmp_canvas() {
		if (this.tmpCanvas == null)
			return;
		this.tmpCanvas.width = 1;
		this.tmpCanvas.height = 1;
		this.tmpCanvas = null;
		this.tmpCanvasCtx = null;
	}

}
;
export default Selection_class;