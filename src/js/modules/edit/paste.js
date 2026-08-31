import app from './../../app.js';
import config from './../../config.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Edit_paste_class {

	paste() {
		if (config._internal_clipboard != null) {
			this.paste_internal();
			return;
		}
		alertify.error('Use Ctrl+V to paste from the clipboard.');
	}

	paste_internal() {
		var clip = config._internal_clipboard;
		if (clip == null || clip.data_url == null) {
			alertify.error('Nothing to paste.');
			return;
		}

		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Paste',
				type: 'image',
				data: clip.data_url,
				x: clip.x || 0,
				y: clip.y || 0,
				width: clip.width,
				height: clip.height,
				width_original: clip.width,
				height_original: clip.height,
			}, false)
		);
		// Offset slightly for consecutive pastes
		clip.x = (clip.x || 0) + 10;
		clip.y = (clip.y || 0) + 10;
	}

	async paste_to_fit() {
		var clip = config._internal_clipboard;

		// 1. Prefer the internal clipboard (in-app copy - preserves alpha, shapes, etc.)
		if (clip == null || clip.data_url == null) {
			// 2. Otherwise read an image from the actual system clipboard
			try {
				if (navigator.clipboard && navigator.clipboard.read) {
					var permission = await this.request_clipboard_permission();
					if (!permission) {
						alertify.error('Clipboard permission denied.');
						return;
					}
					var items = await navigator.clipboard.read();
					var data_url = null;
					var img_w = null;
					var img_h = null;
					for (var i = 0; i < items.length; i++) {
						var types = items[i].types || [];
						for (var t = 0; t < types.length; t++) {
							if (types[t].indexOf('image') !== -1) {
								var blob = await items[i].getType(types[t]);
								data_url = await this.blob_to_data_url(blob);
								var dims = await this.load_image_dimensions(data_url);
								img_w = dims.width;
								img_h = dims.height;
								break;
							}
						}
						if (data_url != null) break;
					}
					if (data_url == null) {
						alertify.error('No image found on the clipboard.');
						return;
					}
					this.insert_fitted(data_url, img_w, img_h);
					return;
				}
			} catch (error) {
				alertify.error('Could not read the clipboard.');
				return;
			}
			alertify.error('Nothing to paste. Copy an image first.');
			return;
		}

		this.insert_fitted(clip.data_url, clip.width, clip.height);
	}

	insert_fitted(data_url, img_width, img_height) {
		var canvas_width = config.WIDTH;
		var canvas_height = config.HEIGHT;

		if (!canvas_width || !canvas_height || !img_width || !img_height) {
			alertify.error('Invalid canvas or image dimensions.');
			return;
		}

		// Calculate scale factor to fit within canvas while maintaining aspect ratio
		var scale_x = canvas_width / img_width;
		var scale_y = canvas_height / img_height;
		var scale = Math.min(scale_x, scale_y);

		// Calculate new dimensions
		var new_width = Math.round(img_width * scale);
		var new_height = Math.round(img_height * scale);

		// Center the image on the canvas
		var x = Math.round((canvas_width - new_width) / 2);
		var y = Math.round((canvas_height - new_height) / 2);

		app.State.do_action(
			new app.Actions.Insert_layer_action({
				name: 'Paste to Fit',
				type: 'image',
				data: data_url,
				x: x,
				y: y,
				width: new_width,
				height: new_height,
				width_original: new_width,
				height_original: new_height,
			}, false)
		);
	}

	async request_clipboard_permission() {
		try {
			if (navigator.permissions && navigator.permissions.query) {
				var result = await navigator.permissions.query({ name: 'clipboard-read' });
				if (result.state === 'denied') return false;
				if (result.state === 'granted') return true;
			}
			// Assume the browser will prompt on read
			return true;
		} catch (error) {
			return true;
		}
	}

	blob_to_data_url(blob) {
		return new Promise((resolve, reject) => {
			var reader = new FileReader();
			reader.onload = function () {
				resolve(reader.result);
			};
			reader.onerror = function (error) {
				reject(error);
			};
			reader.readAsDataURL(blob);
		});
	}

	load_image_dimensions(data_url) {
		return new Promise((resolve, reject) => {
			var img = new Image();
			img.onload = function () {
				resolve({ width: img.width, height: img.height });
			};
			img.onerror = function (error) {
				reject(error);
			};
			img.src = data_url;
		});
	}
}

export default Edit_paste_class;
