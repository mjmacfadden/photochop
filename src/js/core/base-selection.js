/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../config.js';
import zoomView from './../libs/zoomView.js';
import app from './../app.js';
import Mask_class from './../modules/mask/mask.js';

var instance = null;
var settings_all = [];

const handle_size = 8;

//Rotate cursor - used when hovering just outside the selection bounds.
//The URL is resolved relative to the document root (see layout.css icon refs).
const ROTATE_CURSOR = "url('images/icons/rotate.svg') 12 12, default";

// Inner and outer offset (in screen px) of the rotation ring outside the layer bounds and handles.
const rotate_inner_zone = 16;
const rotate_outer_zone = 34;

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
			if (ctx != null && instance.ctx == null) {
				instance.ctx = ctx;
			}
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
		// cached union-silhouette contours for the current selection
		this._ant_cache = { key: null, contours: null };

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

		// update cursor on Alt key state changes
		const onAltKey = (e) => {
			if (e.key === 'Alt' || e.key === 'AltGraph' || e.code === 'AltLeft' || e.code === 'AltRight' || e.keyCode === 18) {
				if (config.TOOL && config.TOOL.name === 'select') {
					this.selected_object_actions(e);
				}
			}
		};
		window.addEventListener('keydown', onAltKey);
		window.addEventListener('keyup', onAltKey);
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
		if (this.ctx == null)
			return;
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
			var rx = Math.abs(w) / 2;
			var ry = Math.abs(h) / 2;
			var cx = (w < 0 ? x + w : x) + rx;
			var cy = (h < 0 ? y + h : y) + ry;
			if (rx > 0 && ry > 0) {
				ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
			}
		}
		else if (shape == 'lasso' && data.path != null && data.path.length > 1) {
			ctx.moveTo(data.path[0][0], data.path[0][1]);
			for (var i = 1; i < data.path.length; i++) {
				ctx.lineTo(data.path[i][0], data.path[i][1]);
			}
			ctx.closePath();
		}
		else {
			var rx = w < 0 ? x + w : x;
			var ry = h < 0 ? y + h : y;
			ctx.rect(rx, ry, Math.abs(w), Math.abs(h));
		}
	}

	/**
	 * builds the current selection path (rect/ellipse/lasso) in world coordinates.
	 */
	build_selection_path(ctx, data) {
		ctx.beginPath();
		this._build_shape_path(ctx, data);
	}

	get_simple_shape_contours(r) {
		var shape = r.shape || 'rect';
		var w = r.width || 0;
		var h = r.height || 0;
		var x = (r.x != null) ? r.x : 0;
		var y = (r.y != null) ? r.y : 0;

		var rx = w < 0 ? x + w : x;
		var ry = h < 0 ? y + h : y;
		var rw = Math.abs(w);
		var rh = Math.abs(h);

		if (rw === 0 && rh === 0)
			return [];

		if (shape === 'rect') {
			return [
				[[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]]
			];
		} else if (shape === 'ellipse') {
			var cx = rx + rw / 2;
			var cy = ry + rh / 2;
			var a = rw / 2;
			var b = rh / 2;
			var pts = [];
			var steps = Math.max(32, Math.min(128, Math.round(Math.max(a, b))));
			for (var s = 0; s < steps; s++) {
				var th = (s / steps) * 2 * Math.PI;
				pts.push([cx + a * Math.cos(th), cy + b * Math.sin(th)]);
			}
			return [pts];
		} else if (shape === 'lasso' && r.path && r.path.length > 1) {
			return [r.path];
		}
		return [];
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

		if (Array.isArray(data.regions) && data.regions.length > 0) {
			regions = data.regions.slice();
			if (includeActive === true && data.active_region != null
				&& data.active_region.shape !== 'lasso'
				&& data.active_region.width != null && data.active_region.height != null) {
				regions.push(data.active_region);
			}
		}
		else if (data.x != null && data.width != null && data.height != null && data.width !== 0 && data.height !== 0) {
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
		else if (includeActive === true && data.active_region != null
			&& data.active_region.shape !== 'lasso'
			&& data.active_region.width != null && data.active_region.height != null) {
			regions = [data.active_region];
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
	 * The ants outline the total perimeter of the composed selection (the
	 * union silhouette), not each individual region. Subtract regions render
	 * as their own interior contours.
	 */
	draw_marching_ants(data) {
		var ctx = this.ctx;
		var Z = config.ZOOM || 1;

		var contours = this.get_union_contours(data);

		//animate - one dash step every ~50 ms
		var phase = Math.floor(performance.now() / 50);
		this.ant_offset = -(phase % 8) / Z;

		var dash = 4 / Z;
		var gap = 4 / Z;

		ctx.save();
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';

		var draw_path_ants = (pts, is_closed) => {
			if (pts.length < 2) return;
			ctx.beginPath();
			ctx.moveTo(pts[0][0], pts[0][1]);
			for (var i = 1; i < pts.length; i++) {
				ctx.lineTo(pts[i][0], pts[i][1]);
			}
			if (is_closed) {
				ctx.closePath();
			}

			//white underlay
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 2.5 / Z;
			ctx.stroke();

			//animated black dashes
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 1.5 / Z;
			ctx.setLineDash([dash, gap]);
			ctx.lineDashOffset = this.ant_offset;
			ctx.stroke();
			ctx.setLineDash([]);
		};

		for (var c = 0; c < contours.length; c++) {
			draw_path_ants(contours[c], true);
		}

		// If there is an active in-progress drag region, draw it in real time
		if (data.active_region != null) {
			var ar = data.active_region;
			if (ar.shape === 'lasso' && ar.path && ar.path.length > 1) {
				draw_path_ants(ar.path, false);
			} else if (ar.width != null && ar.height != null && (ar.width !== 0 || ar.height !== 0)) {
				var ar_contours = this.get_simple_shape_contours(ar);
				for (var ac = 0; ac < ar_contours.length; ac++) {
					draw_path_ants(ar_contours[ac], true);
				}
			}
		}

		ctx.restore();
	}

	/**
	 * returns the union-silhouette contours (array of closed polylines in
	 * world coordinates) for the given marching-ants selection.
	 */
	get_union_contours(data) {
		var regions = this.get_selection_regions(data, false);
		if (regions.length === 0)
			return [];

		// Fast path for single add region (e.g. Select All or single rectangle/ellipse marquee)
		if (regions.length === 1 && regions[0].mode !== 'subtract') {
			return this.get_simple_shape_contours(regions[0]);
		}

		var key = JSON.stringify(regions);
		if (this._ant_cache.key === key) {
			return this._ant_cache.contours;
		}

		var PAD = 2;
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, config.WIDTH) + PAD * 2;
		canvas.height = Math.max(1, config.HEIGHT) + PAD * 2;
		var ctx = canvas.getContext('2d');

		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		ctx.save();
		ctx.translate(PAD, PAD);

		ctx.beginPath();
		var has_add = false;
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			this._build_shape_path(ctx, regions[i]);
			has_add = true;
		}
		if (has_add) {
			ctx.fillStyle = '#ffffff';
			ctx.fill();
		}
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'subtract')
				continue;
			ctx.beginPath();
			this._build_shape_path(ctx, regions[i]);
			ctx.fillStyle = '#000000';
			ctx.fill();
		}
		ctx.restore();

		var raw_contours = this._trace_mask_contours(canvas);
		var contours = [];
		for (var c = 0; c < raw_contours.length; c++) {
			var poly = [];
			for (var p = 0; p < raw_contours[c].length; p++) {
				poly.push([raw_contours[c][p][0] - PAD, raw_contours[c][p][1] - PAD]);
			}
			contours.push(poly);
		}

		this._ant_cache.key = key;
		this._ant_cache.contours = contours;
		return contours;
	}

	/**
	 * traces the white/black boundary of the given raster canvas into closed
	 * contours with marching squares (linear interpolation on the isovalue).
	 */
	_trace_mask_contours(canvas) {
		var W = canvas.width;
		var H = canvas.height;
		var img = canvas.getContext('2d').getImageData(0, 0, W, H);
		var d = img.data;
		var iso = 128;

		var corner = function (i, j) {
			if (i < 0 || j < 0 || i >= W || j >= H)
				return 0;
			return d[(j * W + i) * 4] >= iso ? 255 : 0;
		};
		var interp = function (a, b) {
			if (a === b)
				return 0.5;
			var t = (iso - a) / (b - a);
			if (t < 0)
				return 0;
			if (t > 1)
				return 1;
			return t;
		};

		//edges per marching-squares case (top, right, bottom, left). Cases 5
		//and 10 are ambiguous and get two segments.
		var table = [
			[],              [0, 3],        [0, 1],        [1, 3],
			[1, 2],          [0, 3, 1, 2],  [0, 2],        [2, 3],
			[2, 3],          [0, 2],        [0, 1, 2, 3],  [1, 2],
			[1, 3],          [0, 1],        [0, 3],        []
		];

		var segments = [];
		for (var j = 0; j < H; j++) {
			for (var i = 0; i < W; i++) {
				var v00 = corner(i, j);
				var v10 = corner(i + 1, j);
				var v11 = corner(i + 1, j + 1);
				var v01 = corner(i, j + 1);

				var idx = (v00 ? 1 : 0) | (v10 ? 2 : 0) | (v11 ? 4 : 0) | (v01 ? 8 : 0);
				var edges = table[idx];
				if (!edges.length)
					continue;

				//edge intersection points (linear interpolation)
				var e0 = [i + interp(v00, v10), j];
				var e1 = [i + 1, j + interp(v10, v11)];
				var e2 = [i + interp(v01, v11), j + 1];
				var e3 = [i, j + interp(v00, v01)];
				var edge_pts = [e0, e1, e2, e3];

				if (edges.length === 2) {
					segments.push([edge_pts[edges[0]], edge_pts[edges[1]]]);
				}
				else if (edges.length === 4) {
					segments.push([edge_pts[edges[0]], edge_pts[edges[1]]]);
					segments.push([edge_pts[edges[2]], edge_pts[edges[3]]]);
				}
			}
		}
		if (!segments.length)
			return [];

		//chain the segments into point lists (each point key is exact since
		//shared edges are interpolated identically)
		var points = [];
		var point_index = {};
		var adjacency = [];
		var get_idx = function (p) {
			var key = Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6);
			if (key in point_index)
				return point_index[key];
			var idx = points.length;
			point_index[key] = idx;
			points.push(p);
			adjacency.push([]);
			return idx;
		};

		for (var s = 0; s < segments.length; s++) {
			var a = get_idx(segments[s][0]);
			var b = get_idx(segments[s][1]);
			if (a === b)
				continue;
			adjacency[a].push(b);
			adjacency[b].push(a);
		}

		var used = new Array(points.length).fill(false);
		var contours = [];
		for (var start = 0; start < points.length; start++) {
			if (used[start] || adjacency[start].length === 0)
				continue;
			used[start] = true;

			var contour = [points[start]];
			var prev = start;
			var cur = adjacency[start][0];
			var guard = 0;
			while (cur !== start) {
				if (cur < 0 || cur >= points.length || used[cur])
					break;
				contour.push(points[cur]);
				used[cur] = true;
				if (++guard > points.length)
					break;

				var nxt = -1;
				for (var k = 0; k < adjacency[cur].length; k++) {
					var neighbor = adjacency[cur][k];
					if (neighbor === start && contour.length > 2) {
						nxt = start;
						break;
					}
					if (neighbor !== prev && !used[neighbor]) {
						nxt = neighbor;
						break;
					}
				}
				if (nxt === -1)
					break;
				prev = cur;
				cur = nxt;
			}

			if (guard > 0 || contour.length > 1) {
				contours.push(contour);
			}
		}

		return contours;
	}

	/**
	 * returns a full-document grayscale canvas representing the committed
	 * selection interior: white inside (union of add/intersect regions),
	 * black outside, with subtract regions carved out as black holes.
	 */
	create_selection_clip_canvas() {
		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, config.WIDTH);
		canvas.height = Math.max(1, config.HEIGHT);
		var ctx = canvas.getContext('2d');

		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		var data = this.get_committed_selection_data();
		if (data == null)
			return canvas;
		var regions = this.get_selection_regions(data, false);
		if (!regions.length)
			return canvas;

		ctx.beginPath();
		var has_add = false;
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			this._build_shape_path(ctx, regions[i]);
			has_add = true;
		}
		if (has_add) {
			ctx.fillStyle = '#ffffff';
			ctx.fill();
		}
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'subtract')
				continue;
			ctx.beginPath();
			this._build_shape_path(ctx, regions[i]);
			ctx.fillStyle = '#000000';
			ctx.fill();
		}

		return canvas;
	}

	/**
	 * returns a layer-mask object anchored over the whole document that reveals
	 * only the committed selection (white inside, black outside), tagged as a
	 * selection clip so bake_selection_clips() can bake it away later. Returns
	 * null when no persistent selection exists.
	 */
	get_selection_clip_mask() {
		var data = this.get_committed_selection_data();
		if (data == null || data.width == null || data.height == null
			|| data.width <= 0 || data.height <= 0)
			return null;

		var canvas = this.create_selection_clip_canvas();
		return {
			link: canvas,
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
			enabled: true,
			linked: true,
			_selection_clip: true,
		};
	}

	has_committed_selection() {
		var data = this.get_committed_selection_data();
		return data != null && data.width != null && data.height != null
			&& data.width > 0 && data.height > 0;
	}

	get_selection_bounds(data) {
		data = data || this.get_committed_selection_data();
		if (data == null)
			return null;
		var regions = this.get_selection_regions(data, false);
		var x1 = Infinity;
		var y1 = Infinity;
		var x2 = -Infinity;
		var y2 = -Infinity;
		var found = false;
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			found = true;
			x1 = Math.min(x1, regions[i].x);
			y1 = Math.min(y1, regions[i].y);
			x2 = Math.max(x2, regions[i].x + regions[i].width);
			y2 = Math.max(y2, regions[i].y + regions[i].height);
		}
		if (!found) {
			if (data.x == null || data.width == null)
				return null;
			return {
				x: data.x,
				y: data.y,
				width: data.width,
				height: data.height,
			};
		}
		return {
			x: x1,
			y: y1,
			width: x2 - x1,
			height: y2 - y1,
		};
	}

	_paint_selection_alpha(ctx, data) {
		var regions = this.get_selection_regions(data, false);
		if (!regions.length)
			return;

		ctx.beginPath();
		var has_add = false;
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode == 'subtract')
				continue;
			this._build_shape_path(ctx, regions[i]);
			has_add = true;
		}
		if (has_add) {
			ctx.fillStyle = '#ffffff';
			ctx.globalCompositeOperation = 'source-over';
			ctx.fill();
		}
		for (var i = 0; i < regions.length; i++) {
			if (regions[i].mode != 'subtract')
				continue;
			ctx.beginPath();
			this._build_shape_path(ctx, regions[i]);
			ctx.globalCompositeOperation = 'destination-out';
			ctx.fillStyle = '#ffffff';
			ctx.fill();
		}
		ctx.globalCompositeOperation = 'source-over';
	}

	/**
	 * alpha mask in the layer's native pixel space (width_original x
	 * height_original). Opaque white inside the selection, transparent outside.
	 */
	create_layer_selection_alpha(layer) {
		var w = Math.max(1, Math.round(layer.width_original || layer.width || 1));
		var h = Math.max(1, Math.round(layer.height_original || layer.height || 1));
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d');

		var data = this.get_committed_selection_data();
		if (data == null) {
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, w, h);
			return canvas;
		}

		var lw = layer.width || w;
		var lh = layer.height || h;
		var ratio_w = lw / w;
		var ratio_h = lh / h;

		ctx.save();
		ctx.scale(1 / (ratio_w || 1), 1 / (ratio_h || 1));
		ctx.translate(-(layer.x || 0), -(layer.y || 0));
		this._paint_selection_alpha(ctx, data);
		ctx.restore();
		return canvas;
	}

	/**
	 * keeps edits that fall inside the committed selection and restores
	 * original pixels everywhere else. `edited` is the layer's native canvas
	 * (typically width_original x height_original).
	 */
	restore_outside_selection(edited, original, layer) {
		if (edited == null || original == null || layer == null)
			return;
		if (!this.has_committed_selection())
			return;

		var clip = this.create_layer_selection_alpha(layer);
		var keep = document.createElement('canvas');
		keep.width = edited.width;
		keep.height = edited.height;
		var kctx = keep.getContext('2d');
		kctx.drawImage(edited, 0, 0);
		kctx.globalCompositeOperation = 'destination-in';
		kctx.drawImage(clip, 0, 0, edited.width, edited.height);

		var ectx = edited.getContext('2d');
		ectx.save();
		ectx.setTransform(1, 0, 0, 1, 0, 0);
		ectx.globalCompositeOperation = 'source-over';
		ectx.clearRect(0, 0, edited.width, edited.height);
		ectx.drawImage(original, 0, 0, edited.width, edited.height);
		ectx.drawImage(keep, 0, 0);
		ectx.restore();

		keep.width = 1;
		keep.height = 1;
		clip.width = 1;
		clip.height = 1;
	}

	/**
	 * copies the current layer's pixels inside the selection into a cropped
	 * canvas with transparency outside the shape. Returns
	 * {canvas, x, y, width, height} in world coordinates, or null.
	 */
	extract_selection_image(layer) {
		if (layer == null)
			layer = config.layer;
		var data = this.get_committed_selection_data();
		if (data == null || layer == null)
			return null;

		var bounds = this.get_selection_bounds(data);
		if (bounds == null || bounds.width <= 0 || bounds.height <= 0)
			return null;

		var x = Math.round(bounds.x);
		var y = Math.round(bounds.y);
		var width = Math.max(1, Math.round(bounds.width));
		var height = Math.max(1, Math.round(bounds.height));

		var canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		var ctx = canvas.getContext('2d');
		ctx.translate(-x, -y);

		if (app.Layers != null && typeof app.Layers.render_object == 'function') {
			app.Layers.render_object(ctx, layer);
		}
		else if (layer.type == 'image' && (layer.link_canvas != null || layer.link != null)) {
			ctx.save();
			ctx.translate((layer.x || 0) + (layer.width || 0) / 2, (layer.y || 0) + (layer.height || 0) / 2);
			ctx.rotate(((layer.rotate || 0) * Math.PI) / 180);
			ctx.drawImage(
				layer.link_canvas != null ? layer.link_canvas : layer.link,
				-(layer.width || 0) / 2,
				-(layer.height || 0) / 2,
				layer.width || width,
				layer.height || height
			);
			ctx.restore();
		}

		var alpha = document.createElement('canvas');
		alpha.width = width;
		alpha.height = height;
		var actx = alpha.getContext('2d');
		actx.translate(-x, -y);
		this._paint_selection_alpha(actx, data);

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(alpha, 0, 0);

		alpha.width = 1;
		alpha.height = 1;

		return {
			canvas: canvas,
			x: x,
			y: y,
			width: width,
			height: height,
		};
	}

	/**
	 * permanently bakes every transient selection-clip mask (_selection_clip)
	 * into its layer's pixels and drops the mask. Called whenever the committed
	 * selection is cleared or replaced, so the constraint survives the
	 * disappearing selection - the outside pixels were never painted, the
	 * painted ones stay (Photoshop behavior).
	 */
	bake_selection_clips() {
		var layers = config.layers;
		if (layers == null || layers.length === 0)
			return;

		var baked = false;
		for (var i = 0; i < layers.length; i++) {
			var layer = layers[i];
			if (layer == null || layer.mask == null)
				continue;
			if (layer.mask._selection_clip !== true || layer.mask.enabled === false)
				continue;
			this._bake_selection_clip_layer(layer);
			baked = true;
		}
		if (baked)
			config.need_render = true;
	}

	/**
	 * bakes a single selection-clip masked layer in place (not undoable).
	 */
	_bake_selection_clip_layer(layer) {
		if (this.Mask == null) {
			this.Mask = new Mask_class();
		}

		if (layer.type != 'image') {
			//render-function layers (brush/pencil/gradient) - rasterize the
			//masked render (the mask is applied by render_object) and swap the
			//layer content in place
			if (app.Layers == null || app.Layers.convert_layer_to_canvas == null)
				return;
			var canvas = app.Layers.convert_layer_to_canvas(layer.id, false, false);
			layer.type = 'image';
			layer.link = canvas;
			delete layer.link_canvas;
			layer.x = parseInt(canvas.dataset.x) || 0;
			layer.y = parseInt(canvas.dataset.y) || 0;
			layer.width = canvas.width;
			layer.height = canvas.height;
			layer.width_original = canvas.width;
			layer.height_original = canvas.height;
			delete layer.render_function;
			delete layer.data;
		}
		else {
			//image layers - bake the mask into the local frame
			if (layer.link == null)
				return;
			var c = document.createElement('canvas');
			c.width = Math.max(1, Math.round(layer.width || 1));
			c.height = Math.max(1, Math.round(layer.height || 1));
			var nctx = c.getContext('2d');
			nctx.drawImage(layer.link, 0, 0, c.width, c.height);
			this.Mask.multiply_alpha_by_mask_local(nctx, layer);
			layer.link = c;
			delete layer.link_canvas;
		}
		layer.mask = null;
		if (app.Layers != null && app.Layers.notify_mask_changed != null) {
			app.Layers.notify_mask_changed(layer.id);
		}
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
		const brushTools = ['brush', 'pencil', 'erase', 'clone', 'blur', 'sharpen', 'desaturate', 'bulge_pinch'];
		const crosshairTools = ['selection', 'lasso', 'magic_wand', 'gradient', 'crop'];

		let defaultCursor = 'default';
		if (config.TOOL && brushTools.includes(config.TOOL.name)) {
			defaultCursor = 'none';
		} else if (config.TOOL && config.TOOL.name === 'text') {
			defaultCursor = 'text';
		} else if (config.TOOL && crosshairTools.includes(config.TOOL.name)) {
			defaultCursor = 'crosshair';
		}

		if (mainWrapper && mainWrapper.style.cursor != defaultCursor) {
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
				mask: settings.data.mask ? {
					x: settings.data.mask.x,
					y: settings.data.mask.y,
					width: settings.data.mask.width,
					height: settings.data.mask.height,
					linked: settings.data.mask.linked,
				} : null
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
					app.Layers.render_interactive_layer(settings.data.id);
				}
			}
			else if (e.buttons == 1 || typeof e.buttons == "undefined") {
				// Do transformations
				var is_alt = (e.altKey === true);
				var dx = Math.round(mouse.x - mouse.click_x);
				var dy = Math.round(mouse.y - mouse.click_y);
				var width = this.click_details.width;
				var height = this.click_details.height;

				if (is_alt) {
					// Symmetrical resize from center outward
					if (is_drag_type_right) {
						width = this.click_details.width + 2 * dx;
					} else if (is_drag_type_left) {
						width = this.click_details.width - 2 * dx;
					}

					if (is_drag_type_bottom) {
						height = this.click_details.height + 2 * dy;
					} else if (is_drag_type_top) {
						height = this.click_details.height - 2 * dy;
					}
				} else {
					width = this.click_details.width + dx;
					height = this.click_details.height + dy;
					if (is_drag_type_top)
						height = this.click_details.height - dy;
					if (is_drag_type_left)
						width = this.click_details.width - dx;
				}

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

				if (is_alt) {
					var cx = this.click_details.x + this.click_details.width / 2;
					var cy = this.click_details.y + this.click_details.height / 2;

					if (is_drag_type_left || is_drag_type_right) {
						settings.data.width = width;
						settings.data.x = Math.round(cx - width / 2);
					} else {
						settings.data.x = this.click_details.x;
						settings.data.width = this.click_details.width;
					}

					if (is_drag_type_top || is_drag_type_bottom) {
						settings.data.height = height;
						settings.data.y = Math.round(cy - height / 2);
					} else {
						settings.data.y = this.click_details.y;
						settings.data.height = this.click_details.height;
					}

					// When both axes were scaled (e.g. corner handles or keep_ratio)
					if ((is_drag_type_left || is_drag_type_right) && (is_drag_type_top || is_drag_type_bottom)) {
						settings.data.width = width;
						settings.data.height = height;
						settings.data.x = Math.round(cx - width / 2);
						settings.data.y = Math.round(cy - height / 2);
					}
				} else {
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
				}

				// Don't allow negative width/height on most layers
				if (!allowNegativeDimensions) {
					if (settings.data.width <= 0) {
						settings.data.width = Math.abs(settings.data.width) || 1;
						if (is_alt) {
							var cx = this.click_details.x + this.click_details.width / 2;
							settings.data.x = Math.round(cx - settings.data.width / 2);
						} else if (is_drag_type_left) {
							settings.data.x -= settings.data.width;
						} else {
							settings.data.x = this.click_details.x - settings.data.width;
						}
					}
					if (settings.data.height <= 0) {
						settings.data.height = Math.abs(settings.data.height) || 1;
						if (is_alt) {
							var cy = this.click_details.y + this.click_details.height / 2;
							settings.data.y = Math.round(cy - settings.data.height / 2);
						} else if (is_drag_type_top) {
							settings.data.y -= settings.data.height;
						} else {
							settings.data.y = this.click_details.y - settings.data.height;
						}
					}
				}
				new Mask_class().preview_linked_mask_transform(settings.data, this.click_details, settings.data);
				app.Layers.render_interactive_layer(settings.data.id);
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

			//rotate? - cursor outside the layer bounds & handles (ring zone)
			if (!handleMatched && settings.enable_rotation == true) {
				const z_inner = rotate_inner_zone / config.ZOOM;
				const z_outer = rotate_outer_zone / config.ZOOM;
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

				const inOuter = lx > -hw - z_outer && lx < hw + z_outer && ly > -hh - z_outer && ly < hh + z_outer;
				const inInner = lx > -hw - z_inner && lx < hw + z_inner && ly > -hh - z_inner && ly < hh + z_inner;

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
