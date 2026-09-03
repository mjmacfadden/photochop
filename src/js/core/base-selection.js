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
	 * - crop_shield
	 * - crop_guides (thirds|grid|diagonal|none)
	 * - crop_lines (legacy bool → thirds)
	 * - enable_borders
	 * - enable_controls
	 * - enable_rotation
	 * - enable_move
	 * - keep_ratio
	 * - fixed_ratio
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
		this._ant_timer = null;

		// Dedicated selection alpha channel (raster mask canvas)
		this.mask_canvas = document.createElement('canvas');
		this.mask_canvas.width = Math.max(1, config.WIDTH || 800);
		this.mask_canvas.height = Math.max(1, config.HEIGHT || 600);
		this.mask_ctx = this.mask_canvas.getContext('2d', { willReadFrequently: true });
		this.has_selection = false;
		this.selection_bounds = null;
		this.selection_contours = [];
		this._preview_contours = null;
		this._preview_canvas = null;
		this._preview_lasso_path = null;

		this.events();

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				this.stop_marching_ants();
			} else if (this.is_marching_ants_active()) {
				this.start_marching_ants();
				this.draw_selection();
			}
		});
	}

	events() {
		const handlePointerDown = (e) => {
			this.is_drag = false;
			if (e.pointerType === 'touch')
				this.is_touch = true;
			if (!e.target.closest('#main_wrapper'))
				return;
			this.is_drag = true;
			this.selected_object_actions(e);
		};
		const handlePointerMove = (e) => {
			this.selected_object_actions(e);
		};
		const handlePointerUp = (e) => {
			this.selected_object_actions(e);
		};

		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('pointermove', handlePointerMove);
		document.addEventListener('pointerup', handlePointerUp);
		document.addEventListener('pointercancel', handlePointerUp);

		// Fallback for non-PointerEvent browsers
		document.addEventListener('mousedown', (e) => {
			if (window.PointerEvent) return;
			handlePointerDown(e);
		});
		document.addEventListener('mousemove', (e) => {
			if (window.PointerEvent) return;
			handlePointerMove(e);
		});
		document.addEventListener('mouseup', (e) => {
			if (window.PointerEvent) return;
			handlePointerUp(e);
		});

		// touch fallback
		document.addEventListener('touchstart', (event) => {
			if (window.PointerEvent) return;
			this.is_drag = false;
			this.is_touch = true;
			if (!event.target.closest('#main_wrapper'))
				return;
			this.is_drag = true;
			this.selected_object_actions(event);
		});
		document.addEventListener('touchmove', (event) => {
			if (window.PointerEvent) return;
			this.selected_object_actions(event);
		}, { passive: false });
		document.addEventListener('touchend', (event) => {
			if (window.PointerEvent) return;
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

	find_settings(custom_key = null) {
		var current_key = custom_key || (config.TOOL ? config.TOOL.name : 'selection');
		var settings = null;

		for (var i in settings_all) {
			if (i == current_key)
				settings = settings_all[i];
		}

		//default
		if (settings === null) {
			settings = settings_all['selection'] || settings_all['main'];
		}

		//find data
		if (settings && typeof settings.data_function === 'function') {
			settings.data = settings.data_function.call();
		}

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

		//draw persistent marching-ants selection from selection channel
		if (this.has_selection || (this._preview_contours != null && this._preview_contours.length > 0) || (this._preview_lasso_path != null && this._preview_lasso_path.length > 1)) {
			var draw_ctx = this.ctx;
			if (overlay_ctx != null) {
				draw_ctx = overlay_ctx;
				var mm = zoomView.matrix;
				draw_ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4] + config.TRANSFORM_MARGIN, mm[5] + config.TRANSFORM_MARGIN);
			}
			draw_ctx.save();
			draw_ctx.globalAlpha = 1;
			this.draw_marching_ants(draw_ctx);
			draw_ctx.restore();
			this.ant_keep_rendering = true;
		}

		//the active tool is a marching-ants one - box controls are not needed
		if (settings.marching_ants_mode === true) {
			this.selected_obj_positions = {};
			return;
		}

		if (settings.data === null || settings.data.status == 'draft'
			|| (settings.data.hide_selection_if_active === true && settings.data.type == config.TOOL.name)) {
			this.selected_obj_positions = {};
			return;
		}

		//locked layers never show transform controls
		if (settings.data.locked === true) {
			this.selected_obj_positions = {};
			return;
		}

		var x = settings.data.x;
		var y = settings.data.y;
		var w = settings.data.width;
		var h = settings.data.height;

		if (x == null || y == null || w == null || h == null) {
			//not supported 
			this.selected_obj_positions = {};
			return;
		}

		// Photoshop crop uses slightly smaller square handles than transform controls
		var screen_handle = (settings.handle_style === 'crop_ps') ? 6 : handle_size;
		var block_size_default = screen_handle / config.ZOOM;

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

		//crop shield — dim outside the crop rectangle (Photoshop-like ~65%)
		if (settings.crop_shield === true) {
			var doc_w = config.WIDTH;
			var doc_h = config.HEIGHT;
			var rx = Math.min(x, x + w);
			var ry = Math.min(y, y + h);
			var rw = Math.abs(w);
			var rh = Math.abs(h);
			this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
			// top
			if (ry > 0) {
				this.ctx.fillRect(0, 0, doc_w, ry);
			}
			// bottom
			if (ry + rh < doc_h) {
				this.ctx.fillRect(0, ry + rh, doc_w, doc_h - (ry + rh));
			}
			// left
			if (rx > 0) {
				this.ctx.fillRect(0, ry, rx, rh);
			}
			// right
			if (rx + rw < doc_w) {
				this.ctx.fillRect(rx + rw, ry, doc_w - (rx + rw), rh);
			}
		}
		//fill inside selection (legacy green tint for non-crop tools)
		else if (settings.enable_background == true) {
			this.ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
			this.ctx.fillRect(x, y, w, h);
		}

		const wholeLineWidth = 1 / config.ZOOM;
		const halfLineWidth = wholeLineWidth / 2;
		const is_crop_overlay = (settings.crop_shield === true || settings.border_style === 'crop_ps');

		//borders - always for crop (incl. full-canvas); otherwise skip full-doc match
		if (settings.enable_borders == true && (is_crop_overlay || x != 0 || y != 0 || w != config.WIDTH || h != config.HEIGHT)) {
			this.ctx.lineWidth = wholeLineWidth;
			if (settings.border_style === 'dashed_light') {
				// Type tool paragraph box: light dashed (not marching ants)
				const dash = 4 / config.ZOOM;
				this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
				this.ctx.setLineDash([dash, dash]);
				this.ctx.strokeRect(x, y, w, h);
				this.ctx.setLineDash([]);
			} else if (is_crop_overlay) {
				// Photoshop-like thin light crop rule + subtle dark hairline
				this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
				this.ctx.lineWidth = wholeLineWidth * 1.5;
				this.ctx.strokeRect(x, y, w, h);
				this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
				this.ctx.lineWidth = wholeLineWidth;
				this.ctx.strokeRect(x, y, w, h);
			} else {
				this.ctx.strokeStyle = '#3f8ff7';
				this.ctx.strokeRect(x, y, w, h);
			}
		}

		//crop guide overlays (thirds / grid / diagonal / none) — keep subtle
		var crop_guides = settings.crop_guides;
		if (crop_guides == null && settings.crop_lines === true) {
			crop_guides = 'thirds';
		}
		if (crop_guides && crop_guides !== 'none') {
			var drawGuideLine = (x1, y1, x2, y2) => {
				this.ctx.lineWidth = wholeLineWidth;
				this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
				this.ctx.beginPath();
				this.ctx.moveTo(x1, y1);
				this.ctx.lineTo(x2, y2);
				this.ctx.stroke();

				this.ctx.lineWidth = halfLineWidth;
				this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
				this.ctx.beginPath();
				this.ctx.moveTo(x1, y1);
				this.ctx.lineTo(x2, y2);
				this.ctx.stroke();
			};

			if (crop_guides === 'thirds' || crop_guides === 'grid') {
				var divisions = (crop_guides === 'grid') ? 4 : 3;
				for (var part = 1; part < divisions; part++) {
					drawGuideLine(x + w / divisions * part - halfLineWidth, y, x + w / divisions * part - halfLineWidth, y + h);
					drawGuideLine(x, y + h / divisions * part - halfLineWidth, x + w, y + h / divisions * part - halfLineWidth);
				}
			}
			else if (crop_guides === 'diagonal') {
				// both diagonals
				drawGuideLine(x, y, x + w, y + h);
				drawGuideLine(x + w, y, x, y + h);
			}
		}

		const hitsLeftEdge = isRotated ? false : x < screen_handle;
		const hitsTopEdge = isRotated ? false : y < screen_handle;
		const hitsRightEdge = isRotated ? false : x + w > config.WIDTH - screen_handle;
		const hitsBottomEdge = isRotated ? false : y + h > config.HEIGHT - screen_handle;

		//draw corners - square handles (default blue; Type tool bw; crop PS light)
		var corner = (x, y, dx, dy, drag_type, cursor) => {
			if (settings.handle_style === 'bw_square') {
				this.ctx.strokeStyle = "#000000";
				this.ctx.fillStyle = "#ffffff";
			} else if (settings.handle_style === 'crop_ps') {
				this.ctx.strokeStyle = "rgba(40, 40, 40, 0.85)";
				this.ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
			} else {
				this.ctx.strokeStyle = "#3f8ff7";
				this.ctx.fillStyle = "#ffffff";
			}
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
			this.selected_obj_positions = {};
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
	 * returns {settings, data} pairs for active selections (backward compatibility)
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
			list.push({ settings: s, data: data });
		}
		return list;
	}

	get_committed_selection_data() {
		if (this.has_selection && this.selection_bounds) {
			return {
				x: this.selection_bounds.min_x,
				y: this.selection_bounds.min_y,
				width: this.selection_bounds.width,
				height: this.selection_bounds.height,
				has_selection: true,
			};
		}
		return null;
	}

	static get_marquee_position() {
		if (app.Layers && app.Layers.Base_selection) {
			const data = app.Layers.Base_selection.get_selection_data();
			if (data && data.has_selection && data.x != null) {
				return data;
			}
		}
		return null;
	}

	get_selection_data() {
		if (this.has_selection && this.selection_bounds) {
			return {
				x: this.selection_bounds.min_x,
				y: this.selection_bounds.min_y,
				width: this.selection_bounds.width,
				height: this.selection_bounds.height,
				has_selection: true,
			};
		}
		return {
			x: null,
			y: null,
			width: null,
			height: null,
			has_selection: false,
		};
	}

	has_committed_selection() {
		return this.has_selection;
	}

	is_marching_ants_active() {
		return this.has_selection || (this._preview_contours != null && this._preview_contours.length > 0) || (this._preview_lasso_path != null && this._preview_lasso_path.length > 1);
	}

	start_marching_ants() {
		if (this._ant_timer != null) return;
		if (document.hidden) return;
		this._ant_timer = setInterval(() => {
			if (document.hidden) {
				this.stop_marching_ants();
				return;
			}
			if (!this.is_marching_ants_active()) {
				this.stop_marching_ants();
				this.draw_selection();
				return;
			}
			this.draw_selection();
		}, 70);
	}

	stop_marching_ants() {
		if (this._ant_timer != null) {
			clearInterval(this._ant_timer);
			this._ant_timer = null;
		}
	}

	point_inside_selection(x, y) {
		if (!this.has_selection || !this.selection_bounds)
			return false;
		var bx = Math.round(x);
		var by = Math.round(y);
		if (bx < this.selection_bounds.min_x || bx > this.selection_bounds.max_x ||
			by < this.selection_bounds.min_y || by > this.selection_bounds.max_y) {
			return false;
		}
		if (bx < 0 || by < 0 || bx >= this.mask_canvas.width || by >= this.mask_canvas.height) {
			return false;
		}
		var pixel = this.mask_ctx.getImageData(bx, by, 1, 1).data;
		return pixel[3] > 127 || pixel[0] > 127;
	}

	translate_selection(dx, dy) {
		if (!this.has_selection) return;
		var W = this.mask_canvas.width;
		var H = this.mask_canvas.height;
		var temp = document.createElement('canvas');
		temp.width = W;
		temp.height = H;
		temp.getContext('2d').drawImage(this.mask_canvas, 0, 0);

		this.mask_ctx.clearRect(0, 0, W, H);
		this.mask_ctx.drawImage(temp, dx, dy);
		this.update_mask_state();
		config.need_render = true;
	}

	apply_shape_to_mask(shape, x, y, width, height, path, mode = null, targetCtx = this.mask_ctx) {
		if (mode == null || mode === 'replace') {
			targetCtx.clearRect(0, 0, this.mask_canvas.width, this.mask_canvas.height);
			targetCtx.globalCompositeOperation = 'source-over';
		}
		else if (mode === 'add') {
			targetCtx.globalCompositeOperation = 'source-over';
		}
		else if (mode === 'subtract') {
			targetCtx.globalCompositeOperation = 'destination-out';
		}
		else if (mode === 'intersect') {
			targetCtx.globalCompositeOperation = 'destination-in';
		}

		targetCtx.beginPath();
		this._build_shape_path(targetCtx, { shape, x, y, width, height, path });
		targetCtx.fillStyle = '#ffffff';
		targetCtx.fill();
		targetCtx.globalCompositeOperation = 'source-over';
	}

	compute_preview_contours(shape, x, y, width, height, path, mode = null) {
		if (!this._preview_canvas) {
			this._preview_canvas = document.createElement('canvas');
		}
		var W = Math.max(1, config.WIDTH || 800);
		var H = Math.max(1, config.HEIGHT || 600);
		if (this._preview_canvas.width !== W || this._preview_canvas.height !== H) {
			this._preview_canvas.width = W;
			this._preview_canvas.height = H;
		}
		var pctx = this._preview_canvas.getContext('2d', { willReadFrequently: true });
		pctx.clearRect(0, 0, W, H);

		if (mode != null && this.has_selection) {
			pctx.drawImage(this.mask_canvas, 0, 0);
		}

		this.apply_shape_to_mask(shape, x, y, width, height, path, mode, pctx);
		this._preview_contours = this._trace_mask_contours(this._preview_canvas);
		config.need_render = true;
	}

	update_mask_state() {
		var contours = this._trace_mask_contours(this.mask_canvas);
		if (!contours || contours.length === 0) {
			this.has_selection = false;
			this.selection_bounds = null;
			this.selection_contours = [];
		} else {
			this.has_selection = true;
			this.selection_contours = contours;
			var min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
			for (var c = 0; c < contours.length; c++) {
				for (var p = 0; p < contours[c].length; p++) {
					min_x = Math.min(min_x, contours[c][p][0]);
					min_y = Math.min(min_y, contours[c][p][1]);
					max_x = Math.max(max_x, contours[c][p][0]);
					max_y = Math.max(max_y, contours[c][p][1]);
				}
			}
			this.selection_bounds = {
				min_x: min_x,
				min_y: min_y,
				max_x: max_x,
				max_y: max_y,
				width: max_x - min_x,
				height: max_y - min_y,
			};
		}
		for (var k in settings_all) {
			var s = settings_all[k];
			if (s && s.marching_ants_mode) {
				if (this.has_selection && this.selection_bounds) {
					if (s.data) {
						s.data.x = this.selection_bounds.min_x;
						s.data.y = this.selection_bounds.min_y;
						s.data.width = this.selection_bounds.width;
						s.data.height = this.selection_bounds.height;
					}
				} else if (s.data) {
					s.data.x = null;
					s.data.y = null;
					s.data.width = null;
					s.data.height = null;
				}
			}
		}
		config.need_render = true;
	}

	set_mask_canvas(src) {
		var W = Math.max(1, config.WIDTH || (src ? src.width : 800));
		var H = Math.max(1, config.HEIGHT || (src ? src.height : 600));
		if (this.mask_canvas.width !== W || this.mask_canvas.height !== H) {
			this.mask_canvas.width = W;
			this.mask_canvas.height = H;
		}
		this.mask_ctx.clearRect(0, 0, W, H);
		if (src) {
			this.mask_ctx.drawImage(src, 0, 0);
		}
		this.update_mask_state();
	}

	clone_mask_canvas() {
		var c = document.createElement('canvas');
		c.width = this.mask_canvas.width;
		c.height = this.mask_canvas.height;
		c.getContext('2d').drawImage(this.mask_canvas, 0, 0);
		return c;
	}

	clear_mask() {
		this.mask_ctx.clearRect(0, 0, this.mask_canvas.width, this.mask_canvas.height);
		this.has_selection = false;
		this.selection_bounds = null;
		this.selection_contours = [];
		this._preview_contours = null;
		this._preview_lasso_path = null;
		if (app.Layers && app.Layers.Selection) {
			app.Layers.Selection.selection.x = null;
			app.Layers.Selection.selection.y = null;
			app.Layers.Selection.selection.width = null;
			app.Layers.Selection.selection.height = null;
		}
		config.need_render = true;
	}

	select_all() {
		this.mask_ctx.fillStyle = '#ffffff';
		this.mask_ctx.fillRect(0, 0, this.mask_canvas.width, this.mask_canvas.height);
		this.update_mask_state();
	}

	draw_marching_ants(target_ctx = null) {
		var ctx = target_ctx || this.ctx;
		var Z = config.ZOOM || 1;

		var phase = Math.floor(performance.now() / 50);
		this.ant_offset = -(phase % 8) / Z;

		var dash = 4 / Z;
		var gap = 4 / Z;

		var contours = this._preview_contours || (this.has_selection ? this.selection_contours : null);
		if (contours && contours.length > 0) {
			ctx.save();
			ctx.lineJoin = 'miter';
			ctx.lineCap = 'butt';

			for (var c = 0; c < contours.length; c++) {
				var pts = contours[c];
				if (!pts || pts.length < 2) continue;

				ctx.beginPath();
				ctx.moveTo(pts[0][0], pts[0][1]);
				for (var i = 1; i < pts.length; i++) {
					ctx.lineTo(pts[i][0], pts[i][1]);
				}
				ctx.closePath();

				//white underlay
				ctx.strokeStyle = '#ffffff';
				ctx.lineWidth = 1 / Z;
				ctx.stroke();

				//animated black dashes
				ctx.strokeStyle = '#000000';
				ctx.lineWidth = 1 / Z;
				ctx.setLineDash([dash, gap]);
				ctx.lineDashOffset = this.ant_offset;
				ctx.stroke();
				ctx.setLineDash([]);
			}

			ctx.restore();
		}

		if (this._preview_lasso_path && this._preview_lasso_path.length > 1) {
			var lpts = this._preview_lasso_path;
			ctx.save();
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';

			ctx.beginPath();
			ctx.moveTo(lpts[0][0], lpts[0][1]);
			for (var j = 1; j < lpts.length; j++) {
				ctx.lineTo(lpts[j][0], lpts[j][1]);
			}
			// Open path: do not call closePath() until mouseup

			//white underlay
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1 / Z;
			ctx.stroke();

			//animated black dashes
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 1 / Z;
			ctx.setLineDash([dash, gap]);
			ctx.lineDashOffset = this.ant_offset;
			ctx.stroke();
			ctx.setLineDash([]);

			ctx.restore();
		}
	}

	_trace_mask_contours(canvas) {
		var W = canvas.width;
		var H = canvas.height;
		var img = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H);
		var d = img.data;

		function is_opaque(x, y) {
			if (x < 0 || y < 0 || x >= W || y >= H) return false;
			return d[(y * W + x) * 4] > 127;
		}

		var all_edges = [];
		var outgoing = {};

		var point_index = {};
		var points = [];
		function get_idx(x, y) {
			var key = x + ',' + y;
			if (key in point_index) return point_index[key];
			var idx = points.length;
			point_index[key] = idx;
			points.push([x, y]);
			return idx;
		}

		for (var j = 0; j < H; j++) {
			for (var i = 0; i < W; i++) {
				if (!is_opaque(i, j)) continue;

				// Top edge: [i, j] -> [i + 1, j] (dir: 0)
				if (!is_opaque(i, j - 1)) {
					var p1 = [i, j], p2 = [i + 1, j];
					var from_id = get_idx(p1[0], p1[1]), to_id = get_idx(p2[0], p2[1]);
					var e_id = all_edges.length;
					all_edges.push({ from: from_id, to: to_id, from_pt: p1, to_pt: p2, dir: 0 });
					if (!outgoing[from_id]) outgoing[from_id] = [];
					outgoing[from_id].push({ to: to_id, pt: p2, edge_id: e_id, dir: 0 });
				}
				// Right edge: [i + 1, j] -> [i + 1, j + 1] (dir: 1)
				if (!is_opaque(i + 1, j)) {
					var p1 = [i + 1, j], p2 = [i + 1, j + 1];
					var from_id = get_idx(p1[0], p1[1]), to_id = get_idx(p2[0], p2[1]);
					var e_id = all_edges.length;
					all_edges.push({ from: from_id, to: to_id, from_pt: p1, to_pt: p2, dir: 1 });
					if (!outgoing[from_id]) outgoing[from_id] = [];
					outgoing[from_id].push({ to: to_id, pt: p2, edge_id: e_id, dir: 1 });
				}
				// Bottom edge: [i + 1, j + 1] -> [i, j + 1] (dir: 2)
				if (!is_opaque(i, j + 1)) {
					var p1 = [i + 1, j + 1], p2 = [i, j + 1];
					var from_id = get_idx(p1[0], p1[1]), to_id = get_idx(p2[0], p2[1]);
					var e_id = all_edges.length;
					all_edges.push({ from: from_id, to: to_id, from_pt: p1, to_pt: p2, dir: 2 });
					if (!outgoing[from_id]) outgoing[from_id] = [];
					outgoing[from_id].push({ to: to_id, pt: p2, edge_id: e_id, dir: 2 });
				}
				// Left edge: [i, j + 1] -> [i, j] (dir: 3)
				if (!is_opaque(i - 1, j)) {
					var p1 = [i, j + 1], p2 = [i, j];
					var from_id = get_idx(p1[0], p1[1]), to_id = get_idx(p2[0], p2[1]);
					var e_id = all_edges.length;
					all_edges.push({ from: from_id, to: to_id, from_pt: p1, to_pt: p2, dir: 3 });
					if (!outgoing[from_id]) outgoing[from_id] = [];
					outgoing[from_id].push({ to: to_id, pt: p2, edge_id: e_id, dir: 3 });
				}
			}
		}

		if (!all_edges.length) return [];

		var used_edges = new Uint8Array(all_edges.length);
		var contours = [];

		for (var e = 0; e < all_edges.length; e++) {
			if (used_edges[e]) continue;
			used_edges[e] = 1;

			var start_idx = all_edges[e].from;
			var contour = [all_edges[e].from_pt, all_edges[e].to_pt];
			var cur_idx = all_edges[e].to;
			var cur_dir = all_edges[e].dir;

			var guard = 0;
			while (cur_idx !== start_idx && guard++ < all_edges.length * 2) {
				var next_edge = null;
				var out = outgoing[cur_idx];
				if (out) {
					if (out.length === 1) {
						if (!used_edges[out[0].edge_id]) {
							next_edge = out[0];
						}
					} else {
						var best_edge = null;
						var best_priority = -1;
						for (var k = 0; k < out.length; k++) {
							if (used_edges[out[k].edge_id]) continue;
							var rel = (out[k].dir - cur_dir + 4) % 4;
							var priority = (rel === 1) ? 4 : (rel === 0) ? 3 : (rel === 3) ? 2 : 1;
							if (priority > best_priority) {
								best_priority = priority;
								best_edge = out[k];
							}
						}
						next_edge = best_edge;
					}
				}
				if (!next_edge) break;
				used_edges[next_edge.edge_id] = 1;
				cur_idx = next_edge.to;
				cur_dir = next_edge.dir;
				if (cur_idx !== start_idx) {
					contour.push(next_edge.pt);
				}
			}

			if (cur_idx === start_idx && contour.length >= 3) {
				var simplified = [];
				for (var p = 0; p < contour.length; p++) {
					var prev = contour[(p - 1 + contour.length) % contour.length];
					var curr = contour[p];
					var next = contour[(p + 1) % contour.length];
					var dx1 = curr[0] - prev[0];
					var dy1 = curr[1] - prev[1];
					var dx2 = next[0] - curr[0];
					var dy2 = next[1] - curr[1];
					var cross = dx1 * dy2 - dy1 * dx2;
					var dot = dx1 * dx2 + dy1 * dy2;
					if (Math.abs(cross) < 1e-4 && dot > 0) {
						continue;
					}
					simplified.push(curr);
				}
				if (simplified.length >= 3) {
					contours.push(simplified);
				}
			}
		}

		return contours;
	}

	create_layer_selection_alpha(layer) {
		var w = Math.max(1, Math.round(layer.width_original || layer.width || 1));
		var h = Math.max(1, Math.round(layer.height_original || layer.height || 1));
		var canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		var ctx = canvas.getContext('2d', { willReadFrequently: true });

		if (!this.has_selection) {
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, w, h);
			return canvas;
		}

		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var lw = (layer.width != null && layer.width > 0) ? layer.width : (config.WIDTH || 1);
		var lh = (layer.height != null && layer.height > 0) ? layer.height : (config.HEIGHT || 1);
		var lwo = layer.width_original || lw;
		var lho = layer.height_original || lh;
		var rot = layer.rotate || 0;

		ctx.save();
		ctx.scale(lwo / lw, lho / lh);
		if (rot !== 0) {
			var cx = lw / 2;
			var cy = lh / 2;
			ctx.translate(cx, cy);
			ctx.rotate(-rot * Math.PI / 180);
			ctx.translate(-cx, -cy);
		}
		ctx.translate(-lx, -ly);
		ctx.drawImage(this.mask_canvas, 0, 0);
		ctx.restore();
		return canvas;
	}

	restore_outside_selection(edited, original, layer) {
		if (edited == null || original == null || layer == null)
			return;
		if (!this.has_selection)
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

	extract_selection_image(layer) {
		if (layer == null)
			layer = config.layer;
		if (layer == null)
			return null;

		var bounds = this.selection_bounds;
		var crop_min_x, crop_min_y, crop_max_x, crop_max_y, crop_w, crop_h;

		if (this.has_selection && bounds && bounds.width > 0 && bounds.height > 0) {
			crop_min_x = Math.max(0, Math.floor(bounds.min_x));
			crop_min_y = Math.max(0, Math.floor(bounds.min_y));
			crop_max_x = Math.min(config.WIDTH, Math.ceil(bounds.max_x));
			crop_max_y = Math.min(config.HEIGHT, Math.ceil(bounds.max_y));
			if (crop_max_x <= crop_min_x || crop_max_y <= crop_min_y)
				return null;
			crop_w = crop_max_x - crop_min_x;
			crop_h = crop_max_y - crop_min_y;
		} else {
			crop_min_x = 0;
			crop_min_y = 0;
			crop_max_x = config.WIDTH;
			crop_max_y = config.HEIGHT;
			crop_w = config.WIDTH;
			crop_h = config.HEIGHT;
		}

		var out_canvas = document.createElement('canvas');
		out_canvas.width = Math.max(1, crop_w);
		out_canvas.height = Math.max(1, crop_h);
		var octx = out_canvas.getContext('2d');

		octx.save();
		octx.translate(-crop_min_x, -crop_min_y);

		var src = layer.link_canvas || layer.link;
		var lw = (layer.width != null) ? layer.width : (layer.width_original || (src ? src.width : config.WIDTH));
		var lh = (layer.height != null) ? layer.height : (layer.height_original || (src ? src.height : config.HEIGHT));
		var lx = (layer.x != null) ? layer.x : 0;
		var ly = (layer.y != null) ? layer.y : 0;
		var rot = (layer.rotate != null) ? layer.rotate : 0;

		if (layer.type == 'image' && src != null) {
			octx.save();
			octx.translate(lx + lw / 2, ly + lh / 2);
			if (rot !== 0) {
				octx.rotate((rot * Math.PI) / 180);
			}
			octx.drawImage(src, -lw / 2, -lh / 2, lw, lh);
			octx.restore();
		} else if (app.Layers != null && typeof app.Layers.render_object == 'function') {
			app.Layers.render_object(octx, layer);
		}
		octx.restore();

		if (this.has_selection) {
			octx.globalCompositeOperation = 'destination-in';
			octx.drawImage(this.mask_canvas, crop_min_x, crop_min_y, crop_w, crop_h, 0, 0, crop_w, crop_h);
			octx.globalCompositeOperation = 'source-over';
		}

		return {
			canvas: out_canvas,
			x: crop_min_x,
			y: crop_min_y,
			width: crop_w,
			height: crop_h,
		};
	}

	create_selection_clip_canvas() {
		return this.clone_mask_canvas();
	}

	get_selection_clip_mask() {
		if (!this.has_selection) return null;
		return {
			link: this.clone_mask_canvas(),
			x: 0,
			y: 0,
			width: this.mask_canvas.width,
			height: this.mask_canvas.height,
			enabled: true,
			linked: true,
			_selection_clip: true,
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

		var x = settings.data.x;
		var y = settings.data.y;
		var w = settings.data.width;
		var h = settings.data.height;

		//simplify checks
		var event_type = e.type;
		if (event_type == 'touchstart' || event_type == 'pointerdown') event_type = 'mousedown';
		if (event_type == 'touchmove' || event_type == 'pointermove') event_type = 'mousemove';
		if (event_type == 'touchend' || event_type == 'pointerup' || event_type == 'pointercancel') event_type = 'mouseup';

		var is_drag = this.is_drag || (config.mouse && config.mouse.is_drag);

		if (!is_drag && ['mousedown', 'mouseup'].includes(event_type))
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
		if (event_type == 'mousemove' && this.mouse_lock == 'selected_object_actions' && is_drag) {

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
				const is_corner = (is_drag_type_left || is_drag_type_right) && (is_drag_type_top || is_drag_type_bottom);
				const is_side_horizontal = (is_drag_type_left || is_drag_type_right) && !is_drag_type_top && !is_drag_type_bottom;
				const is_side_vertical = (is_drag_type_top || is_drag_type_bottom) && !is_drag_type_left && !is_drag_type_right;

				const is_shift = (e.shiftKey === true) || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_shift_down);
				// Tool-specific keep_ratio (e.g. crop aspect presets) wins over select's global aspect_lock
				const base_lock = (settings.keep_ratio !== undefined)
					? !!settings.keep_ratio
					: ((config.aspect_lock !== undefined) ? config.aspect_lock : true);
				// Maintain aspect ratio on all handles unless shift is held
				const keep_ratio = is_shift ? !base_lock : base_lock;

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

				var orig_w = Math.max(1, this.click_details.width || 1);
				var orig_h = Math.max(1, this.click_details.height || 1);
				var ratio = (settings.fixed_ratio && settings.fixed_ratio > 0)
					? settings.fixed_ratio
					: (orig_w / orig_h);

				if (keep_ratio) {
					if (is_corner) {
						var width_new = Math.round(height * ratio);
						var height_new = Math.round(width / ratio);

						if (Math.abs(width * 100 / width_new) > Math.abs(height * 100 / height_new)) {
							height = height_new;
						}
						else {
							width = width_new;
						}
					} else if (is_side_horizontal) {
						height = Math.max(1, Math.round(width / ratio));
					} else if (is_side_vertical) {
						width = Math.max(1, Math.round(height * ratio));
					}
				}

				if (is_alt) {
					var cx = this.click_details.x + this.click_details.width / 2;
					var cy = this.click_details.y + this.click_details.height / 2;

					settings.data.width = width;
					settings.data.height = height;
					settings.data.x = Math.round(cx - width / 2);
					settings.data.y = Math.round(cy - height / 2);
				} else {
					settings.data.width = width;
					settings.data.height = height;

					if (is_corner) {
						settings.data.x = is_drag_type_left ? (this.click_details.x - (width - this.click_details.width)) : this.click_details.x;
						settings.data.y = is_drag_type_top ? (this.click_details.y - (height - this.click_details.height)) : this.click_details.y;
					} else if (is_side_horizontal) {
						settings.data.x = is_drag_type_left ? (this.click_details.x - (width - this.click_details.width)) : this.click_details.x;
						if (keep_ratio) {
							settings.data.y = Math.round(this.click_details.y - (height - this.click_details.height) / 2);
						} else {
							settings.data.y = this.click_details.y;
						}
					} else if (is_side_vertical) {
						settings.data.y = is_drag_type_top ? (this.click_details.y - (height - this.click_details.height)) : this.click_details.y;
						if (keep_ratio) {
							settings.data.x = Math.round(this.click_details.x - (width - this.click_details.width) / 2);
						} else {
							settings.data.y = this.click_details.y;
						}
					} else {
						settings.data.x = this.click_details.x;
						settings.data.y = this.click_details.y;
					}
				}

				if (app.GUI && app.GUI.GUI_tools && typeof app.GUI.GUI_tools.update_transform_indicators === 'function') {
					app.GUI.GUI_tools.update_transform_indicators(settings.data.width, settings.data.height);
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

				// Keep crop rectangle inside document bounds and preserve fixed aspect
				if (settings.crop_shield === true) {
					var doc_w = config.WIDTH;
					var doc_h = config.HEIGHT;
					if (settings.data.x < 0) {
						settings.data.width += settings.data.x;
						settings.data.x = 0;
					}
					if (settings.data.y < 0) {
						settings.data.height += settings.data.y;
						settings.data.y = 0;
					}
					if (settings.data.x + settings.data.width > doc_w) {
						settings.data.width = doc_w - settings.data.x;
					}
					if (settings.data.y + settings.data.height > doc_h) {
						settings.data.height = doc_h - settings.data.y;
					}
					settings.data.width = Math.max(1, settings.data.width);
					settings.data.height = Math.max(1, settings.data.height);
					if (keep_ratio && settings.fixed_ratio && settings.fixed_ratio > 0) {
						var fr = settings.fixed_ratio;
						if (settings.data.width / settings.data.height > fr) {
							settings.data.width = Math.max(1, Math.round(settings.data.height * fr));
						}
						else {
							settings.data.height = Math.max(1, Math.round(settings.data.width / fr));
						}
						if (settings.data.x + settings.data.width > doc_w) {
							settings.data.x = Math.max(0, doc_w - settings.data.width);
						}
						if (settings.data.y + settings.data.height > doc_h) {
							settings.data.y = Math.max(0, doc_h - settings.data.height);
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
			//project the mouse into the space the handle paths were drawn in.
			//the paths live in the layer's pre-transform content space: world space
			//when unrotated, and centered-local space for a rotated layer. Doing the
			//projection here (pure math) makes the hit-test independent of any
			//leftover transform on the context.
			let testX = mouse.x;
			let testY = mouse.y;
			if (data.rotate != null && data.rotate != 0) {
				const rot_rad = data.rotate * Math.PI / 180;
				const cosA = Math.cos(-rot_rad);
				const sinA = Math.sin(-rot_rad);
				const rx = mouse.x - (x + w / 2);
				const ry = mouse.y - (y + h / 2);
				testX = rx * cosA - ry * sinA;
				testY = rx * sinA + ry * cosA;
			}

			//set mouse move cursor if hovering inside body of layer
			const inBody = (data.rotate != null && data.rotate != 0)
				? (testX > -w / 2 && testX < w / 2 && testY > -h / 2 && testY < h / 2)
				: (mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h);

			if (settings.enable_move && inBody) {
				mainWrapper.style.cursor = "move";
			}

			if (this.ctx) {
				this.ctx.save();
				this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			}

			let handleMatched = false;
			for (let current_drag_type in this.selected_obj_positions) {
				const position = this.selected_obj_positions[current_drag_type];
				if (position.path && this.ctx && this.ctx.isPointInPath(position.path, testX, testY)) {
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

			if (this.ctx) {
				this.ctx.restore();
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
		}
	}

}

export default Base_selection_class;
