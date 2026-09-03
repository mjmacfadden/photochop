/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../config.js';
import Base_layers_class from './base-layers.js';
import Base_gui_class from './base-gui.js';
import app from "../app";
import Helper_class from "../libs/helpers";

/**
 * Base tools class, can be used for extending on tools like brush, provides various helping methods.
 */
class Base_tools_class {

	constructor(save_mouse) {
		this.Base_layers = new Base_layers_class();
		this.Base_gui = new Base_gui_class();
		this.Helper = new Helper_class();
		this.is_drag = false;
		this.mouse_last_click_pos = [false, false];
		this.mouse_click_pos = [false, false];
		this.mouse_move_last = [false, false];
		this.mouse_valid = false;
		this.mouse_click_valid = false;
		this.speed_average = 0;
		this.save_mouse = save_mouse;
		this.is_touch = false;
		this.shape_mouse_click = {x: null, y: null};

		this.prepare();

		if (this.save_mouse == true) {
			this.events();
		}
	}

	get_active_tool() {
		if (app.GUI && app.GUI.GUI_tools && config.TOOL) {
			var mod = app.GUI.GUI_tools.tools_modules[config.TOOL.name];
			if (mod && mod.object) {
				return mod.object;
			}
		}
		return null;
	}

	dragStart(event) {
		var _this = this;

		_this.is_drag = true;
		_this.set_mouse_info(event);

		_this.mouse_click_pos[0] = config.mouse.x;
		_this.mouse_click_pos[1] = config.mouse.y;
		_this.mouse_last_click_pos[0] = config.mouse.x;
		_this.mouse_last_click_pos[1] = config.mouse.y;

		config.mouse.click_x = config.mouse.x;
		config.mouse.click_y = config.mouse.y;
		config.mouse.last_click_x = config.mouse.x;
		config.mouse.last_click_y = config.mouse.y;
		config.mouse.is_drag = true;
		config.mouse.click_valid = _this.mouse_click_valid;

		_this.speed_average = 0;

		// Dispatch to active tool
		var activeTool = _this.get_active_tool();
		if (activeTool && typeof activeTool.mousedown === 'function') {
			activeTool.mousedown(event);
		}
	}

	dragMove(event) {
		var _this = this;
		_this.set_mouse_info(event);

		_this.speed_average = _this.calc_average_mouse_speed(event);

		// Dispatch to active tool
		var activeTool = _this.get_active_tool();
		if (activeTool) {
			if (typeof activeTool.mousemove === 'function') {
				activeTool.mousemove(event);
			}

			// Custom brush cursor outline
			var brushTools = ['brush', 'pencil', 'erase', 'clone', 'spot_heal', 'blur', 'sharpen', 'desaturate', 'bulge_pinch'];
			if (config.TOOL && brushTools.includes(config.TOOL.name)) {
				var params = activeTool.getParams ? activeTool.getParams() : (config.TOOL.attributes || {});
				var size = params.size?.value ?? params.size ?? 10;
				var cursorType = (config.TOOL.name === 'clone' && (event.altKey || (app.GUI && app.GUI.GUI_shortcuts && app.GUI.GUI_shortcuts.is_alt_down))) ? 'crosshair' : 'circle';
				_this.show_mouse_cursor(config.mouse.x, config.mouse.y, size, cursorType);
			}
		}
	}

	dragEnd(event) {
		var _this = this;
		_this.is_drag = false;
		_this.set_mouse_info(event);

		// Dispatch to active tool
		var activeTool = _this.get_active_tool();
		if (activeTool && typeof activeTool.mouseup === 'function') {
			activeTool.mouseup(event);
		}
	}

	doubleClick(event) {
		var _this = this;
		_this.set_mouse_info(event);

		var activeTool = _this.get_active_tool();
		if (activeTool) {
			if (typeof activeTool.dblclick === 'function') {
				activeTool.dblclick(event);
			} else if (typeof activeTool.doubleClick === 'function' && activeTool.doubleClick !== Base_tools_class.prototype.doubleClick) {
				activeTool.doubleClick(event);
			}
		}
	}

