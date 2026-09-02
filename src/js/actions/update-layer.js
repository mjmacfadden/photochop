import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';

export class Update_layer_action extends Base_action {
	/**
	 * Updates an existing layer with the provided settings
	 * WARNING: If passing objects or arrays into settings, make sure these are new or cloned objects, and not a modified existing object!
	 *
	 * @param {string} layer_id
	 * @param {object} settings 
	 */
	constructor(layer_id, settings) {
		super('update_layer', 'Update Layer');
		this.layer_id = layer_id;
		this.settings = settings;
		this.reference_layer = null;
		this.old_settings = {};
		this.old_mask = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}

		var old_x = this.reference_layer.x || 0;
		var old_y = this.reference_layer.y || 0;
		var old_w = this.reference_layer.width || 0;
		var old_h = this.reference_layer.height || 0;

		for (let i in this.settings) {
			if (i == 'id')
				continue;
			// order is allowed so group reparent / tree drag can update z-order
			if (this.reference_layer[i] && typeof this.reference_layer[i] === 'object') {
				try {
					this.old_settings[i] = JSON.parse(JSON.stringify(this.reference_layer[i]));
				} catch (e) {
					this.old_settings[i] = this.reference_layer[i];
				}
			} else {
				this.old_settings[i] = this.reference_layer[i];
			}
			this.reference_layer[i] = this.settings[i];
		}

		// Keep linked mask synchronized with layer transformations if not explicitly specified in settings
		if (this.reference_layer.mask && this.reference_layer.mask.linked !== false && !('mask' in this.settings)) {
			var new_x = (this.reference_layer.x != null) ? this.reference_layer.x : 0;
			var new_y = (this.reference_layer.y != null) ? this.reference_layer.y : 0;
			var new_w = (this.reference_layer.width != null) ? this.reference_layer.width : 0;
			var new_h = (this.reference_layer.height != null) ? this.reference_layer.height : 0;

			var x_changed = new_x !== old_x || new_y !== old_y;
			var size_changed = (old_w > 0 && new_w > 0 && new_w !== old_w) || (old_h > 0 && new_h > 0 && new_h !== old_h);

			if (x_changed || size_changed) {
				this.old_mask = {
					x: this.reference_layer.mask.x,
					y: this.reference_layer.mask.y,
					width: this.reference_layer.mask.width,
					height: this.reference_layer.mask.height
				};
				var xr = (old_w > 0 && new_w > 0) ? new_w / old_w : 1;
				var yr = (old_h > 0 && new_h > 0) ? new_h / old_h : 1;

				if (size_changed) {
					this.reference_layer.mask.x = Math.round(new_x + (this.old_mask.x - old_x) * xr);
					this.reference_layer.mask.y = Math.round(new_y + (this.old_mask.y - old_y) * yr);
					this.reference_layer.mask.width = Math.max(1, Math.round(this.old_mask.width * xr));
					this.reference_layer.mask.height = Math.max(1, Math.round(this.old_mask.height * yr));
				} else if (x_changed) {
					this.reference_layer.mask.x = Math.round(this.old_mask.x + (new_x - old_x));
					this.reference_layer.mask.y = Math.round(this.old_mask.y + (new_y - old_y));
				}
				delete this.reference_layer.mask._alpha_canvas;
				delete this.reference_layer.mask._alpha_source;
			}
		}

		if (this.reference_layer.type === 'text' && ('data' in this.settings)) {
			this.reference_layer._needs_update_data = true;
			// Sync the live text editor immediately (don't wait for the next render).
			// Otherwise point-text transform scale can look correct for one frame then snap back.
			if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text']) {
				const textTool = app.GUI.GUI_tools.tools_modules['text'].object;
				if (textTool && typeof textTool.get_editor === 'function') {
					const editor = textTool.get_editor(this.reference_layer);
					if (editor && typeof editor.set_lines === 'function') {
						editor.hasValueChanged = true;
						editor.set_lines(JSON.parse(JSON.stringify(this.reference_layer.data || [])));
						if (textTool.layer === this.reference_layer || config.layer === this.reference_layer) {
							textTool.focusedValue = JSON.stringify(editor.document.lines);
							textTool.focusedWidth = this.reference_layer.width;
							textTool.focusedHeight = this.reference_layer.height;
						}
					}
				}
			}
		}
		if (this.settings.params || this.settings.width || this.settings.height) {
			config.need_render_changed_params = true;
		}
		app.Layers.invalidate({ document: true, preview: true, details: true });
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		app.Layers.render();
	}

	async undo() {
		super.undo();
		if (!this.reference_layer) {
			this.reference_layer = app.Layers.get_layer(this.layer_id);
		}
		if (this.reference_layer) {
			for (let i in this.old_settings) {
				if (this.old_settings[i] && typeof this.old_settings[i] === 'object') {
					try {
						this.reference_layer[i] = JSON.parse(JSON.stringify(this.old_settings[i]));
					} catch (e) {
						this.reference_layer[i] = this.old_settings[i];
					}
				} else {
					this.reference_layer[i] = this.old_settings[i];
				}
			}
			if (this.old_mask && this.reference_layer.mask) {
				this.reference_layer.mask.x = this.old_mask.x;
				this.reference_layer.mask.y = this.old_mask.y;
				this.reference_layer.mask.width = this.old_mask.width;
				this.reference_layer.mask.height = this.old_mask.height;
				delete this.reference_layer.mask._alpha_canvas;
				delete this.reference_layer.mask._alpha_source;
				this.old_mask = null;
			}
			if (this.reference_layer.type === 'text') {
				this.reference_layer._needs_update_data = true;
				if (app.GUI && app.GUI.GUI_tools && app.GUI.GUI_tools.tools_modules['text']) {
					const textTool = app.GUI.GUI_tools.tools_modules['text'].object;
					if (textTool && typeof textTool.get_editor === 'function') {
						const editor = textTool.get_editor(this.reference_layer);
						if (editor && typeof editor.set_lines === 'function') {
							editor.hasValueChanged = true;
							editor.set_lines(JSON.parse(JSON.stringify(this.reference_layer.data || [])));
						}
					}
				}
			}
			if (this.old_settings.params || this.old_settings.width || this.old_settings.height) {
				config.need_render_changed_params = true;
			}
		}
		app.Layers.invalidate({ document: true, preview: true, details: true });
		if (app.GUI && app.GUI.GUI_layers) {
			app.GUI.GUI_layers.render_layers();
		}
		app.Layers.render();
	}

	free() {
		this.settings = null;
		this.old_settings = null;
		this.old_mask = null;
		this.reference_layer = null;
	}
}