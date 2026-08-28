/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../config.js';
import zoomView from './../libs/zoomView.js';

var instance = null;
var settings_all = [];

const handle_size = 8;

//Rotate cursor - used when hovering just outside the selection bounds.
//The URL is resolved relative to the document root (see layout.css icon refs).
const ROTATE_CURSOR = "url('images/icons/rotate.svg') 12 12, default";

//Thickness (in screen px) of the rotation ring just outside the layer bounds.
const rotate_zone = 12;

const DRAG_TYPE_TOP = 1;
const DRAG_TYPE_BOTTOM = 2;
const DRAG_TYPE_LEFT = 4;
const DRAG_TYPE_RIGHT = 8;

/**
 * Selection class - draws rectangular selection on canvas, can be resized.
 */
class Base_selection_class {

	/**
	 * settings:
	 * - enable_background
	 * - enable_borders
	 * - enable_controls
	 * - enable_rotation
	 * - enable_move
	 * - keep_ratio
	 * 
	 * @param {ctx} ctx
	 * @param {object} settings
	 * @param {string|null} key
	 */
	constructor(ctx, settings, key = null) {
		if (key != null) {
			settings_all[key] = settings;
		}

		//singleton
		if (instance) {
			return instance;
		}
		instance = this;

		this.ctx = ctx;
		this.mouse_lock = null;
		this.selected_obj_positions = {};
		this.selected_object_drag_type = null;
		this.click_details = {};
		this.is_touch = false;
		// True if dragging from inside canvas area
		this.is_drag = false;
		this.current_angle = null;
		// state captured when a rotate drag starts (for relative rotation)
		this.rotate_drag = null;
		// marching ants animation state
		this.ant_offset = 0;
		this.ant_keep_rendering = false;

		this.events();
	}

	events() {
		document.addEventListener('mousedown', (e) => {
			this.is_drag = false;
			if(this.is_touch == true)
				return;
			if (!e.target.closest('#main_wrapper'))
				return;
			this.is_drag = true;
			this.selected_object_actions(e);
		});
		document.addEventListener('mousemove', (e) => {
			if(this.is_touch == true)
				return;
			this.selected_object_actions(e);
		});
		document.addEventListener('mouseup', (e) => {
			if(this.is_touch == true)
				return;
			this.selected_object_actions(e);
		});

		// touch
		document.addEventListener('touchstart', (event) => {
			this.is_drag = false;
			this.is_touch = true;
			if (!event.target.closest('#main_wrapper'))
				return;
			this.is_drag = true;
			this.selected_object_actions(event);
		});
		document.addEventListener('touchmove', (event) => {
			this.selected_object_actions(event);
		}, {passive: false});
		document.addEventListener('touchend', (event) => {
			this.selected_object_actions(event);
		});
	}

	set_selection(x, y, width, height) {
		var settings = this.find_settings();

		if (x != null)
			settings.data.x = x;
		if (y != null)
			settings.data.y = y;
		if (width != null)
			settings.data.width = width;
		if (height != null)
			settings.data.height = height;
		config.need_render = true;
	}

	reset_selection() {
		var settings = this.find_settings();

		settings.data = {
			x: null,
			y: null,
			width: null,
			height: null,
		};
		config.need_render = true;
	}

	get_selection() {
		var settings = this.find_settings();

		return settings.data;
	}

	find_settings() {
		var current_key = config.TOOL.name;
		var settings = null;

		for (var i in settings_all) {
			if (i == current_key)
				settings = settings_all[i];
		}

		//default
		if (settings === null) {
			settings = settings_all['main'];
		}

		//find data
		settings.data = (settings.data_function).call();

		return settings;
	}

