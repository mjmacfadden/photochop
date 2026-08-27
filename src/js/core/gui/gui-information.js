/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Tools_settings_class from './../../modules/tools/settings.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';

var template = `
	<span class="status_item"><span class="trn">Doc:</span> <span id="mouse_info_size">-</span> <span class="id-mouse_info_units"></span></span>
	<span class="status_divider"></span>
	<span class="status_item"><span class="trn">X:</span> <span id="mouse_info_mouse_x">-</span> <span class="trn">Y:</span> <span id="mouse_info_mouse_y">-</span></span>
	<span class="status_divider"></span>
	<span class="status_item"><span class="trn">Resolution:</span> <span id="mouse_info_resolution">-</span> <span class="trn">ppi</span></span>
`;

/**
 * GUI class responsible for rendering information in the bottom status bar
 */
class GUI_information_class {

	constructor(ctx) {
		this.Base_layers = new Base_layers_class();
		this.Tools_settings = new Tools_settings_class();
		this.Helper = new Helper_class();
		this.Tools_translate = new Tools_translate_class();
		this.last_width = null;
		this.last_height = null;
		this.units = this.Tools_settings.get_setting('default_units');
		this.resolution = this.Tools_settings.get_setting('resolution');
	}

	render_main_information() {
		document.getElementById('status_info').innerHTML = template;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, document.getElementById('status_info'));
		}
		this.set_events();
		this.show_size();
	}

	set_events() {
		var _this = this;
		var target_x = document.getElementById('mouse_info_mouse_x');
		var target_y = document.getElementById('mouse_info_mouse_y');

		document.addEventListener('mousemove', function (e) {
			_this.show_size();
		}, false);

		document.getElementById('canvas_minipaint').addEventListener('mousemove', function (e) {
			var global_pos = _this.Base_layers.get_world_coords(e.offsetX, e.offsetY);
			var mouse_x = Math.ceil(global_pos.x);
			var mouse_y = Math.ceil(global_pos.y);

			mouse_x = _this.Helper.get_user_unit(mouse_x, _this.units, _this.resolution);
			mouse_y = _this.Helper.get_user_unit(mouse_y, _this.units, _this.resolution);

			target_x.innerHTML = mouse_x;
			target_y.innerHTML = mouse_y;
		}, false);
	}

	update_units(){
		this.units = this.Tools_settings.get_setting('default_units');
		this.resolution = this.Tools_settings.get_setting('resolution');
		this.show_size(true);
	}

	show_size(force) {
		if(force == undefined && this.last_width == config.WIDTH && this.last_height == config.HEIGHT) {
			return;
		}

		var width = this.Helper.get_user_unit(config.WIDTH, this.units, this.resolution);
		var height = this.Helper.get_user_unit(config.HEIGHT, this.units, this.resolution);

		document.getElementById('mouse_info_size').innerHTML = width + ' &times; ' + height;

		var resolution = this.Tools_settings.get_setting('resolution');
		document.getElementById('mouse_info_resolution').innerHTML = resolution;

		var default_units = this.Tools_settings.get_setting('default_units_short');
		var targets = document.querySelectorAll('.id-mouse_info_units');
		for (var i = 0; i < targets.length; i++) {
			targets[i].innerHTML = default_units;
		}

		this.last_width = config.WIDTH;
		this.last_height = config.HEIGHT;
	}

}

export default GUI_information_class;
