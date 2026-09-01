import app from '../app.js';
import config from '../config.js';
import { Base_action } from './base.js';

export class Set_selection_action extends Base_action {
	/**
	 * Sets the selection to the specified position/dimensions OR sets the selection mask canvas
	 */
	constructor(x, y, width, height, old_settings_override, extra_data) {
		super('set_selection', 'Set Selection');
		if (x instanceof HTMLCanvasElement || (x && x.getContext)) {
			this.is_mask_mode = true;
			this.new_mask = this.clone_canvas(x);
			this.old_mask = (y instanceof HTMLCanvasElement || (y && y.getContext)) ? this.clone_canvas(y) : null;
		} else {
			this.is_mask_mode = false;
			this.x = x;
			this.y = y;
			this.width = width;
			this.height = height;
			this.extra_data = extra_data ? JSON.parse(JSON.stringify(extra_data)) : null;
			this.settings_reference = null;
			this.old_settings_data = null;
			this.old_settings_override = old_settings_override ? JSON.parse(JSON.stringify(old_settings_override)) || null : null;
		}
	}

	clone_canvas(src) {
		if (!src) return null;
		var c = document.createElement('canvas');
		c.width = src.width;
		c.height = src.height;
		c.getContext('2d').drawImage(src, 0, 0);
		return c;
	}

	async do() {
		super.do();
		if (this.is_mask_mode) {
			if (this.new_mask && app.Layers && app.Layers.Base_selection) {
				app.Layers.Base_selection.set_mask_canvas(this.new_mask);
			} else if (app.Layers && app.Layers.Base_selection) {
				app.Layers.Base_selection.clear_mask();
			}
		} else {
			this.settings_reference = app.Layers.Base_selection.find_settings('selection');
			this.old_settings_data = JSON.parse(JSON.stringify(this.settings_reference.data));
			if (this.x != null)
				this.settings_reference.data.x = this.x;
			if (this.y != null)
				this.settings_reference.data.y = this.y;
			if (this.width != null)
				this.settings_reference.data.width = this.width;
			if (this.height != null)
				this.settings_reference.data.height = this.height;
			if (this.extra_data != null) {
				for (let prop in this.extra_data) {
					this.settings_reference.data[prop] = this.extra_data[prop];
				}
			}
		}

		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.is_mask_mode) {
			if (this.old_mask && app.Layers && app.Layers.Base_selection) {
				app.Layers.Base_selection.set_mask_canvas(this.old_mask);
			} else if (app.Layers && app.Layers.Base_selection) {
				app.Layers.Base_selection.clear_mask();
			}
		} else {
			if (this.old_settings_override) {
				for (let prop in this.old_settings_override) {
					this.settings_reference.data[prop] = this.old_settings_override[prop];   
				}
			} else if (this.old_settings_data) {
				for (let prop in this.old_settings_data) {
					this.settings_reference.data[prop] = this.old_settings_data[prop];   
				}
			}
			this.settings_reference = null;
			this.old_settings_data = null;
		}
		config.need_render = true;
	}

	free() {
		this.settings_reference = null;
		this.old_settings_override = null;
		this.old_settings_data = null;
		this.new_mask = null;
		this.old_mask = null;
	}
}