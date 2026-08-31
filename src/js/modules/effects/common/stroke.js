import config from '../../../config.js';
import Effects_common_class from '../abstract/css.js';
import Dialog_class from '../../../libs/popup.js';
import Effects_browser_class from '../browser.js';
import Base_layers_class from './../../../core/base-layers.js';
import alertify from './../../../../../node_modules/alertifyjs/build/alertify.min.js';
import app from './../../../app.js';

class Effects_stroke_class extends Effects_common_class {

	constructor() {
		super();
		this.POP = new Dialog_class();
		this.Effects_browser = new Effects_browser_class();
		this.Base_layers = new Base_layers_class();
		this.preview_padding = 20;
	}

	stroke(filter_id) {
		if (config.layer == null || config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		if (app.GUI && app.GUI.modules && app.GUI.modules['layer/styles']) {
			app.GUI.modules['layer/styles'].open('stroke', filter_id);
			return;
		}

		var filter = this.Base_layers.find_filter_by_id(filter_id, 'stroke');

		var params = [
			{name: "size", title: "Size:", value: filter.size ??= 3, range: [1, 50]},
			{name: "position", title: "Position:", value: filter.position || "outside", values: ["outside", "inside", "center"]},
			{name: "opacity", title: "Opacity:", value: filter.opacity ??= 100, range: [0, 100]},
			{name: "color", title: "Color:", value: filter.color ??= "#000000", type: 'color'},
		];
		this.show_dialog('stroke', params, filter_id);
	}

	get_stroke_color(color, opacity) {
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
		// Stroke is rendered in render_post via clean canvas blitting to prevent CSS filter pipeline memory leaks
	}

	render_post(ctx, data, layer) {
		if (!layer || !data.params) return;

		var rawSize = data.params.size ?? 3;
		if (rawSize <= 0) return;

		var position = data.params.position || 'outside';
		var opacity = data.params.opacity ?? 100;
		if (opacity <= 0) return;

		var color = this.get_stroke_color(data.params.color || '#000000', opacity);

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

		ctx.save();
		ctx.filter = 'none';

		// 2. Outer / Center Stroke pass
		if (position === 'outside' || position === 'center') {
			var outerSize = position === 'center' ? Math.max(1, Math.ceil(rawSize / 2)) : rawSize;

			// Colorized silhouette
			var silCanvas = document.createElement('canvas');
			silCanvas.width = w;
			silCanvas.height = h;
			var silCtx = silCanvas.getContext('2d');
			silCtx.drawImage(layerCanvas, 0, 0);
			silCtx.globalCompositeOperation = 'source-in';
			silCtx.fillStyle = color;
			silCtx.fillRect(0, 0, w, h);

			// Fast stamp expansion
			var outerCanvas = document.createElement('canvas');
			outerCanvas.width = w;
			outerCanvas.height = h;
			var octx = outerCanvas.getContext('2d');

			for (var r = 1; r <= outerSize; r++) {
				var diag = Math.round(r * 0.7071);
				octx.drawImage(silCanvas, r, 0);
				octx.drawImage(silCanvas, -r, 0);
				octx.drawImage(silCanvas, 0, r);
				octx.drawImage(silCanvas, 0, -r);
				if (diag > 0) {
					octx.drawImage(silCanvas, diag, diag);
					octx.drawImage(silCanvas, -diag, diag);
					octx.drawImage(silCanvas, diag, -diag);
					octx.drawImage(silCanvas, -diag, -diag);
				}
			}

			// Remove layer interior from outer stroke
			outerCanvas.getContext('2d').globalCompositeOperation = 'destination-out';
			outerCanvas.getContext('2d').drawImage(layerCanvas, 0, 0);

			ctx.drawImage(outerCanvas, 0, 0);
		}

		// 3. Inner / Center Stroke pass
		if (position === 'inside' || position === 'center') {
			var innerSize = position === 'center' ? Math.max(1, Math.floor(rawSize / 2)) : rawSize;
			if (innerSize > 0) {
				// Inverted mask of layer
				var maskCanvas = document.createElement('canvas');
				maskCanvas.width = w;
				maskCanvas.height = h;
				var mctx = maskCanvas.getContext('2d');
				mctx.fillStyle = '#000000';
				mctx.fillRect(0, 0, w, h);
				mctx.globalCompositeOperation = 'destination-out';
				mctx.drawImage(layerCanvas, 0, 0);

				// Fast inward stamp expansion
				var innerCanvas = document.createElement('canvas');
				innerCanvas.width = w;
				innerCanvas.height = h;
				var ictx = innerCanvas.getContext('2d');

				for (var r = 1; r <= innerSize; r++) {
					var diag = Math.round(r * 0.7071);
					ictx.drawImage(maskCanvas, r, 0);
					ictx.drawImage(maskCanvas, -r, 0);
					ictx.drawImage(maskCanvas, 0, r);
					ictx.drawImage(maskCanvas, 0, -r);
					if (diag > 0) {
						ictx.drawImage(maskCanvas, diag, diag);
						ictx.drawImage(maskCanvas, -diag, diag);
						ictx.drawImage(maskCanvas, diag, -diag);
						ictx.drawImage(maskCanvas, -diag, -diag);
					}
				}

				// Clip strictly inside layer pixels
				ictx.globalCompositeOperation = 'destination-in';
				ictx.drawImage(layerCanvas, 0, 0);

				// Colorize
				ictx.globalCompositeOperation = 'source-in';
				ictx.fillStyle = color;
				ictx.fillRect(0, 0, w, h);

				ctx.drawImage(innerCanvas, 0, 0);
			}
		}

		ctx.restore();
	}

}

export default Effects_stroke_class;
