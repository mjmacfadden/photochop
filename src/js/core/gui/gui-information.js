/*
 * miniPaint - https://github.com/viliusle/miniPaint
 * author: Vilius L.
 */

import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Tools_settings_class from './../../modules/tools/settings.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var template = `
	<span class="status_item"><span class="trn">Doc:</span> <span id="mouse_info_size">-</span> <span class="id-mouse_info_units"></span></span>
	<span class="status_divider"></span>
	<span class="status_item"><span class="trn">X:</span> <span id="mouse_info_mouse_x">-</span> <span class="trn">Y:</span> <span id="mouse_info_mouse_y">-</span></span>
	<span class="status_divider"></span>
	<span class="status_item"><span class="trn">Resolution:</span> <span id="mouse_info_resolution">-</span> <span class="trn">ppi</span></span>
	<span class="status_divider"></span>
	<span class="status_item" id="status_mem_item" title="Approximate layer bitmap memory (RGBA). Soft warn when high — purge undos or flatten layers."><span class="trn">Mem:</span> <span id="mouse_info_mem">-</span></span>
`;

/** Soft-warn threshold for approximate layer bitmap bytes (256 MiB). */
var MEM_SOFT_WARN_BYTES = 256 * 1024 * 1024;

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
		this.last_mem_key = null;
		this._mem_warned = false;
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
			this.show_memory(false);
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
		this.show_memory(true);
	}

	/**
	 * Approximate RGBA bytes for visible layer bitmaps (+ masks). Soft-warns
	 * once per crossing above MEM_SOFT_WARN_BYTES.
	 */
	estimate_layer_bitmap_bytes() {
		var layers = config.layers || [];
		var total = 0;
		for (var i = 0; i < layers.length; i++) {
			var layer = layers[i];
			if (!layer || layer.type == null) continue;
			var w = Math.max(0, Math.round(layer.width || 0));
			var h = Math.max(0, Math.round(layer.height || 0));
			if (w > 0 && h > 0) {
				total += w * h * 4;
			}
			if (layer.mask && layer.mask.enabled !== false) {
				var mw = Math.max(0, Math.round((layer.mask.width != null ? layer.mask.width : w) || 0));
				var mh = Math.max(0, Math.round((layer.mask.height != null ? layer.mask.height : h) || 0));
				if (mw > 0 && mh > 0) {
					total += mw * mh * 4;
				}
			}
		}
		// Document composite buffers (main + common temps) — rough floor
		var dw = config.WIDTH || 0;
		var dh = config.HEIGHT || 0;
		if (dw > 0 && dh > 0) {
			total += dw * dh * 4 * 2;
		}
		return total;
	}

	show_memory(force) {
		var bytes = this.estimate_layer_bitmap_bytes();
		var mb = bytes / (1024 * 1024);
		var key = Math.round(mb * 10) + ':' + (config.layers ? config.layers.length : 0);
		if (!force && key === this.last_mem_key) {
			return;
		}
		this.last_mem_key = key;

		var el = document.getElementById('mouse_info_mem');
		var item = document.getElementById('status_mem_item');
		if (!el) return;

		var label = (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
		el.textContent = label;

		var warn = bytes >= MEM_SOFT_WARN_BYTES;
		if (item) {
			if (warn) {
				item.classList.add('status_mem_warn');
				item.title = 'High layer bitmap memory (~' + Math.round(mb) +
					' MB). Consider Edit → purge older undos (history limit) or flatten layers.';
			} else {
				item.classList.remove('status_mem_warn');
				item.title = 'Approximate layer bitmap memory (RGBA). Soft warn at 256 MB — purge undos or flatten layers.';
			}
		}

		if (warn && !this._mem_warned) {
			this._mem_warned = true;
			if (alertify && alertify.warning) {
				alertify.warning('High layer memory (~' + Math.round(mb) +
					' MB). Purge undos or flatten layers if the browser feels slow.', 6);
			}
		} else if (!warn) {
			this._mem_warned = false;
		}
	}

}

export default GUI_information_class;
