import config from '../../../config.js';
import Effects_common_class from '../abstract/css.js';
import Dialog_class from '../../../libs/popup.js';
import Effects_browser_class from '../browser.js';
import Base_layers_class from './../../../core/base-layers.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import app from './../../../app.js';

class Effects_shadow_class extends Effects_common_class {

	constructor() {
		super();
		this.POP = new Dialog_class();
		this.Effects_browser = new Effects_browser_class();
		this.Base_layers = new Base_layers_class();
		this.preview_padding = 20;
	}

	shadow(filter_id) {
		if (config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
			app.GUI.modules['layer/styles'].open('shadow', filter_id);
			return;
		}

		var filter = this.Base_layers.find_filter_by_id(filter_id, 'shadow');

		var params = [
			{name: "x", title: "Offset X:", value: filter.x ??= 5, range: [-100, 100]},
			{name: "y", title: "Offset Y:", value: filter.y ??= 5, range: [-100, 100]},
			{name: "value", title: "Radius:", value: filter.value ??= 10, range: [0, 100]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 25, range: [0, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#000000", type: 'color'},
		];
		this.show_dialog('shadow', params, filter_id);
	}

	get_shadow_color(color, opacity) {
		if (opacity == null) opacity = 100;
		var alpha = Math.max(0, Math.min(1, opacity / 100));
		if (color && typeof color === 'string' && color.startsWith('#')) {
			var hex = color.replace('#', '');
			if (hex.length === 3) {
				hex = hex.split('').map(c => c + c).join('');
			}
			var r = parseInt(hex.substring(0, 2), 16) || 0;
			var g = parseInt(hex.substring(2, 4), 16) || 0;
			var b = parseInt(hex.substring(4, 6), 16) || 0;
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
		return color;
	}

	convert_value(value, params, type) {
		var x = params.x ?? 0;
		var y = params.y ?? 0;
		var radius = params.value ?? 0;
		var opacity = params.opacity ?? 100;
		var color = this.get_shadow_color(params.color || '#000000', opacity);

		//adapt size to real canvas dimensions
		if (type == 'preview') {
			var diff = (this.POP.width_mini / this.POP.height_mini) / (config.WIDTH / config.HEIGHT);

			x = x * (this.POP.width_mini / config.WIDTH);
			y = y * (this.POP.height_mini / config.HEIGHT);
			radius = radius * diff;
		}

		return x + "px " + y + "px " + radius + "px " + color;
	}

	demo(canvas_id, canvas_thumb){
		var canvas = document.getElementById(canvas_id);
		var ctx = canvas.getContext("2d");

		//draw
		var size = this.convert_value(null, {x: 5, y: 5, value: 10, opacity: 25, color: '#000000'}, 'preview');
		ctx.filter = "drop-shadow("+size+")";
		ctx.drawImage(canvas_thumb,
			10, 10,
			this.Effects_browser.preview_width - 20, this.Effects_browser.preview_height - 20);
		ctx.filter = 'none';
	}

	render_pre(ctx, data) {
		var value = this.convert_value(data.params.value, data.params, 'save');
		var filter = 'drop-shadow(' + value + ')';

		if(ctx.filter == 'none')
			ctx.filter = filter;
		else
			ctx.filter += ' ' + filter;
	}

	render_post(ctx, data){
		ctx.filter = 'none';
	}

}

export default Effects_shadow_class;