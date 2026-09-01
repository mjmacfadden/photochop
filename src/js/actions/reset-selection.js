import app from '../app.js';
import config from '../config.js';
import { Base_action } from './base.js';

export class Reset_selection_action extends Base_action {
	/**
	 * Sets the selection to empty
	 * 
	 * @prop {object} [mirror_selection_settings] - Optional object to also set to an empty selection object 
	 */
	constructor(mirror_selection_settings) {
		super('reset_selection', 'Reset Selection');
		this.mirror_selection_settings = mirror_selection_settings;
		this.old_mask = null;
		this.settings_reference = null;
		this.old_settings_data = null;
	}

	async do() {
		super.do();
		if (app.Layers && app.Layers.Base_selection) {
			if (app.Layers.Base_selection.has_selection) {
				this.old_mask = app.Layers.Base_selection.clone_mask_canvas();
			}
			app.Layers.Base_selection.clear_mask();
		}
		this.settings_reference = app.Layers.Base_selection.find_settings('selection');
		if (this.settings_reference && this.settings_reference.data) {
			this.old_settings_data = JSON.parse(JSON.stringify(this.settings_reference.data));
			this.settings_reference.data = {
				x: null,
				y: null,
				width: null,
				height: null,
				shape: null,
				path: null,
				regions: null,
				active_region: null
			};
		}
		if (this.mirror_selection_settings) {
			this.mirror_selection_settings.x = null;
			this.mirror_selection_settings.y = null;
			this.mirror_selection_settings.width = null;
			this.mirror_selection_settings.height = null;
			this.mirror_selection_settings.shape = null;
			this.mirror_selection_settings.path = null;
			this.mirror_selection_settings.regions = null;
			this.mirror_selection_settings.active_region = null;
		}
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.old_mask && app.Layers && app.Layers.Base_selection) {
			app.Layers.Base_selection.set_mask_canvas(this.old_mask);
		}
		if (this.old_settings_data && this.settings_reference) {
			for (let prop of ['x', 'y', 'width', 'height', 'shape', 'path', 'regions', 'active_region']) {
				this.settings_reference.data[prop] = this.old_settings_data[prop];
				if (this.mirror_selection_settings) {
					this.mirror_selection_settings[prop] = this.old_settings_data[prop];
				}
			}
		}
		this.settings_reference = null;
		this.old_settings_data = null;
		config.need_render = true;
	}

	free() {
		this.old_mask = null;
		this.settings_reference = null;
		this.old_settings_data = null;
		this.mirror_selection_settings = null;
	}
}