	keyDown(event) {
		if (this.Helper.is_input(event.target)) return;
		if (app.GUI && app.GUI.POP && typeof app.GUI.POP.get_active_instances === 'function' && app.GUI.POP.get_active_instances() > 0) return;

		var activeTool = this.get_active_tool();
		if (activeTool && typeof activeTool.keydown === 'function') {
			activeTool.keydown(event);
		}
	}

	keyUp(event) {
		if (this.Helper.is_input(event.target)) return;
		if (app.GUI && app.GUI.POP && typeof app.GUI.POP.get_active_instances === 'function' && app.GUI.POP.get_active_instances() > 0) return;

		var activeTool = this.get_active_tool();
		if (activeTool && typeof activeTool.keyup === 'function') {
			activeTool.keyup(event);
		}
	}

	events() {
		var _this = this;

		// Pointer events (unifies mouse, pen/stylus pressure, and touch)
		document.addEventListener('pointerdown', function (event) {
			if (event.pointerType === 'touch') _this.is_touch = true;
			_this.dragStart(event);
		});
		document.addEventListener('pointermove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('pointerup', function (event) {
			_this.dragEnd(event);
		});
		document.addEventListener('pointercancel', function (event) {
			_this.dragEnd(event);
		});

		// Fallback for non-PointerEvent browsers
		document.addEventListener('mousedown', function (event) {
			if (window.PointerEvent) return;
			if (_this.is_touch == true) return;
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			if (window.PointerEvent) return;
			if (_this.is_touch == true) return;
			_this.dragMove(event);
		});
		document.addEventListener('mouseup', function (event) {
			if (window.PointerEvent) return;
			if (_this.is_touch == true) return;
			_this.dragEnd(event);
		});

		// Double click
		document.addEventListener('dblclick', function (event) {
			_this.doubleClick(event);
		});

		// Keyboard routing
		document.addEventListener('keydown', function (event) {
			_this.keyDown(event);
		});
		document.addEventListener('keyup', function (event) {
			_this.keyUp(event);
		});

		// Touch fallback
		document.addEventListener('touchstart', function (event) {
			if (window.PointerEvent) return;
			_this.is_touch = true;
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			if (window.PointerEvent) return;
			_this.dragMove(event);
			if (event.target.id === "canvas_minipaint" && !$('.scroll').has($(event.target)).length)
				event.preventDefault();
		}, { passive: false });
		document.addEventListener('touchend', function (event) {
			if (window.PointerEvent) return;
			_this.dragEnd(event);
		});

