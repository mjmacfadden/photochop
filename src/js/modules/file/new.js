import app from './../../app.js';
import config from './../../config.js';
import Base_gui_class from './../../core/base-gui.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Dialog_class from './../../libs/popup.js';
import Tools_settings_class from './../tools/settings.js';

/** 
 * manages files / new
 * 
 * @author ViliusL
 */
class File_new_class {

	constructor() {
		this.Base_gui = new Base_gui_class();
		this.Base_layers = new Base_layers_class();
		this.POP = new Dialog_class();
		this.Helper = new Helper_class();
		this.Tools_settings = new Tools_settings_class();
	}

	async get_clipboard_dimensions() {
		// Check internal in-app clipboard first
		if (config._internal_clipboard && config._internal_clipboard.width > 0 && config._internal_clipboard.height > 0) {
			return {
				width: config._internal_clipboard.width,
				height: config._internal_clipboard.height
			};
		}
		// Check system clipboard if available
		if (navigator.clipboard && navigator.clipboard.read) {
			try {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					const imageType = item.types.find(t => t.startsWith('image/'));
					if (imageType) {
						const blob = await item.getType(imageType);
						const imgBitmap = await createImageBitmap(blob);
						return {
							width: imgBitmap.width,
							height: imgBitmap.height
						};
					}
				}
			} catch (err) {
				// Clipboard permission prompt denied or unsupported
			}
		}
		return null;
	}

	async new () {
		var _this = this;
		var width = config.WIDTH;
		var height = config.HEIGHT;
		var common_dimensions = this.Base_gui.common_dimensions;
		var resolution_types = ['Custom'];
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		var clipDim = await this.get_clipboard_dimensions();
		var default_res_type = 'Custom';
		if (clipDim) {
			width = clipDim.width;
			height = clipDim.height;
			default_res_type = 'Clipboard (' + clipDim.width + 'x' + clipDim.height + ')';
			resolution_types.unshift(default_res_type);
		}

		for (var i in common_dimensions) {
			var value = common_dimensions[i];
			resolution_types.push(value[0] + 'x' + value[1] + ' - ' + value[2]);
		}

		var transparency_cookie = this.Helper.getCookie('transparency');
		if (transparency_cookie === null) {
			//default
			transparency_cookie = false;
		}
		if (transparency_cookie) {
			var transparency = true;
		}
		else {
			var transparency = false;
		}

		//convert units
		width = this.Helper.get_user_unit(width, units, resolution);
		height = this.Helper.get_user_unit(height, units, resolution);

		var settings = {
			title: 'New file',
			params: [
				{name: "width", title: "Width:", value: width, comment: units},
				{name: "height", title: "Height:", value: height, comment: units},
				{name: "resolution_type", title: "Resolution:", value: default_res_type, values: resolution_types},
				{name: "layout", title: "Layout:", value: "Custom", values: ["Custom", "Landscape", "Portrait"]},
				{name: "transparency", title: "Transparent:", value: transparency},
			],
			on_change: function (params) {
				var target_res = params.resolution_type;
				if (target_res && target_res !== 'Custom') {
					var match = target_res.match(/(\d+)\s*x\s*(\d+)/i);
					if (match) {
						var w_val = parseInt(match[1]);
						var h_val = parseInt(match[2]);
						if (params.layout === 'Portrait' && w_val > h_val) {
							var t = w_val; w_val = h_val; h_val = t;
						}
						var w_input = document.getElementById('pop_data_width');
						var h_input = document.getElementById('pop_data_height');
						if (w_input && h_input) {
							w_input.value = _this.Helper.get_user_unit(w_val, units, resolution);
							h_input.value = _this.Helper.get_user_unit(h_val, units, resolution);
						}
					}
				}
			},
			on_finish: function (params) {
				_this.new_handler(params);
			},
		};
		this.POP.show(settings);
	}

	async new_handler(response) {
		var width = parseFloat(response.width);
		var height = parseFloat(response.height);
		var resolution_type = response.resolution_type;
		var transparency = response.transparency;
		var units = this.Tools_settings.get_setting('default_units');
		var resolution = this.Tools_settings.get_setting('resolution');

		if (resolution_type != 'Custom') {
			var match = resolution_type.match(/(\d+)\s*x\s*(\d+)/i);
			if (match) {
				width = parseInt(match[1]);
				height = parseInt(match[2]);
			}

			if(response.layout == 'Portrait' && width > height){
				var tmp = width;
				width = height;
				height = tmp;
			}
		}
		else {
			//convert units
			width = this.Helper.get_internal_unit(width, units, resolution);
			height = this.Helper.get_internal_unit(height, units, resolution);
		}

		if (app.Documents && !app.Documents.is_active_document_empty()) {
			app.Documents.create_document({
				title: 'Untitled-' + app.Documents.auto_title_count++,
				width: parseInt(width),
				height: parseInt(height),
				transparency: !!transparency,
				force_new: true
			});
		} else {
			// Prepare layers		
			app.State.do_action(
				new app.Actions.Bundle_action('new_file', 'New File', [
					new app.Actions.Refresh_action_attributes_action('undo'),
					new app.Actions.Prepare_canvas_action('undo'),
					new app.Actions.Update_config_action({
						TRANSPARENCY: !!transparency,
						WIDTH: parseInt(width),
						HEIGHT: parseInt(height),
						ALPHA: 255,
						COLOR: '#008000',
						mouse: {},
						visible_width: null,
						visible_height: null,
						user_fonts: {}
					}),
					new app.Actions.Prepare_canvas_action('do'),
					new app.Actions.Refresh_action_attributes_action('do'),
					new app.Actions.Reset_layers_action(),
					new app.Actions.Init_canvas_zoom_action(),
					new app.Actions.Insert_layer_action({})
				])
			);

			if (app.Documents) {
				const doc = app.Documents.get_active_document();
				if (doc) {
					if (!doc.title || doc.title === 'Background' || doc.title === 'Layer 1') {
						doc.title = 'Untitled-1';
					}
					doc.width = parseInt(width);
					doc.height = parseInt(height);
					doc.transparency = !!transparency;
					doc.action_history = [];
					doc.action_history_index = 0;
					doc.is_dirty = false;
					doc.selection = null;
					app.Documents.render_tabs();
				}
				const selModule = (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['selection'])
					? app.GUI.GUI_tools.tools_modules['selection'].object
					: null;
				if (selModule) {
					selModule.clear_selection();
				}
			}
		}

		//sleep, lets wait till DOM is finished
		await new Promise(r => setTimeout(r, 10));

		//fit to screen?
		this.Base_gui.GUI_preview.zoom_auto(true);

		// Save transparency
		if (transparency) {
			this.Helper.setCookie('transparency', 1);
		}
		else {
			this.Helper.setCookie('transparency', 0);
		}
	}

}

export default File_new_class;