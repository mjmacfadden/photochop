import config from '../../../config.js';
import Effects_common_class from '../abstract/css.js';
import Dialog_class from '../../../libs/popup.js';
import Effects_browser_class from '../browser.js';
import Base_layers_class from './../../../core/base-layers.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import app from './../../../app.js';

class Effects_inner_glow_class extends Effects_common_class {

	constructor() {
		super();
		this.POP = new Dialog_class();
		this.Effects_browser = new Effects_browser_class();
		this.Base_layers = new Base_layers_class();
		this.preview_padding = 20;
	}

	inner_glow(filter_id) {
		if (config.layer == null || config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
			app.GUI.modules['layer/styles'].open('inner_glow', filter_id);
			return;
		}

		var filter = this.Base_layers.find_filter_by_id(filter_id, 'inner_glow');

		var params = [
			{name: "value", title: "Size:", value: filter.value ??= 10, range: [0, 100]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 75, range: [0, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#ffffff", type: 'color'},
		];
		this.show_dialog('inner_glow', params, filter_id);
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
		return '';
	}

	demo(canvas_id, canvas_thumb){
		var canvas = document.getElementById(canvas_id);
		var ctx = canvas.getContext("2d");
		var w = this.Effects_browser.preview_width;
		var h = this.Effects_browser.preview_height;

		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(canvas_thumb, 10, 10, w - 20, h - 20);
	}

	render_pre(ctx, data) {
		// Inner glow renders post-object
	}

	render_post(ctx, data, layer) {
		if (!layer || !data.params) return;
		var radius = data.params.value ?? 10;
		var opacity = data.params.opacity ?? 75;
		if (radius <= 0 || opacity <= 0) return;
		var color = this.get_glow_color(data.params.color || '#ffffff', opacity);

		var w = ctx.canvas ? ctx.canvas.width : (config.WIDTH || 1000);
		var h = ctx.canvas ? ctx.canvas.height : (config.HEIGHT || 800);
		if (!w || !h) return;

		// 1. Create layer silhouette
		var layerCanvas = document.createElement('canvas');
		layerCanvas.width = w;
		layerCanvas.height = h;
		var lctx = layerCanvas.getContext('2d');
		if (layer.type === 'image') {
			lctx.save();
			lctx.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
			lctx.rotate((layer.rotate * Math.PI) / 180);
			lctx.drawImage(
				layer.link_canvas != null ? layer.link_canvas : layer.link,
				-layer.width / 2,
				-layer.height / 2,
				layer.width,
				layer.height
			);
			lctx.restore();
		} else if (layer.render_function && app.GUI && app.GUI.GUI_tools) {
			var render_class = layer.render_function[0];
			var render_function = layer.render_function[1];
			if (app.GUI.GUI_tools.tools_modules[render_class]) {
				app.GUI.GUI_tools.tools_modules[render_class].object[render_function](lctx, layer, false);
			}
		}

		// 2. Create inverted mask (solid black where layer is empty, transparent where layer is opaque)
		var maskCanvas = document.createElement('canvas');
		maskCanvas.width = w;
		maskCanvas.height = h;
		var mctx = maskCanvas.getContext('2d');
		mctx.fillStyle = '#000000';
		mctx.fillRect(0, 0, w, h);
		mctx.globalCompositeOperation = 'destination-out';
		mctx.drawImage(layerCanvas, 0, 0);

		// 3. Blur the inverted mask into glowCanvas (blur spreads inward into the layer cutout)
		var glowCanvas = document.createElement('canvas');
		glowCanvas.width = w;
		glowCanvas.height = h;
		var gctx = glowCanvas.getContext('2d');
		gctx.filter = `blur(${radius}px)`;
		gctx.drawImage(maskCanvas, 0, 0);
		gctx.filter = 'none';

		// 4. Clip strictly inside layer pixels
		gctx.globalCompositeOperation = 'destination-in';
		gctx.drawImage(layerCanvas, 0, 0);

		// 5. Colorize the glow
		gctx.globalCompositeOperation = 'source-in';
		gctx.fillStyle = color;
		gctx.fillRect(0, 0, w, h);

		// 6. Draw inner glow onto destination context
		ctx.save();
		ctx.filter = 'none';
		ctx.drawImage(glowCanvas, 0, 0);
		ctx.restore();
	}

}

export default Effects_inner_glow_class;
