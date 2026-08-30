import config from './../config.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Base_selection_class from './../core/base-selection.js';
import zoomView from './../libs/zoomView.js';

/**
 * Pan (hand) tool - drag to move the visible area.
 * Can also be hot-swapped to with the Space key (Photoshop-style).
 */
class Pan_tool_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.ctx = ctx;
		this.name = 'pan';
		this.is_drag = false;
		this.start_screen = null;

		//register this tool so no transform controls (blue box) are drawn
		var sel_config = {
			enable_background: false,
			enable_borders: false,
			enable_controls: false,
			enable_rotation: false,
			enable_move: false,
			data_function: function () {
				return config.layer;
			},
		};
		this.Base_selection = new Base_selection_class(this.ctx, sel_config, this.name);
	}

	load() {
		this.default_events();
	}

	mousedown(e) {
		if (e.which != 1 && e.type.indexOf('touch') < 0)
			return;

		this.is_drag = true;
		this.start_screen = this.get_screen_pos(e);
		document.body.classList.add('pan-dragging');
	}

	mousemove(e) {
		if (this.is_drag != true)
			return;

		var pos = this.get_screen_pos(e);
		zoomView.move(pos.x - this.start_screen.x, pos.y - this.start_screen.y);
		this.start_screen = pos;
		this.Base_layers.invalidate({ viewport: true, ruler: true });
	}

	mouseup(e) {
		this.is_drag = false;
		this.start_screen = null;
		document.body.classList.remove('pan-dragging');
	}

	get_screen_pos(e) {
		if (e.type.indexOf('touch') >= 0) {
			var touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
			return touch ? {x: touch.clientX, y: touch.clientY} : {x: e.clientX, y: e.clientY};
		}
		return {x: e.clientX, y: e.clientY};
	}
}
export default Pan_tool_class;
