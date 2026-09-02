import config from './../config.js';
import app from './../app.js';
import Base_tools_class from './../core/base-tools.js';
import Base_layers_class from './../core/base-layers.js';
import Helper_class from './../libs/helpers.js';
import Base_gui_class from './../core/base-gui.js';

class Pick_color_class extends Base_tools_class {

	constructor(ctx) {
		super();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.Base_gui = new Base_gui_class();
		this.ctx = ctx;
		this.name = 'pick_color';
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

	load() {
		// Event routing is handled centrally by Base_tools_class
	}

	mouseup(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false)
			return;
		if (!app.GUI || !app.GUI.GUI_shortcuts || !app.GUI.GUI_shortcuts.alt_eyedropper_tool) {
			this.copy_color_to_clipboard();
		}
	}

	mousedown(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.click_valid == false) {
			return;
		}

		this.pick_color(mouse);
	}

	mousemove(e) {
		var mouse = this.get_mouse_info(e);
		if (mouse.is_drag == false || mouse.click_valid == false) {
			return;
		}

		this.pick_color(mouse);
	}

	pick_color(mouse) {
		var params = this.getParams();

		//get canvas from layer
		if (params.global == false) {
			//active layer
			var canvas = this.Base_layers.convert_layer_to_canvas(config.layer.id, null, false);
			var ctx = canvas.getContext("2d");
		}
		else {
			//global
			var canvas = document.createElement('canvas');
			var ctx = canvas.getContext("2d");
			canvas.width = config.WIDTH;
			canvas.height = config.HEIGHT;
			this.Base_layers.convert_layers_to_canvas(ctx, null, false);
		}
		//find color
		var c = ctx.getImageData(mouse.x, mouse.y, 1, 1).data;
		var hex = this.Helper.rgbToHex(c[0], c[1], c[2]);

		const newColorDefinition = { hex };
		if (c[3] > 0) {
			//set alpha
			newColorDefinition.a = c[3];
		}
		this.Base_gui.GUI_colors.set_color(newColorDefinition, !!(mouse && mouse.is_drag));
	}

	copy_color_to_clipboard() {
		navigator.clipboard.writeText(config.COLOR);
	}

}

export default Pick_color_class;
