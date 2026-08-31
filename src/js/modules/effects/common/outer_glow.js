import config from '../../../config.js';
import Effects_common_class from '../abstract/css.js';
import Dialog_class from '../../../libs/popup.js';
import Effects_browser_class from '../browser.js';
import Base_layers_class from './../../../core/base-layers.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import app from './../../../app.js';

class Effects_outer_glow_class extends Effects_common_class {

	constructor() {
		super();
		this.POP = new Dialog_class();
		this.Effects_browser = new Effects_browser_class();
		this.Base_layers = new Base_layers_class();
		this.preview_padding = 20;
	}

	outer_glow(filter_id) {
		if (config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
			app.GUI.modules['layer/styles'].open('outer_glow', filter_id);
			return;
		}

		var filter = this.Base_layers.find_filter_by_id(filter_id, 'outer_glow');

		var params = [
			{name: "value", title: "Size:", value: filter.value ??= 10, range: [0, 100]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 75, range: [0, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#ffff00", type: 'color'},
		];
		this.show_dialog('outer_glow', params, filter_id);
	}

	get_glow_color(color, opacity) {
		if (opacity == null) opacity = 75;
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
		var radius = params.value ?? 10;
		var opacity = params.opacity ?? 75;
		var color = this.get_glow_color(params.color || '#ffff00', opacity);

		if (type == 'preview') {
			var diff = (this.POP.width_mini / this.POP.height_mini) / (config.WIDTH / config.HEIGHT);
			radius = radius * diff;
		}

		return `0px 0px ${radius}px ${color}`;
	}

	demo(canvas_id, canvas_thumb){
		var canvas = document.getElementById(canvas_id);
		var ctx = canvas.getContext("2d");

		var size = this.convert_value(null, {value: 10, opacity: 75, color: '#ffff00'}, 'preview');
		ctx.filter = "drop-shadow(" + size + ")";
		ctx.drawImage(canvas_thumb,
			10, 10,
			this.Effects_browser.preview_width - 20, this.Effects_browser.preview_height - 20);
		ctx.filter = 'none';
	}

	render_pre(ctx, data) {
		var value = this.convert_value(data.params.value, data.params, 'save');
		var filter = 'drop-shadow(' + value + ')';

		if (ctx.filter == 'none')
			ctx.filter = filter;
		else
			ctx.filter += ' ' + filter;
	}

	render_post(ctx, data){
		ctx.filter = 'none';
	}

}

export default Effects_outer_glow_class;