		// On resize
		window.addEventListener('resize', function (event) {
			_this.prepare();
		});
	}

	/**
	 * do preparation
	 */
	prepare() {
		this.is_drag = config.mouse.is_drag;
	}

	set_mouse_info(event) {
		if (this.save_mouse !== true) {
			//not main
			return false;
		}

		var eventType = event.type;
		var is_down = (eventType === 'mousedown' || eventType === 'touchstart' || eventType === 'pointerdown');
		var is_move = (eventType === 'mousemove' || eventType === 'touchmove' || eventType === 'pointermove');
		var is_up = (eventType === 'mouseup' || eventType === 'touchend' || eventType === 'pointerup' || eventType === 'pointercancel');

		const isInsideCanvas = !!(event.target && (
			event.target.id === 'canvas_minipaint' ||
			event.target.id === 'canvas_overlay' ||
			event.target.id === 'mouse' ||
			event.target.id === 'canvas_wrapper' ||
			event.target.id === 'main_wrapper' ||
			(event.target.closest && event.target.closest('#main_wrapper') != null)
		));

		this.mouse_valid = isInsideCanvas;

		if (is_down) {
			var is_primary = (event.button === 0 || event.button === undefined || event.buttons === 1 || event.which === 1 || eventType === 'touchstart');
			if (!isInsideCanvas || !is_primary) {
				this.mouse_click_valid = false;
			}
			else {
				this.mouse_click_valid = true;
			}
		} else if (is_up) {
			this.mouse_click_valid = false;
			this.is_drag = false;
		}

		if (event.changedTouches) {
			//using touch events
			event = event.changedTouches[0];
		}

		var mouse_coords = this.get_mouse_coordinates_from_event(event);
		var mouse_x = mouse_coords.x;
		var mouse_y = mouse_coords.y;

		var start_pos = this.Base_layers.get_world_coords(0, 0);
		var x_rel = mouse_x - start_pos.x;
		var y_rel = mouse_y - start_pos.y;

		var pressure = 0.5;
		if (event.pressure !== undefined && event.pressure > 0 && event.pressure <= 1) {
			pressure = event.pressure;
		}

		//save
		config.mouse = {
			x: mouse_x,
			y: mouse_y,
			x_rel: x_rel,
			y_rel: y_rel,
			last_click_x: this.mouse_last_click_pos[0], //last click
			last_click_y: this.mouse_last_click_pos[1], //last click
			click_x: this.mouse_click_pos[0],
			click_y: this.mouse_click_pos[1],
			last_x: this.mouse_move_last[0],
			last_y: this.mouse_move_last[1],
			valid: this.mouse_valid,
			click_valid: this.mouse_click_valid,
			is_drag: this.is_drag,
			speed_average: this.speed_average,
			pressure: pressure,
		};

		if (is_move) {
			//save last pos
			this.mouse_move_last[0] = mouse_x;
			this.mouse_move_last[1] = mouse_y;
		}
	}

	get_mouse_coordinates_from_event(event) {
		var canvas_dom = document.getElementById('canvas_minipaint');
		var mouse_x, mouse_y;
		if (canvas_dom) {
			var canvas_rect = canvas_dom.getBoundingClientRect();
			var client_x = (event.clientX !== undefined)
				? event.clientX
				: (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : (event.pageX - (window.pageXOffset || window.scrollX || 0)));
			var client_y = (event.clientY !== undefined)
				? event.clientY
				: (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientY : (event.pageY - (window.pageYOffset || window.scrollY || 0)));
			mouse_x = client_x - canvas_rect.left - (canvas_dom.clientLeft || 0);
			mouse_y = client_y - canvas_rect.top - (canvas_dom.clientTop || 0);
		} else {
			mouse_x = event.pageX - this.Base_gui.canvas_offset.x;
			mouse_y = event.pageY - this.Base_gui.canvas_offset.y;
		}

		//adapt coords to ZOOM
		var global_pos = this.Base_layers.get_world_coords(mouse_x, mouse_y);
		return {
			x: global_pos.x,
			y: global_pos.y,
		};
	}

	get_mouse_info(event) {
		if (typeof event != "undefined" && (!config.mouse || typeof config.mouse.x == "undefined")) {
			//mouse not set yet - set it now...
			this.set_mouse_info(event);
		}
		return config.mouse;
	}

	calc_average_mouse_speed(event) {
		if (this.is_drag == false)
			return null;

		//calc average speed
		var avg_speed_max = 30;
		var avg_speed_changing_power = 2;
		var mouse = this.get_mouse_info(event, true);

		var dx = Math.abs(mouse.x - mouse.last_x);
		var dy = Math.abs(mouse.y - mouse.last_y);
		var delta = Math.sqrt(dx * dx + dy * dy);
		var mouse_average_speed = this.speed_average;
		if (delta > avg_speed_max / 2) {
			mouse_average_speed += avg_speed_changing_power;
		}
		else {
			mouse_average_speed -= avg_speed_changing_power;
		}
		mouse_average_speed = Math.max(0, mouse_average_speed); //min
		mouse_average_speed = Math.min(avg_speed_max, mouse_average_speed); //max

		return mouse_average_speed;
	}

	get_params_hash() {
		var data = [
			this.getParams(),
			config.COLOR,
			config.ALPHA,
		];
		return JSON.stringify(data);
	}

	clone(object) {
		return JSON.parse(JSON.stringify(object));
	}

	copy_layer_snapshot() {
		var src = config.layer.link_canvas || config.layer.link;
		if (src == null)
			return null;
		var canvas = document.createElement('canvas');
		canvas.width = config.layer.width_original || src.width || 1;
		canvas.height = config.layer.height_original || src.height || 1;
		canvas.getContext('2d').drawImage(src, 0, 0);
		return canvas;
	}

	constrain_edit_to_selection(editedCanvas, originalCanvas) {
		if (editedCanvas == null || originalCanvas == null)
			return;
		if (this.Base_layers == null || this.Base_layers.Base_selection == null)
			return;
		this.Base_layers.Base_selection.restore_outside_selection(
			editedCanvas, originalCanvas, config.layer
		);
	}

	selection_clip_mask() {
		if (this.Base_layers == null || this.Base_layers.Base_selection == null)
			return null;
		return this.Base_layers.Base_selection.get_selection_clip_mask();
	}

	/**
	 * customized mouse cursor
	 *
	 * @param {int} x
	 * @param {int} y
	 * @param {int} size
	 * @param {string} type circle, rect
	 */
	show_mouse_cursor(x, y, size, type) {
		var element = document.getElementById('mouse');
		if (!element) return;

		if (config.mouse && config.mouse.valid === false) {
			this._pending_cursor = null;
			element.className = '';
			return;
		}

		this._pending_cursor = { x, y, size, type, zoom: config.ZOOM };
		if (this._cursor_raf != null) return;
		this._cursor_raf = requestAnimationFrame(() => {
			this._cursor_raf = null;
			if (!this._pending_cursor) return;
			var { x, y, size, type, zoom } = this._pending_cursor;
			var start_pos = this.Base_layers.get_world_coords(0, 0);
			x = x - start_pos.x;
			y = y - start_pos.y;

			var display_size = Math.max(2, Math.round((size || 1) * zoom));
			x = x * zoom;
			y = y * zoom;

			element.style.width = display_size + 'px';
			element.style.height = display_size + 'px';
			element.style.left = Math.round(x - display_size / 2) + 'px';
			element.style.top = Math.round(y - display_size / 2) + 'px';

			element.className = '';
			element.classList.add(type);
		});
	}

	getParams() {
		const params = {};
		// Number inputs return the .value if defined as objects.
		for (let attributeName in config.TOOL.attributes) {
			const attribute = config.TOOL.attributes[attributeName];
			if (!isNaN(attribute.value) && attribute.value != null) {
				if (typeof attribute.value === 'string') {
					params[attributeName] = attribute;
				} else {
					params[attributeName] = attribute.value;
				}
			} else {
				params[attributeName] = attribute;
			}
		}
		return params;
	}

	adaptSize(value, type = "width") {
		var response;
		if (config.layer.width_original == null) {
			return value;
		}

		if (type === "width") {
			response = value / (config.layer.width / config.layer.width_original);
		}
		else {
			response = value / (config.layer.height / config.layer.height_original);
		}

		return response;
	}

	draw_shape(ctx, x, y, width, height, coords, is_demo) {
		if(is_demo !== false) {
			ctx.fillStyle = '#aaa';
			ctx.strokeStyle = '#555';
			ctx.lineWidth = 2;
		}
		ctx.lineJoin = "round";

		ctx.beginPath();
		for(var i in coords){
			if(coords[i] === null){
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				ctx.beginPath();
				continue;
			}

			//coords in 100x100 box
			var pos_x = x + coords[i][0] * width / 100;
			var pos_y = y + coords[i][1] * height / 100;

			if(i == '0')
				ctx.moveTo(pos_x, pos_y);
			else
				ctx.lineTo(pos_x, pos_y);
		}
		ctx.closePath();

		ctx.fill();
		ctx.stroke();
	}

	default_events(){
		// No-op: input events are handled and routed centrally by Base_tools_class singleton
	}

	default_dragStart(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousedown(event);
	}

	default_dragMove(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mousemove(event);
	}

	default_dragEnd(event) {
		if (config.TOOL.name != this.name)
			return;
		this.mouseup(event);
	}

	shape_mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		var mouse_x = mouse.x;
		var mouse_y = mouse.y;

		//apply snap
		var snap_info = this.calc_snap_position(e, mouse_x, mouse_y);
		if(snap_info != null){
			if(snap_info.x != null) {
				mouse_x = snap_info.x;
			}
			if(snap_info.y != null) {
				mouse_y = snap_info.y;
			}
		}

		this.shape_mouse_click.x = mouse_x;
		this.shape_mouse_click.y = mouse_y;

		//register new object - current layer is not ours or params changed
		this.layer = {
			type: this.name,
			params: this.clone(this.getParams()),
			status: 'draft',
			render_function: [this.name, 'render'],
			x: Math.round(mouse_x),
			y: Math.round(mouse_y),
			color: null,
			is_vector: true,
			mask: this.selection_clip_mask(),
		};
		app.State.do_action(
			new app.Actions.Bundle_action('new_'+this.name+'_layer', 'New '+this.Helper.ucfirst(this.name)+' Layer', [
				new app.Actions.Insert_layer_action(this.layer)
			])
		);
	}

	shape_mousemove(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();

		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var mouse_x = Math.round(mouse.x);
		var mouse_y = Math.round(mouse.y);
		var click_x = Math.round(this.shape_mouse_click.x);
		var click_y = Math.round(this.shape_mouse_click.y);

		//apply snap
		var snap_info = this.calc_snap_position(e, mouse_x, mouse_y, config.layer.id);
		if(snap_info != null){
			if(snap_info.x != null) {
				mouse_x = snap_info.x;
			}
			if(snap_info.y != null) {
				mouse_y = snap_info.y;
			}
		}

		var x = Math.min(mouse_x, click_x);
		var y = Math.min(mouse_y, click_y);
		var width = Math.abs(mouse_x - click_x);
		var height = Math.abs(mouse_y - click_y);

		if (e.ctrlKey == true || e.metaKey) {
			if (width  < height * this.best_ratio) {
				width = height * this.best_ratio;
			}
			else {
				height = width / this.best_ratio;
			}
			if (mouse_x < click_x) {
				x = click_x - width;
			}
			if (mouse_y < click_y) {
				y = click_y - height;
			}
		}

		//more data
		config.layer.x = x;
		config.layer.y = y;
		config.layer.width = width;
		config.layer.height = height;

		this.Base_layers.render();
	}

	shape_mouseup(e) {
		var mouse = this.get_mouse_info(e);
		var params = this.getParams();

		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}

		var mouse_x = Math.round(mouse.x);
		var mouse_y = Math.round(mouse.y);
		var click_x = Math.round(this.shape_mouse_click.x);
		var click_y = Math.round(this.shape_mouse_click.y);

		//apply snap
		var snap_info = this.calc_snap_position(e, mouse_x, mouse_y, config.layer.id);
		if(snap_info != null){
			if(snap_info.x != null) {
				mouse_x = snap_info.x;
			}
			if(snap_info.y != null) {
				mouse_y = snap_info.y;
			}
		}
		this.snap_line_info = {x: null, y: null};

		var x = Math.min(mouse_x, click_x);
		var y = Math.min(mouse_y, click_y);
		var width = Math.abs(mouse_x - click_x);
		var height = Math.abs(mouse_y - click_y);

		if (e.ctrlKey == true || e.metaKey) {
			if (width  < height * this.best_ratio) {
				width = height * this.best_ratio;
			}
			else {
				height = width / this.best_ratio;
			}
			if (mouse_x < click_x) {
				x = click_x - width;
			}
			if (mouse_y < click_y) {
				y = click_y - height;
			}
		}

		if (width == 0 && height == 0) {
			//same coordinates - cancel
			app.State.scrap_last_action();
			return;
		}

		//more data
		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x,
				y,
				width,
				height,
				status: null
			}),
			{ merge_with_history: 'new_'+this.name+'_layer' }
		);
	}

	render_overlay_parent(ctx){
		//x
		if(this.snap_line_info.x !== null) {
			this.Helper.draw_special_line(
				ctx,
				this.snap_line_info.x.start_x,
				this.snap_line_info.x.start_y,
				this.snap_line_info.x.end_x,
				this.snap_line_info.x.end_y
			);
		}

		//y
		if(this.snap_line_info.y !== null) {
			this.Helper.draw_special_line(
				ctx,
				this.snap_line_info.y.start_x,
				this.snap_line_info.y.start_y,
				this.snap_line_info.y.end_x,
				this.snap_line_info.y.end_y
			);
		}
	}

	get_snap_positions(exclude_id) {
		var snap_positions = {
			x: [
				0,
				config.WIDTH/2,
				config.WIDTH,
			],
			y: [
				0,
				config.HEIGHT/2,
				config.HEIGHT,
			],
		};
		if(config.guides_enabled == true){
			//use guides
			for(var i in config.guides){
				var guide = config.guides[i];
				if(guide.y === null)
					snap_positions.x.push(guide.x);
				else
					snap_positions.y.push(guide.y);
			}
		}
		for(var i in config.layers){
			if(exclude_id != null && exclude_id == config.layers[i].id){
				continue;
			}
			if(config.layers[i].visible == false
				|| config.layers[i].x === null || config.layers[i].y === null
				|| config.layers[i].width === null || config.layers[i].height === null){
				continue;
			}

			//x
			var x = config.layers[i].x;
			if(x > 0 && x < config.WIDTH)
				snap_positions.x.push(x);

			var x = config.layers[i].x + config.layers[i].width/2;
			if(x > 0 && x < config.WIDTH)
				snap_positions.x.push(x);

			var x = config.layers[i].x + config.layers[i].width;
			if(x > 0 && x < config.WIDTH)
				snap_positions.x.push(x);

			//y
			var y = config.layers[i].y;
			if(y > 0 && y < config.HEIGHT)
				snap_positions.y.push(y);

			var y = config.layers[i].y + config.layers[i].height/2;
			if(y > 0 && y < config.HEIGHT)
				snap_positions.y.push(y);

			var y = config.layers[i].y + config.layers[i].height;
			if(y > 0 && y < config.HEIGHT)
				snap_positions.y.push(y);
		}

		return snap_positions;
	}

	/**
	 * calculates snap coordinates by current mouse position.
	 *
	 * @param event
	 * @param pos_x
	 * @param pos_y
	 * @param exclude_id
	 * @returns object|null
	 */
	calc_snap_position(event, pos_x, pos_y, exclude_id) {
		var snap_position = { x: null, y: null };
		var params = this.getParams();

		if(config.SNAP === false || event.shiftKey == true || (event.ctrlKey == true || event.metaKey == true)){
			this.snap_line_info = {x: null, y: null};
			return null;
		}

		//settings
		var sensitivity = 0.01;
		var max_distance = (config.WIDTH + config.HEIGHT) / 2 * sensitivity / config.ZOOM;

		//collect snap positions
		if(typeof exclude_id != "undefined")
			var snap_positions = this.get_snap_positions(exclude_id);
		else
			var snap_positions = this.get_snap_positions();

		//find closest snap positions
		var min_value = {
			x: null,
			y: null,
		};
		var min_distance = {
			x: null,
			y: null,
		};
		//x
		for(var i in snap_positions.x){
			var distance = Math.abs(pos_x - snap_positions.x[i]);
			if(distance < max_distance && (distance < min_distance.x || min_distance.x === null)){
				min_distance.x = distance;
				min_value.x = snap_positions.x[i];
			}
		}
		//y
		for(var i in snap_positions.y){
			var distance = Math.abs(pos_y - snap_positions.y[i]);
			if(distance < max_distance && (distance < min_distance.y || min_distance.y === null)){
				min_distance.y = distance;
				min_value.y = snap_positions.y[i];
			}
		}

		//apply snap
		var success = false;

		//x
		if(min_value.x != null) {
			snap_position.x = Math.round(min_value.x);
			success = true;
			this.snap_line_info.x = {
				start_x: min_value.x,
				start_y: 0,
				end_x: min_value.x,
				end_y: config.HEIGHT
			};
		}
		else{
			this.snap_line_info.x = null;
		}
		//y
		if(min_value.y != null) {
			snap_position.y = Math.round(min_value.y);
			success = true;
			this.snap_line_info.y = {
				start_x: 0,
				start_y: min_value.y,
				end_x: config.WIDTH,
				end_y: min_value.y,
			};
		}
		else{
			this.snap_line_info.y = null;
		}

		if(success) {
			return snap_position;
		}

		return null;
	}

}
export default Base_tools_class;
