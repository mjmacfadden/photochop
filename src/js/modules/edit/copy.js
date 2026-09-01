import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Base_selection_class from './../../core/base-selection.js';
import File_save_class from './../file/save.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

var instance = null;

class Copy_class {

	constructor() {
		if (instance) {
			return instance;
		}
		instance = this;

		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.File_save = new File_save_class();

		document.addEventListener('keydown', (event) => {
			var code = event.key.toLowerCase();
			var ctrlDown = event.ctrlKey || event.metaKey;
			if (this.Helper.is_input(event.target))
				return;

			if (code == 'c' && ctrlDown == true && event.shiftKey == false) {
				event.preventDefault();
				this.copy_to_clipboard();
			}
			if (code == 'x' && ctrlDown == true && event.shiftKey == false) {
				event.preventDefault();
				this.cut_to_clipboard();
			}
		}, false);
	}

	extract_clipboard_canvas() {
		var sel = (app.Layers && app.Layers.Base_selection) ? app.Layers.Base_selection : this.Base_layers.Base_selection;
		if (sel != null && sel.has_committed_selection()) {
			var extracted = sel.extract_selection_image(config.layer);
			if (extracted != null) {
				return extracted;
			}
		}

		var canvas = (app.Layers && typeof app.Layers.convert_layer_to_canvas === 'function')
			? app.Layers.convert_layer_to_canvas()
			: this.Base_layers.convert_layer_to_canvas();
		if (config.TRANSPARENCY == false) {
			var ctx = canvas.getContext('2d');
			ctx.globalCompositeOperation = 'destination-over';
			this.File_save.fillCanvasBackground(ctx, '#ffffff');
			ctx.globalCompositeOperation = 'source-over';
		}
		var marquee = null;
		if (typeof Base_selection_class.get_marquee_position === 'function') {
			marquee = Base_selection_class.get_marquee_position();
		} else if (app.Layers && app.Layers.Base_selection) {
			const data = app.Layers.Base_selection.get_selection_data();
			if (data && data.has_selection && data.x != null) {
				marquee = data;
			}
		}
		return {
			canvas: canvas,
			x: marquee ? marquee.x : (config.layer ? (config.layer.x || 0) : 0),
			y: marquee ? marquee.y : (config.layer ? (config.layer.y || 0) : 0),
			width: canvas.width,
			height: canvas.height,
		};
	}

	store_internal_clipboard(extracted) {
		if (extracted == null || extracted.canvas == null)
			return;
		config._internal_clipboard = {
			data_url: extracted.canvas.toDataURL('image/png'),
			x: extracted.x,
			y: extracted.y,
			width: extracted.width,
			height: extracted.height,
		};
		config._clipboard_position = { x: extracted.x, y: extracted.y };
		config._internal_clipboard_fresh = true;
	}

	copy_to_clipboard() {
		var extracted = this.extract_clipboard_canvas();
		if (extracted == null) {
			alertify.error('Nothing to copy.');
			return;
		}
		this.store_internal_clipboard(extracted);

		try {
			if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
				var blobPromise = new Promise((resolve) => {
					extracted.canvas.toBlob((blob) => {
						resolve(blob || new Blob([], { type: 'image/png' }));
					}, 'image/png');
				});
				navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]).catch((err) => {
					console.warn('System clipboard write failed:', err);
				});
			}
		} catch (error) {
			console.warn('System clipboard write error:', error);
		}
	}

	async cut_to_clipboard() {
		var sel = this.Base_layers.Base_selection;
		var had_selection = sel != null && sel.has_committed_selection();
		await this.copy_to_clipboard();
		if (had_selection) {
			var module = app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules
				? app.GUI.GUI_tools.tools_modules['selection']
				: null;
			if (module && module.object && typeof module.object.delete_selection == 'function') {
				module.object.delete_selection();
			}
		}
	}
}

export default Copy_class;
