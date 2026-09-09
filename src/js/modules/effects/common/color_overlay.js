import config from '../../../config.js';
import Effects_common_class from '../abstract/css.js';
import Dialog_class from '../../../libs/popup.js';
import Effects_browser_class from '../browser.js';
import Base_layers_class from './../../../core/base-layers.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import app from './../../../app.js';

class Effects_color_overlay_class extends Effects_common_class {

	constructor() {
		super();
		this.POP = new Dialog_class();
		this.Effects_browser = new Effects_browser_class();
		this.Base_layers = new Base_layers_class();
		this.preview_padding = 20;
	}

	color_overlay(filter_id) {
		if (config.layer == null || config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
			app.GUI.modules['layer/styles'].open('color_overlay', filter_id);
			return;
		}

		var filter = this.Base_layers.find_filter_by_id(filter_id, 'color_overlay');

		var params = [
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 100, range: [0, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#ff0000", type: 'color'},
		];
		this.show_dialog('color_overlay', params, filter_id);
	}

	get_overlay_color(color, opacity) {
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
		// Color overlay is rendered in render_post (silhouette fill)
	}

	render_post(ctx, data, layer) {
		if (!layer || !data.params) return;

		var opacity = data.params.opacity ?? 100;
		if (opacity <= 0) return;

		var color = this.get_overlay_color(data.params.color || '#ff0000', opacity);

		var w = ctx.canvas ? ctx.canvas.width : (config.WIDTH || 1000);
		var h = ctx.canvas ? ctx.canvas.height : (config.HEIGHT || 800);
		if (!w || !h) return;

		// 1. Render layer silhouette
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

		// 2. Colorize silhouette (preserve alpha, replace RGB)
		var overlayCanvas = document.createElement('canvas');
		overlayCanvas.width = w;
		overlayCanvas.height = h;
		var octx = overlayCanvas.getContext('2d');
		octx.drawImage(layerCanvas, 0, 0);
		octx.globalCompositeOperation = 'source-in';
		octx.fillStyle = color;
		octx.fillRect(0, 0, w, h);

		// 3. Composite over already-drawn layer
		ctx.save();
		ctx.filter = 'none';
		ctx.drawImage(overlayCanvas, 0, 0);
		ctx.restore();
	}

}

export default Effects_color_overlay_class;
