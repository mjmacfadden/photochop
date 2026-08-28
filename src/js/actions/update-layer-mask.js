import app from './../app.js';
import config from './../config.js';
import { Base_action } from './base.js';

export class Update_layer_mask_action extends Base_action {
	/**
	 * Updates mask properties (enabled, linked, x, y, width, height)
	 *
	 * @param {string} layer_id
	 * @param {object} settings
	 */
	constructor(layer_id, settings) {
		super('update_layer_mask', 'Update Layer Mask');
		this.layer_id = layer_id;
		this.settings = settings;
		this.reference_layer = null;
		this.old_settings = {};
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (!this.reference_layer.mask) {
			throw new Error('Aborted - layer has no mask');
		}
		for (let i in this.settings) {
			if (['enabled', 'linked', 'x', 'y', 'width', 'height'].includes(i) === false) {
				continue;
			}
			this.old_settings[i] = this.reference_layer.mask[i];
			this.reference_layer.mask[i] = this.settings[i];
		}
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.reference_layer && this.reference_layer.mask) {
			for (let i in this.old_settings) {
				this.reference_layer.mask[i] = this.old_settings[i];
			}
			this.old_settings = {};
		}
		this.reference_layer = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	free() {
		this.settings = null;
		this.old_settings = null;
		this.reference_layer = null;
	}
}