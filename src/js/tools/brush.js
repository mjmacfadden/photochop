import app from './../app.js';
import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Mask_class from './../modules/mask/mask.js';

class Brush_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Mask = new Mask_class();
		this.name = 'brush';
		this.layer = {};
		this.params_hash = false;
		this.pressure_supported = false;
		this.pointer_pressure = 0; // has range [0 - 1]
		this.max_speed = 20;
		this.power = 2; //how speed affects size
		this.event_links = [];
		this.data_index = 0;
		this.soft_stamp_cache = {};
	}

	load() {
		var _this = this;
		var is_touch = false;

		//pointer events
		document.addEventListener('pointerdown', function (event) {
			_this.pointerdown(event);
		});
		document.addEventListener('pointermove', function (event) {
			_this.pointermove(event);
		});

		//mouse events
		document.addEventListener('mousedown', function (event) {
			if(is_touch)
				return;
			_this.dragStart(event);
		});
		document.addEventListener('mousemove', function (event) {
			if(is_touch)
				return;
			_this.dragMove(event);
		});
		document.addEventListener('mouseup', function (event) {
			if(is_touch)
				return;
			_this.dragEnd(event);
		});

		// collect touch events
		document.addEventListener('touchstart', function (event) {
			is_touch = true;
			_this.dragStart(event);
		});
		document.addEventListener('touchmove', function (event) {
			_this.dragMove(event);
		});
		document.addEventListener('touchend', function (event) {
			_this.dragEnd(event);
		});
	}

	pointerdown(e) {
		// Devices that don't actually support pen pressure can give 0.5 as a false reading.
		// It is highly unlikely a real pen will read exactly 0.5 at the start of a stroke.
		if (e.pressure && e.pressure !== 0 && e.pressure !== 0.5 && e.pressure <= 1) {
			this.pressure_supported = true;
			this.pointer_pressure = e.pressure;
		} else {
			this.pressure_supported = false;
		}
	}

	pointermove(e) {
		// Pressure of exactly 1 seems to be an input error, sometimes I see it when lifting the pen
		// off the screen when pressure reading should be near 0.
		if (this.pressure_supported && e.pressure < 1) {
			this.pointer_pressure = e.pressure;
		}
	}

	dragStart(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;
		this.click_counter++;

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			this.event_links.push({
				identifier: identifier,
				index: this.data_index,
			});

			_this.mousedown_action(events[i], this.data_index, identifier);

			this.data_index++;
		}
	}

	dragMove(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		if (typeof event.changedTouches == "undefined") {
			//mouse cursor
			var mouse = _this.get_mouse_info(event);
			var params = _this.getParams();
			_this.show_mouse_cursor(mouse.x, mouse.y, params.size, 'circle');
		}

		var mouse = this.get_mouse_info(event);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				identifier = events[i].identifier;
			}

			for(var j = 0; i < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					//found link
					_this.mousemove_action(events[i], this.event_links[j].index);
					break;
				}
			}
		}
	}

	dragEnd(event) {
		var _this = this;
		if (config.TOOL.name != _this.name)
			return;

		var mouse = this.get_mouse_info(event);
		if (mouse.click_valid == false) {
			return;
		}

		var events = [];
		if (event.changedTouches) {
			events = event.changedTouches;
		}
		else{
			events.push(event);
		}
		for(var i = 0; i < events.length; i++){
			var identifier = null;
			if(typeof events[i].identifier != "undefined") {
				//unlink
				identifier = events[i].identifier;
			}

			for(var j = 0; i < this.event_links.length; j++){
				if(this.event_links[j].identifier == identifier){
					this.event_links.splice(j, 1);
					break;
				}
			}

			_this.mouseup_action(events[i]);
		}
	}

	mousedown_action(e, index, event_identifier) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;

		if (config.mask_active === true && config.layer.mask != null) {
			this.Mask.brush(this, e, 'start');
			return;
		}

		var params_hash = this.get_params_hash();
		var clip_mask = this.selection_clip_mask();
		var reuse = config.layer.type == this.name && params_hash == this.params_hash;
		if (clip_mask != null && (config.layer.mask == null || config.layer.mask._selection_clip !== true)) {
			reuse = false;
		}

		if (!reuse) {
			//register new object - current layer is not ours, params changed,
			//or a selection is constraining this stroke onto a fresh clipped layer
			this.layer = {
				type: this.name,
				data: [[]],
				params: this.clone(this.getParams()),
				status: 'draft',
				render_function: [this.name, 'render'],
				x: 0,
				y: 0,
				width: config.WIDTH,
				height: config.HEIGHT,
				mask: clip_mask,
				hide_selection_if_active: true,
				rotate: null,
				is_vector: true,
				color: config.COLOR
			};
			app.State.do_action(
				new app.Actions.Bundle_action('new_brush_layer', 'New Brush Layer', [
					new app.Actions.Insert_layer_action(this.layer)
				])
			);
			this.params_hash = params_hash;

			//reset event links index
			this.data_index = 0;
			index = 0;
			this.event_links = [];
			this.event_links.push({
				identifier: event_identifier,
				index: this.data_index,
			});
		}
		else {
			// Reuse existing brush layer, but re-baseline its data to the
			// document origin and reset bounds to full document. Otherwise the
			// layer keeps the previous stroke's tight bounds and new stroke
			// points (stored relative to layer.x/y) fall outside them,
			// clipping the stroke in the WebGL renderer's offscreen canvas.
			const new_data = JSON.parse(JSON.stringify(config.layer.data));
			const dx = config.layer.x || 0;
			const dy = config.layer.y || 0;
			if (dx !== 0 || dy !== 0) {
				for (let k = 0; k < new_data.length; k++) {
					const group_data = new_data[k];
					if (!group_data) continue;
					for (let i = 0; i < group_data.length; i++) {
						if (group_data[i]) {
							group_data[i][0] += dx;
							group_data[i][1] += dy;
						}
					}
				}
			}
			new_data.push([]);
			app.State.do_action(
				new app.Actions.Bundle_action('update_brush_layer', 'Update Brush Layer', [
					new app.Actions.Update_layer_action(config.layer.id, {
						data: new_data,
						x: 0,
						y: 0,
						width: config.WIDTH,
						height: config.HEIGHT
					})
				])
			);
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var current_group = config.layer.data[index];
		var params = this.getParams();

		//detect line size
		var size = params.size;
		var new_size = size;

		if (params.pressure == true) {
			if (this.pressure_supported) {
				new_size = size * this.pointer_pressure * 2;
			}
			else {
				new_size = size + size / this.max_speed * mouse.speed_average * this.power;
				new_size = Math.max(new_size, size / 4);
				new_size = Math.round(new_size);
			}
		}

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		var mouse_x = mouse_coords.x;
		var mouse_y = mouse_coords.y;

		current_group.push([mouse_x - config.layer.x, mouse_y - config.layer.y, new_size]);
		this.Base_layers.render_interactive_layer(config.layer.id);
	}

	mousemove_action(e, index) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false)
			return;
		if (mouse.click_valid == false) {
			return;
		}

		if (config.mask_active === true && config.layer.mask != null) {
			this.Mask.brush(this, e, 'move');
			return;
		}

		//in case of undo, recalculate index
		for(var i = index; i >= 0; i++){
			if(typeof config.layer.data[index] != "undefined"){
				break;
			}
			index--;
		}

		var params = this.getParams();
		var current_group = config.layer.data[index];

		//detect line size
		var size = params.size;
		var new_size = size;

		if (params.pressure == true) {
			if (this.pressure_supported) {
				new_size = size * this.pointer_pressure * 2;
			}
			else {
				new_size = size + size / this.max_speed * mouse.speed_average * this.power;
				new_size = Math.max(new_size, size / 4);
				new_size = Math.round(new_size);
			}
		}

		var mouse_coords = this.get_mouse_coordinates_from_event(e);
		var mouse_x = mouse_coords.x;
		var mouse_y = mouse_coords.y;

		current_group.push([mouse_x - config.layer.x, mouse_y - config.layer.y, new_size]);
		config.layer.status = 'draft';
		this.Base_layers.render_interactive_layer(config.layer.id);
	}

	mouseup_action(e, index) {
		if (config.mask_active === true && config.layer.mask != null) {
			this.Mask.brush(this, e, 'end');
			return;
		}

		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			config.layer.status = null;
			return;
		}

		config.layer.status = null;

		this.check_dimensions();
		this.Base_layers.render();
	}

	render(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var params = layer.params;
		var size = params.size;

		//soft edge brush (hardness < 100)
		if (params.hardness != null && params.hardness < 100) {
			this.render_soft(ctx, layer);
			return;
		}

		//set styles
		ctx.save();
		ctx.fillStyle = layer.color;
		ctx.strokeStyle = layer.color;
		ctx.lineWidth = params.size;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.translate(layer.x, layer.y);

		var data = layer.data;

		//check for legacy format
		data = this.check_legacy_format(data);

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k]; //data from mouse down till mouse release
			var group_n = group_data.length;

			if (params.pressure == false) {
				//stabilized lines method does not support multiple line sizes
				this.render_stabilized(ctx, group_data);
			}
			else {
				if (group_data[0]) {
					ctx.beginPath();
					ctx.moveTo(group_data[0][0], group_data[0][1]);
					for (var i = 1; i < group_n; i++) {
						if (group_data[i] === null) {
							//break
							ctx.beginPath();
						}
						else {
							//line

							ctx.lineWidth = group_data[i][2];

							if (group_data[i - 1] == null && group_data[i + 1] == null) {
								//exception - point
								ctx.arc(group_data[i][0], group_data[i][1], size / 2, 0, 2 * Math.PI, false);
								ctx.fill();
							}
							else if (group_data[i - 1] != null) {
								//lines
								ctx.lineWidth = group_data[i][2];
								ctx.beginPath();
								ctx.moveTo(group_data[i - 1][0], group_data[i - 1][1]);
								ctx.lineTo(group_data[i][0], group_data[i][1]);
								ctx.stroke();
							}
						}
					}
					if (group_data[1] == null) {
						//point
						ctx.beginPath();
						ctx.arc(group_data[0][0], group_data[0][1], size / 2, 0, 2 * Math.PI, false);
						ctx.fill();
					}
				}
			}
		}

		ctx.translate(-layer.x, -layer.y);
		ctx.restore();
	}

	/**
	 * renders a brush layer with a soft (feathered) edge.
	 *
	 * @param {object} ctx
	 * @param {object} layer
	 */
	render_soft(ctx, layer) {
		if (layer.data.length == 0)
			return;

		var params = layer.params;
		var hardness = (params.hardness != null) ? params.hardness : 100;
		var color = layer.color;

		ctx.save();
		ctx.translate(layer.x, layer.y);

		var data = this.check_legacy_format(layer.data);

		for (var k = 0; k < data.length; k++) {
			var group_data = data[k];
			if (group_data == null || group_data.length == 0)
				continue;

			//split by breaks
			var strokes = [[]];
			for (var i = 0; i < group_data.length; i++) {
				if (group_data[i] === null) {
					strokes.push([]);
				}
				else {
					strokes[strokes.length - 1].push(group_data[i]);
				}
			}

			for (var s = 0; s < strokes.length; s++) {
				var stroke = strokes[s];
				if (stroke.length == 0)
					continue;

				if (stroke.length == 1) {
					//a single soft dot
					this.stamp_soft(ctx, stroke[0][0], stroke[0][1], stroke[0][2] || params.size, hardness, color, 1);
					continue;
				}

				//build smoothed points (mirrors render_stabilized) for pressure==false
				var points;
				if (params.pressure == false) {
					points = this.stabilize_points(stroke);
				}
				else {
					points = [];
					for (var j = 0; j < stroke.length; j++) {
						points.push({
							x: stroke[j][0],
							y: stroke[j][1],
							size: stroke[j][2] || params.size,
						});
					}
				}

				//stamp overlapping soft circles along the path
				var size;
				for (var p = 0; p < points.length - 1; p++) {
					var p0 = points[p];
					var p1 = points[p + 1];
					this.stamp_soft_line(ctx,
						p0.x, p0.y, p0.size || params.size,
						p1.x, p1.y, p1.size || params.size,
						hardness, color);
				}
			}
		}

		ctx.translate(-layer.x, -layer.y);
		ctx.restore();
	}

	/**
	 * returns the smoothed points used by render_stabilized()
	 *
	 * @param {array} data points [x, y, size]
	 * @returns {array} points {x, y}
	 */
	stabilize_points(data) {
		var n = data.length;
		var points = [];

		if (n <= 5) {
			//not enough points to smooth - straight lines
			for (var i = 0; i < n; i++) {
				if (data[i] !== null) {
					points.push({ x: data[i][0], y: data[i][1] });
				}
			}
			return points;
		}

		//fix for loose ending, so lets duplicate last point
		var pts = [];
		for (var i = 0; i < n; i++) {
			if (data[i] !== null) {
				pts.push([data[i][0], data[i][1]]);
			}
		}
		pts.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);

		var temp_data1 = [pts[0]];
		var c, d;
		for (var i = 1; i < pts.length - 1; i++) {
			c = (pts[i][0] + pts[i + 1][0]) / 2;
			d = (pts[i][1] + pts[i + 1][1]) / 2;
			temp_data1.push([c, d]);
		}

		var temp_data2 = [temp_data1[0]];
		for (var i = 1; i < temp_data1.length - 1; i++) {
			c = (temp_data1[i][0] + temp_data1[i + 1][0]) / 2;
			d = (temp_data1[i][1] + temp_data1[i + 1][1]) / 2;
			temp_data2.push([c, d]);
		}

		var temp_data = [temp_data2[0]];
		for (var i = 1; i < temp_data2.length - 1; i++) {
			c = (temp_data2[i][0] + temp_data2[i + 1][0]) / 2;
			d = (temp_data2[i][1] + temp_data2[i + 1][1]) / 2;
			temp_data.push([c, d]);
		}

		for (var i = 0; i < temp_data.length; i++) {
			points.push({ x: temp_data[i][0], y: temp_data[i][1] });
		}
		return points;
	}

	/**
	 * radial-gradient stamp used to paint soft brush edges.
	 * A straight stroke is sampled every `step` pixels; the stamp amplitude
	 * is normalized so the accumulated stamps reproduce the stamped kernel
	 * (opaque core, smooth falloff toward the nominal brush radius).
	 *
	 * @param {int} size
	 * @param {int} hardness 0-100
	 * @param {string} color hex
	 * @returns {object} {canvas, center, step, amp}
	 */
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

		//sampling step and accumulated-amplitude normalization
		var step = Math.max(1, Math.floor(r_outer / 3));
		var integral = r_outer + r_inner; //2 * ∫_0^∞ kernel(x) dx for a linear ramp
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

	/**
	 * paints a single soft brush stamp.
	 *
	 * @param {object} ctx
	 * @param {int} x
	 * @param {int} y
	 * @param {int} size
	 * @param {int} hardness
	 * @param {string} color
	 * @param {float} amplitude optional per-stamp alpha (defaults to normalized amplitude)
	 */
	stamp_soft(ctx, x, y, size, hardness, color, amplitude) {
		var stamp = this.get_soft_stamp(size, hardness, color);
		if (amplitude == null) {
			amplitude = stamp.amp;
		}
		ctx.save();
		ctx.globalAlpha = Math.max(0, Math.min(1, amplitude));
		ctx.drawImage(stamp.canvas, Math.round(x - stamp.center), Math.round(y - stamp.center));
		ctx.restore();
	}

	/**
	 * paints a soft stroke segment, stamping overlapping circles between two points.
	 */
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

	/**
	 * draw stabilized lines
	 * author: Manoj Verma
	 * source: https://stackoverflow.com/questions/7891740/drawing-smooth-lines-with-canvas/44810470#44810470
	 *
	 * @param ctx
	 * @param queue
	 */
	render_stabilized(ctx, queue) {
		var data = JSON.parse(JSON.stringify(queue));
		var n = data.length;

		if (data.length == 1) {
			//point
			var point = data[0];
			ctx.beginPath();
			ctx.arc(point[0], point[1], point[2] / 2, 0, 2 * Math.PI, false);
			ctx.fill();
			return;
		}
		else if (data.length <= 5) {
			//not enough points yet

			for (var i = 1; i < n; i++) {
				ctx.beginPath();
				ctx.moveTo(data[i - 1][0], data[i - 1][1]);
				ctx.lineTo(data[i][0], data[i][1]);
				ctx.stroke();
			}
			return;
		}

		//fix for loose ending, so lets duplicate last point
		data.push([data[n - 1][0], data[n - 1][1]]);

		ctx.beginPath();
		ctx.moveTo(data[0][0], data[0][1]);

		//prepare
		var temp_data1 = [data[0]];
		var c, d;
		for (var i = 1; i < data.length - 1;  i = i+1) {
			c = (data[i][0] + data[i + 1][0]) / 2;
			d = (data[i][1] + data[i + 1][1]) / 2;
			temp_data1.push([c, d]);
		}

		var temp_data2 = [temp_data1[0]];
		for (var i = 1; i < temp_data1.length - 1;  i = i+1) {
			c = (temp_data1[i][0] + temp_data1[i + 1][0]) / 2;
			d = (temp_data1[i][1] + temp_data1[i + 1][1]) / 2;
			temp_data2.push([c, d]);
		}

		var temp_data = [temp_data2[0]];
		for (var i = 1; i < temp_data2.length - 1;  i = i+1) {
			c = (temp_data2[i][0] + temp_data2[i + 1][0]) / 2;
			d = (temp_data2[i][1] + temp_data2[i + 1][1]) / 2;
			temp_data.push([c, d]);
		}

		//draw
		for (var i = 1; i < temp_data.length - 2;  i = i+1) {
			c = (temp_data[i][0] + temp_data[i + 1][0]) / 2;
			d = (temp_data[i][1] + temp_data[i + 1][1]) / 2;
			ctx.quadraticCurveTo(temp_data[i][0], temp_data[i][1], c, d);
		}

		// For the last 2 points
		ctx.quadraticCurveTo(
			temp_data[i][0],
			temp_data[i][1],
			temp_data[i+1][0],
			temp_data[i+1][1]
		);
		ctx.stroke();
	}

	check_legacy_format(data) {
		//check for legacy format
		if(data.length > 0 && typeof data[0][0] == "number"){
			//convert
			var legacy = JSON.parse(JSON.stringify(data));
			data = [];
			data.push([]);
			var group_index = 0;
			for(var i in legacy){
				if(legacy[i] === null){
					data.push([]);
					group_index++;
				}
				else {
					data[group_index].push([legacy[i][0], legacy[i][1], legacy[i][2]]);
				}
			}
		}

		return data;
	}

	/**
	 * recalculate layer x, y, width and height values.
	 */
	check_dimensions() {
		var data = JSON.parse(JSON.stringify(config.layer.data)); // Deep copy for history
		this.check_legacy_format(data);

		if(config.layer.data.length == 0 || data[0].length == 0)
			return;

		//find bounds
		var min_x = data[0][0][0];
		var min_y = data[0][0][1];
		var max_x = data[0][0][0];
		var max_y = data[0][0][1];

		var n = data.length;
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 1; i < group_n; i++) {
				min_x = Math.min(min_x, group_data[i][0]);
				min_y = Math.min(min_y, group_data[i][1]);
				max_x = Math.max(max_x, group_data[i][0]);
				max_y = Math.max(max_y, group_data[i][1]);
			}
		}

		//move current data
		for (var k = 0; k < n; k++) {
			var group_data = data[k];
			var group_n = group_data.length;

			for (var i = 0; i < group_n; i++) {
				group_data[i][0] = group_data[i][0] - min_x;
				group_data[i][1] = group_data[i][1] - min_y;
			}
		}

		//change layers bounds
		app.State.do_action(
			new app.Actions.Update_layer_action(config.layer.id, {
				x: config.layer.x + min_x,
				y: config.layer.y + min_y,
				width: max_x - min_x,
				height: max_y - min_y,
				data
			}),
			{
				merge_with_history: ['new_brush_layer', 'update_brush_layer']
			}
		);
	}

}

export default Brush_class;
