import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';
import Base_layers_class from './../../core/base-layers.js';
import Base_gui_class from './../../core/base-gui.js';
import View_ruler_class from './ruler.js';
import zoomView from './../../libs/zoomView.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Tools_settings_class from './../tools/settings.js';
import app from './../../app.js';

class View_guides_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.GUI = new Base_gui_class();
		this.Tools_settings = new Tools_settings_class();
		this.Helper = new Helper_class();

		this.set_events();
	}

	set_events() {
		var _this = this;

		document.addEventListener('mousemove', (e) => {
			if (!config.TOOL || config.TOOL.name !== 'select') {
				return;
			}
			if (config.guides_enabled === false || !Array.isArray(config.guides) || config.guides.length === 0) {
				return;
			}
			if (config.mouse && config.mouse.is_drag) {
				return;
			}
			var main_wrapper = document.getElementById('main_wrapper');
			if (!main_wrapper) return;
			if (!e.target || (!e.target.closest('#main_wrapper') && e.target.id !== 'main_wrapper')) {
				return;
			}

			var hovered = _this.get_hovered_guide(e);
			if (hovered) {
				main_wrapper.style.cursor = hovered.type === 'vertical' ? 'col-resize' : 'row-resize';
			}
		});

		document.addEventListener('mousedown', (e) => {
			if (e.button !== 0) return;
			if (!config.TOOL || config.TOOL.name !== 'select') {
				return;
			}
			if (config.guides_enabled === false || !Array.isArray(config.guides) || config.guides.length === 0) {
				return;
			}
			var main_wrapper = document.getElementById('main_wrapper');
			if (!main_wrapper) return;
			if (!e.target || (!e.target.closest('#main_wrapper') && e.target.id !== 'main_wrapper')) {
				return;
			}

			var hovered = _this.get_hovered_guide(e);
			if (hovered) {
				e.preventDefault();
				e.stopPropagation();
				if (!_this.View_ruler) {
					_this.View_ruler = new View_ruler_class();
				}
				_this.View_ruler.start_guide_drag(hovered.type, e, hovered.index);
			}
		}, true);
	}

	get_hovered_guide(e) {
		if (config.guides_enabled === false || !Array.isArray(config.guides) || config.guides.length === 0) {
			return null;
		}
		var main_wrapper = document.getElementById('main_wrapper');
		var canvas_minipaint = document.getElementById('canvas_minipaint');
		if (!main_wrapper || !canvas_minipaint) return null;

		var canvas_rect = canvas_minipaint.getBoundingClientRect();
		var main_rect = main_wrapper.getBoundingClientRect();
		var offset_x = canvas_rect.left - main_rect.left;
		var offset_y = canvas_rect.top - main_rect.top;

		var mouse_screen_x = e.pageX - main_rect.left;
		var mouse_screen_y = e.pageY - main_rect.top;

		var threshold = 6;

		for (var i = config.guides.length - 1; i >= 0; i--) {
			var guide = config.guides[i];
			if (!guide) continue;

			if (guide.y === null && guide.x !== null) {
				// Vertical guide
				var screen_pt = zoomView.toScreen({ x: guide.x, y: 0 });
				var sx = offset_x + screen_pt.x;
				if (Math.abs(mouse_screen_x - sx) <= threshold) {
					return { type: 'vertical', index: i, guide: guide };
				}
			} else if (guide.x === null && guide.y !== null) {
				// Horizontal guide
				var screen_pt = zoomView.toScreen({ x: 0, y: guide.y });
				var sy = offset_y + screen_pt.y;
				if (Math.abs(mouse_screen_y - sy) <= threshold) {
					return { type: 'horizontal', index: i, guide: guide };
				}
			}
		}

		return null;
	}

	insert() {
		var _this = this;
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		//convert units
		var position = 20;
		var position = this.Helper.get_user_unit(position, units, resolution);

		var settings = {
			title: 'Insert guides',
			params: [
				{name: "type", title: "Type:", values: ["Vertical", "Horizontal"], value :"Vertical"},
				{name: "position", title: "Position:",  value: position},
			],
			on_finish: function (params) {
				_this.insert_handler(params);
			},
		};
		this.POP.show(settings);
	}

	insert_handler(data){
		var type = data.type;
		var position = parseFloat(data.position);
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		//convert units
		position = this.Helper.get_internal_unit(position, units, resolution);

		var x = null;
		var y = null;
		if(type == 'Vertical')
			x = position;
		if(type == 'Horizontal')
			y = position;

		//update
		config.guides.push({x: x, y: y});

		if(config.guides_enabled == false){
			//was disabled
			config.guides_enabled = true;
			this.Helper.setCookie('guides', 1);
			alertify.warning('Guides enabled.');
		}

		config.need_render = true;
	}

	update(){
		var _this = this;
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		var params = [];
		for(var i in config.guides){
			var guide = config.guides[i];

			//convert units
			var value = guide.x;
			var value = this.Helper.get_user_unit(value, units, resolution);

			if(guide.y === null) {
				params.push({name: i, title: "Vertical:", value: value});
			}
		}
		for(var i in config.guides){
			var guide = config.guides[i];

			//convert units
			var value = guide.y;
			var value = this.Helper.get_user_unit(value, units, resolution);

			if(guide.x === null) {
				params.push({name: i, title: "Horizontal:", value: value});
			}
		}

		var settings = {
			title: 'Update guides',
			params: params,
			on_finish: function (params) {
				_this.update_handler(params);
			},
		};
		this.POP.show(settings);
	}

	update_handler(data){
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		//update
		for (var i in data) {
			var key = parseInt(i);
			var value = parseFloat(data[i]);

			//convert units
			value = this.Helper.get_internal_unit(value, units, resolution);

			if (config.guides[key].x === null)
				config.guides[key].y = value;
			else
				config.guides[key].x = value;
		}

		//remove empty
		for (var i = 0; i < config.guides.length; i++) {
			if(config.guides[i].x === 0 || config.guides[i].y === 0
				|| isNaN(config.guides[i].x) || isNaN( config.guides[i].y)){
				config.guides.splice(i, 1);
				i--;
			}
		}

		config.need_render = true;
	}

	remove(params) {
		config.guides = [];
		config.need_render = true;
	}

}

export default View_guides_class;