	/**
	 * marks object as selected, and draws corners
	 */
	draw_selection() {
		var settings = this.find_settings();
		var data = settings.data;

		//always clear the transform overlay so stray handles never linger.
		//clear under identity - the overlay transform may be left over from
		//the previous frame's drawing
		var overlay_el = document.getElementById('canvas_overlay');
		var overlay_ctx = null;
		if (overlay_el != null) {
			overlay_ctx = overlay_el.getContext('2d');
			overlay_ctx.setTransform(1, 0, 0, 1, 0, 0);
			overlay_ctx.clearRect(0, 0, overlay_el.width, overlay_el.height);
		}

		//draw every persistent marching-ants selection - they stay visible
		//even when another tool (brush, pencil, fill, ...) is active
		var marquees = this.get_marquee_selections();
		if (marquees.length) {
			this.ctx.save();
			this.ctx.globalAlpha = 1;
			for (var m = 0; m < marquees.length; m++) {
				this.draw_marching_ants(marquees[m].data);
			}
			this.ctx.restore();
			this.ant_keep_rendering = true;
		}

		//the active tool is a marching-ants one - box controls are not needed
		if (settings.marching_ants_mode === true) {
			return;
		}

		if (settings.data === null || settings.data.status == 'draft'
			|| (settings.data.hide_selection_if_active === true && settings.data.type == config.TOOL.name)) {
			return;
		}

		//locked layers never show transform controls
		if (settings.data.locked === true) {
			return;
		}

		var x = settings.data.x;
		var y = settings.data.y;
		var w = settings.data.width;
		var h = settings.data.height;

		if (x == null || y == null || w == null || h == null) {
			//not supported 
			return;
		}

		var block_size_default = handle_size / config.ZOOM;

		//NOTE: x/y/w/h are intentionally NOT rounded - rounding at non-1 zoom
		//shifts the bounding box off the layer's pixel edges, introducing
		//padding/misalignment when zooming.

		var block_size = block_size_default;
		var corner_offset = (block_size / 2.4);
		var middle_offset = (block_size / 1.9);

		this.ctx.save();
		this.ctx.globalAlpha = 1;

		//draw the transform controls (box + handles) on the dedicated overlay
		//canvas, which is larger than the document, so they stay visible even
		//when the layer extends past the canvas edge. The overlay origin is
		//shifted by TRANSFORM_MARGIN to line up with the document origin.
		var main_ctx = this.ctx;
		if (overlay_ctx != null) {
			this.ctx = overlay_ctx;
			var mm = zoomView.matrix;
			this.ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4] + config.TRANSFORM_MARGIN, mm[5] + config.TRANSFORM_MARGIN);
		}

		let isRotated = false;
		if (data.rotate != null && data.rotate != 0) {
			//rotate
			isRotated = true;
			this.ctx.translate(data.x + data.width / 2, data.y + data.height / 2);
			this.ctx.rotate(data.rotate * Math.PI / 180);
			x = -data.width / 2;
			y = -data.height / 2;
		}

		//fill
		if (settings.enable_background == true) {
			this.ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
			this.ctx.fillRect(x, y, w, h);
		}

		const wholeLineWidth = 2 / config.ZOOM;
		const halfLineWidth = wholeLineWidth / 2;

		//borders - centered on the layer bounds so no padding is added
		if (settings.enable_borders == true && (x != 0 || y != 0 || w != config.WIDTH || h != config.HEIGHT)) {
			this.ctx.lineWidth = wholeLineWidth;
			this.ctx.strokeStyle = '#3f8ff7';
			this.ctx.strokeRect(x, y, w, h);
		}

		//show crop lines
		if(settings.crop_lines === true){

			for(var part = 1; part < 3; part++) {
				this.ctx.lineWidth = wholeLineWidth;
				this.ctx.strokeStyle = 'rgb(255, 255, 255)';
				this.ctx.beginPath();
				this.ctx.moveTo(x + w / 3 * part - halfLineWidth, y);
				this.ctx.lineTo(x + w / 3 * part - halfLineWidth, y + h);
				this.ctx.stroke();

				this.ctx.lineWidth = halfLineWidth;
				this.ctx.strokeStyle = 'rgb(0, 0, 0)';
				this.ctx.beginPath();
				this.ctx.moveTo(x + w / 3 * part - halfLineWidth, y);
				this.ctx.lineTo(x + w / 3 * part - halfLineWidth, y + h);
				this.ctx.stroke();
			}

			for(var part = 1; part < 3; part++) {
				this.ctx.lineWidth = wholeLineWidth;
				this.ctx.strokeStyle = 'rgb(255, 255, 255)';
				this.ctx.beginPath();
				this.ctx.moveTo(x, y + h / 3 * part - halfLineWidth);
				this.ctx.lineTo(x + w, y + h / 3 * part - halfLineWidth);
				this.ctx.stroke();

				this.ctx.lineWidth = halfLineWidth;
				this.ctx.strokeStyle = 'rgb(0, 0, 0)';
				this.ctx.beginPath();
				this.ctx.moveTo(x, y + h / 3 * part - halfLineWidth);
				this.ctx.lineTo(x + w, y + h / 3 * part - halfLineWidth);
				this.ctx.stroke();
			}
		}

		const hitsLeftEdge = isRotated ? false : x < handle_size;
		const hitsTopEdge = isRotated ? false : y < handle_size;
		const hitsRightEdge = isRotated ? false : x + w > config.WIDTH - handle_size;
		const hitsBottomEdge = isRotated ? false : y + h > config.HEIGHT - handle_size;

		//draw corners - square handles with blue outline, white fill
		var corner = (x, y, dx, dy, drag_type, cursor) => {
			this.ctx.strokeStyle = "#3f8ff7";
			this.ctx.fillStyle = "#ffffff";
			this.ctx.lineWidth = 1 / config.ZOOM;

			var center_x = x + dx * block_size;
			var center_y = y + dy * block_size;
			var half = block_size / 2;

			//create path
			const path = new Path2D();
			path.rect(center_x - half, center_y - half, block_size, block_size);

			//draw
			this.ctx.fill(path);
			this.ctx.stroke(path);

			//register position
			this.selected_obj_positions[drag_type] = {
				cursor: cursor,
				path: path,
			};
		};

		//stack (custom) - rotation activated by hovering just outside the layer,
		//so no dedicated rotation handle is drawn
		if (settings.enable_controls == true) {
			corner(x - corner_offset - wholeLineWidth, y - corner_offset - wholeLineWidth, hitsLeftEdge ? 0.5 : 0, hitsTopEdge ? 0.5 : 0, DRAG_TYPE_LEFT | DRAG_TYPE_TOP, 'nwse-resize');
			corner(x + w + corner_offset + wholeLineWidth, y - corner_offset - wholeLineWidth, hitsRightEdge ? -0.5 : 0, hitsTopEdge ? 0.5 : 0, DRAG_TYPE_RIGHT | DRAG_TYPE_TOP, 'nesw-resize');
			corner(x - corner_offset - wholeLineWidth, y + h + corner_offset + wholeLineWidth, hitsLeftEdge ? 0.5 : 0, hitsBottomEdge ? -0.5 : 0, DRAG_TYPE_LEFT | DRAG_TYPE_BOTTOM, 'nesw-resize');
			corner(x + w + corner_offset + wholeLineWidth, y + h + corner_offset + wholeLineWidth, hitsRightEdge ? -0.5 : 0, hitsBottomEdge ? -0.5 : 0, DRAG_TYPE_RIGHT | DRAG_TYPE_BOTTOM, 'nwse-resize');
		}

		if (settings.enable_controls == true) {
			//draw centers
			if (Math.abs(w) > block_size * 5) {
				corner(x + w / 2, y - middle_offset - wholeLineWidth, 0, hitsTopEdge ? 0.5 : 0, DRAG_TYPE_TOP, 'ns-resize');
				corner(x + w / 2, y + h + middle_offset + wholeLineWidth, 0, hitsBottomEdge ? -0.5 : 0, DRAG_TYPE_BOTTOM, 'ns-resize');
			}
			if (Math.abs(h) > block_size * 5) {
				corner(x - middle_offset - wholeLineWidth, y + h / 2, hitsLeftEdge ? 0.5 : 0, 0, DRAG_TYPE_LEFT, 'ew-resize');
				corner(x + w + middle_offset + wholeLineWidth, y + h / 2, hitsRightEdge ? -0.5 : 0, 0, DRAG_TYPE_RIGHT, 'ew-resize');
			}
		}

		//restore
		this.ctx.restore();
		if (this.ctx != main_ctx) {
			this.ctx = main_ctx;
			//reset the overlay transform so next frame's clear spans the whole canvas
			overlay_ctx.setTransform(1, 0, 0, 1, 0, 0);
		}
	}

	/**
	 * appends the selection shape (rect/ellipse/lasso) to the current path -
	 * does not start a new path, so callers can accumulate a union of regions.
	 */
	_build_shape_path(ctx, data) {
		var x = data.x;
		var y = data.y;
		var w = data.width;
		var h = data.height;
		var shape = data.shape || 'rect';

		if (shape == 'ellipse') {
			ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, 2 * Math.PI);
		}
		else if (shape == 'lasso' && data.path != null && data.path.length > 1) {
			ctx.moveTo(data.path[0][0], data.path[0][1]);
			for (var i = 1; i < data.path.length; i++) {
				ctx.lineTo(data.path[i][0], data.path[i][1]);
			}
			ctx.closePath();
		}
		else {
			ctx.rect(x, y, w, h);
		}
	}

	/**
	 * builds the current selection path (rect/ellipse/lasso) in world coordinates.
	 */
	build_selection_path(ctx, data) {
		ctx.beginPath();
		this._build_shape_path(ctx, data);
	}

	/**
	 * flattens a marching-ants selection into a list of regions to draw or
	 * process. Composed selections return their committed regions (shift/alt
	 * modes), simple selections fall back to the top-level geometry as a single
	 * 'add' region. The in-progress drag preview is appended on request.
	 *
	 * @param {object} data
	 * @param {boolean} [includeActive] - also append the current drag preview region
	 */
	get_selection_regions(data, includeActive) {
		var regions = [];
		if (data == null)
			return regions;

		if (Array.isArray(data.regions)) {
			regions = data.regions.slice();
			if (includeActive === true && data.active_region != null
				&& data.active_region.width != null && data.active_region.height != null) {
				regions.push(data.active_region);
			}
		}
		else if (includeActive === true && data.active_region != null
			&& data.active_region.width != null && data.active_region.height != null) {
			regions = [data.active_region];
		}
		else if (data.x != null && data.width != null && data.height != null) {
			regions = [{
				shape: data.shape || 'rect',
				x: data.x,
				y: data.y,
				width: data.width,
				height: data.height,
				path: data.path || null,
				mode: 'add',
			}];
		}
		return regions;
	}

	/**
	 * returns {settings, data} pairs for every active marching-ants selection,
	 * regardless of which tool is currently active.
	 */
	get_marquee_selections() {
		var list = [];
		for (var k in settings_all) {
			var s = settings_all[k];
			if (s == null || s.marching_ants_mode !== true)
				continue;

			var data = null;
			if (s.data_function != null)
				data = s.data_function.call();
			if (data == null)
				continue;
			if (data.status == 'draft')
				continue;
			if (data.hide_selection_if_active === true && data.type == config.TOOL.name)
				continue;
			if (data.x == null || data.y == null || data.width == null || data.height == null)
				continue;

			list.push({ settings: s, data: data });
		}
		return list;
	}

	/**
	 * Static method to get the current marquee selection position
	 * without needing an instance. Returns {x, y} or null.
	 */
	static get_marquee_position() {
		for (var k in settings_all) {
			var s = settings_all[k];
			if (s == null || s.marching_ants_mode !== true)
				continue;

			var data = null;
			if (s.data_function != null)
				data = s.data_function.call();
			if (data == null)
				continue;
			if (data.status == 'draft')
				continue;
			if (data.hide_selection_if_active === true && data.type == config.TOOL.name)
				continue;
			if (data.x == null || data.y == null)
				continue;

			return { x: data.x, y: data.y };
		}
		return null;
	}

	/**
	 * returns the data object of the active persistent marching-ants selection,
	 * or null when nothing is selected. Used to constrain layer rendering.
	 */
	get_committed_selection_data() {
		var marquees = this.get_marquee_selections();
		if (marquees.length > 0)
			return marquees[0].data;
		return null;
	}

	/**
	 * draws Photoshop-style animated marching ants selection border.
	 * Every committed region is outlined in its own color: 'add' uses the
	 * classic black/white ants, 'subtract' red, 'intersect' blue.
	 */
	draw_marching_ants(data) {
		var ctx = this.ctx;
		var Z = config.ZOOM || 1;

		var regions = this.get_selection_regions(data, true);
		if (!regions.length)
			return;

		//animate - one dash step every ~50 ms
		var phase = Math.floor(performance.now() / 50);
		this.ant_offset = -(phase % 8) / Z;

		var dash = 4 / Z;
		var gap = 4 / Z;

		ctx.save();
		for (var i = 0; i < regions.length; i++) {
			var region = regions[i];
			if (region == null || region.x == null || region.width == null || region.height == null)
				continue;

			var mode = region.mode || 'add';
			var color = '#000000';
			if (mode == 'subtract')
				color = '#ff2d2d';
			else if (mode == 'intersect')
				color = '#1285ff';

			this.build_selection_path(ctx, region);

			//white underlay - always visible
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2.5 / Z;
			ctx.lineJoin = 'round';
			ctx.stroke();

			//animated dashes in the mode color
			ctx.strokeStyle = color;
			ctx.lineWidth = 1.5 / Z;
			ctx.lineJoin = 'round';
			ctx.setLineDash([dash, gap]);
			ctx.lineDashOffset = this.ant_offset;
			ctx.stroke();
			ctx.setLineDash([]);
		}
		ctx.restore();
	}

	/**
	 * clips the existing content of the given context to the committed
	 * selection interior: union of 'add'/'intersect' regions minus 'subtract'
	 * regions. Coordinates are world-space; the context transform maps them to
	 * the target buffer.
	 */
	apply_selection_constraint(ctx, data) {
		if (data == null)
			return;
		var regions = this.get_selection_regions(data, false);
		if (!regions.length)
			return;

		ctx.save();

		//union of all add/intersect regions - keep only their interior
		ctx.beginPath();
		var has_add = false;
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			this._build_shape_path(ctx, regions[i]);
			has_add = true;
		}
		if (has_add) {
			ctx.globalCompositeOperation = 'destination-in';
			ctx.fillStyle = '#000000';
			ctx.fill();
		}

		//carve out subtract regions
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'subtract')
				continue;
			ctx.beginPath();
			this.build_selection_path(ctx, regions[i]);
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fillStyle = '#000000';
			ctx.fill();
		}

		ctx.restore();
	}

	/**
	 * returns true while a marching-ants selection should keep animating.
	 */
	is_marching_ants_active() {
		return this.get_marquee_selections().length > 0;
	}

	selected_object_actions(e) {
		var settings = this.find_settings();
		var data = settings.data;

		if(data == null){
			return;
		}

		//locked layers cannot be moved, scaled or rotated
		if (data.locked === true) {
			return;
		}

		this.ctx.save();
		if (data.rotate != null && data.rotate != 0) {
			this.ctx.translate(data.x + data.width / 2, data.y + data.height / 2);
			this.ctx.rotate(data.rotate * Math.PI / 180);
		}

		var x = settings.data.x;
		var y = settings.data.y;
		var w = settings.data.width;
		var h = settings.data.height;

		//simplify checks
		var event_type = e.type;
		if(event_type == 'touchstart') event_type = 'mousedown';
		if(event_type == 'touchmove') event_type = 'mousemove';
		if(event_type == 'touchend') event_type = 'mouseup';

		if (!this.is_drag && ['mousedown', 'mouseup'].includes(event_type))
			return;

		const mainWrapper = document.getElementById('main_wrapper');
		const defaultCursor = config.TOOL && config.TOOL.name === 'text' ? 'text' : 'default';
		if (mainWrapper.style.cursor != defaultCursor) {
			mainWrapper.style.cursor = defaultCursor;
		}
		if (event_type == 'mousedown' && config.mouse.valid == false || settings.enable_controls == false) {
			return;
		}

		var mouse = config.mouse;
		const drag_type = this.selected_object_drag_type;

		if(event_type == 'mousedown' && settings.data !== null){
			this.click_details = {
				x: settings.data.x,
				y: settings.data.y,
				width: settings.data.width,
				height: settings.data.height,
			};
			this.current_angle = null;
		}
		if (event_type == 'mousemove' && this.mouse_lock == 'selected_object_actions' && this.is_drag) {

			const allowNegativeDimensions = settings.data.render_function
				&& ['line', 'arrow', 'gradient'].includes(settings.data.render_function[0]);

			mainWrapper.style.cursor = drag_type == 'rotate' ? ROTATE_CURSOR : "pointer";
			
			var is_ctrl = false;
			if (e.ctrlKey == true || e.metaKey) {
				is_ctrl = true;
			}

			const is_drag_type_left = Math.floor(drag_type / DRAG_TYPE_LEFT) % 2 === 1;
			const is_drag_type_right = Math.floor(drag_type / DRAG_TYPE_RIGHT) % 2 === 1;
			const is_drag_type_top = Math.floor(drag_type / DRAG_TYPE_TOP) % 2 === 1;
			const is_drag_type_bottom = Math.floor(drag_type / DRAG_TYPE_BOTTOM) % 2 === 1;

			if(is_drag_type_left && is_drag_type_top) mainWrapper.style.cursor = "nwse-resize";
			else if(is_drag_type_top && is_drag_type_right) mainWrapper.style.cursor = "nesw-resize";
			else if(is_drag_type_right && is_drag_type_bottom) mainWrapper.style.cursor = "nwse-resize";
			else if(is_drag_type_bottom && is_drag_type_left) mainWrapper.style.cursor = "nesw-resize";
			else if(is_drag_type_top) mainWrapper.style.cursor = "ns-resize";
			else if(is_drag_type_right) mainWrapper.style.cursor = "ew-resize";
			else if(is_drag_type_bottom) mainWrapper.style.cursor = "ns-resize";
			else if(is_drag_type_left) mainWrapper.style.cursor = "ew-resize";

			if(drag_type == 'rotate'){
				//rotate relatively to where the drag started - no jump
				const start = this.rotate_drag;
				if (start) {
					const cx = start.cx;
					const cy = start.cy;
					const start_angle = Math.atan2(start.start_y - cy, start.start_x - cx) / Math.PI * 180;
					const cur_angle = Math.atan2(mouse.y - cy, mouse.x - cx) / Math.PI * 180;
					//wrap the delta to [-180, 180) so crossing the ±180° boundary is smooth
					const delta = ((cur_angle - start_angle + 540) % 360) - 180;

					let angle = start.initial_rotate + delta;
					//snap to 15° increments while holding shift
					if (e.shiftKey) {
						angle = Math.round(angle / 15) * 15;
					}

					this.current_angle = angle;
					config.need_render = true;
				}
			}
			else if (e.buttons == 1 || typeof e.buttons == "undefined") {
				// Do transformations
				var dx = Math.round(mouse.x - mouse.click_x);
				var dy = Math.round(mouse.y - mouse.click_y);
				var width = this.click_details.width + dx;
				var height = this.click_details.height + dy;
				if (is_drag_type_top)
					height = this.click_details.height - dy;
				if (is_drag_type_left)
					width = this.click_details.width - dx;

				// Keep ratio - (if drag_type power of 2, only dragging on single axis)
				if (drag_type && (drag_type & (drag_type - 1)) !== 0 && (settings.keep_ratio == true && is_ctrl == false) 
					|| (settings.keep_ratio !== true && is_ctrl == true)){
					var ratio = this.click_details.width / this.click_details.height;
					var width_new = Math.round(height * ratio);
					var height_new = Math.round(width / ratio);

					if (Math.abs(width * 100 / width_new) > Math.abs(height * 100 / height_new)) {
						height = height_new;
					}
					else {
						width = width_new;
					}
				}

				// Set values
				settings.data.x = this.click_details.x;
				settings.data.y = this.click_details.y;
				if (is_drag_type_top)
					settings.data.y = this.click_details.y - (height - this.click_details.height);
				if (is_drag_type_left)
					settings.data.x = this.click_details.x - (width - this.click_details.width);
				if (is_drag_type_left || is_drag_type_right)
					settings.data.width = width;
				if (is_drag_type_top || is_drag_type_bottom)
					settings.data.height = height;

				// Don't allow negative width/height on most layers
				if (!allowNegativeDimensions) {
					if (settings.data.width <= 0) {
						settings.data.width = Math.abs(settings.data.width);
						if (is_drag_type_left) {
							settings.data.x -= settings.data.width;
						} else {
							settings.data.x = this.click_details.x - settings.data.width;
						}
					}
					if (settings.data.height <= 0) {
						settings.data.height = Math.abs(settings.data.height);
						if (is_drag_type_top) {
							settings.data.y -= settings.data.height;
						} else {
							settings.data.y = this.click_details.y - settings.data.height;
						}
					}
				}
				config.need_render = true;
			}
			return;
		}
		if (event_type == 'mouseup' && this.mouse_lock == 'selected_object_actions') {
			//reset
			this.mouse_lock = null;
			this.rotate_drag = null;
		}

		if (!this.mouse_lock) {
			//set mouse move cursor
			if(settings.enable_move && mouse.x > x &&  mouse.x < x + w && mouse.y > y &&  mouse.y < y + h){
				mainWrapper.style.cursor = "move";
			}

			let handleMatched = false;
			for (let current_drag_type in this.selected_obj_positions) {
				const position = this.selected_obj_positions[current_drag_type];
				if (position.path && this.ctx.isPointInPath(position.path, mouse.x, mouse.y)) {
					// match
					handleMatched = true;
					if (event_type == 'mousedown') {
						if (e.buttons == 1 || typeof e.buttons == "undefined") {
							this.mouse_lock = 'selected_object_actions';
							this.selected_object_drag_type = current_drag_type;
						}
					}
					if (event_type == 'mousemove') {
						mainWrapper.style.cursor = position.cursor;
					}
				}
			}

			//rotate? - cursor just outside the layer bounds (ring zone)
			if (!handleMatched && settings.enable_rotation == true) {
				const z = rotate_zone / config.ZOOM;
				const rot_rad = (data.rotate || 0) * Math.PI / 180;
				const cosA = Math.cos(-rot_rad);
				const sinA = Math.sin(-rot_rad);

				//project the mouse into the layer's local (unrotated) space -
				//pure math, independent of any transform on the context
				const rx = mouse.x - (x + w / 2);
				const ry = mouse.y - (y + h / 2);
				const lx = rx * cosA - ry * sinA;
				const ly = rx * sinA + ry * cosA;
				const hw = w / 2;
				const hh = h / 2;

				const inOuter = lx > -hw - z && lx < hw + z && ly > -hh - z && ly < hh + z;
				const inInner = lx > -hw && lx < hw && ly > -hh && ly < hh;

				if (inOuter && !inInner) {
					//match
					if (event_type == 'mousedown') {
						if (e.buttons == 1 || typeof e.buttons == "undefined") {
							this.mouse_lock = 'selected_object_actions';
							this.selected_object_drag_type = "rotate";
							//remember where the drag started so rotation is relative
							this.rotate_drag = {
								cx: x + w / 2,
								cy: y + h / 2,
								start_x: mouse.x,
								start_y: mouse.y,
								initial_rotate: data.rotate || 0,
							};
						}
					}
					if (event_type == 'mousemove') {
						mainWrapper.style.cursor = ROTATE_CURSOR;
					}
				}
			}

			this.ctx.restore();
		}
	}

}

export default Base_selection_class;
