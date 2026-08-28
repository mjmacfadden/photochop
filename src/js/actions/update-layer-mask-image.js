import app from './../app.js';
import config from './../config.js';
import alertify from './../../../node_modules/alertifyjs/build/alertify.min.js';
import image_store from './store/image-store.js';
import { Base_action } from './base.js';

export class Update_layer_mask_image_action extends Base_action {
	/**
	 * updates the layer mask bitmap
	 *
	 * @param {canvas} canvas new mask bitmap (native mask size)
	 * @param {int} layer_id (optional)
	 */
	constructor(canvas, layer_id) {
		super('update_layer_mask_image', 'Update Layer Mask');
		this.canvas = canvas;
		if (layer_id == null)
			layer_id = config.layer.id;
		this.layer_id = parseInt(layer_id);
		this.reference_layer = null;
		this.old_image_id = null;
		this.new_image_id = null;
		this.old_database_id = null;
	}

	async do() {
		super.do();
		this.reference_layer = app.Layers.get_layer(this.layer_id);
		if (!this.reference_layer) {
			throw new Error('Aborted - layer with specified id doesn\'t exist');
		}
		if (!this.reference_layer.mask) {
			alertify.error('Error: layer has no mask.');
			throw new Error('Aborted - layer has no mask');
		}

		let data_url;
		if (this.new_image_id) {
			try {
				data_url = await image_store.get(this.new_image_id);
			} catch (error) {
				throw new Error('Aborted - problem retrieving cached mask from database');
			}
		}
		else if (this.canvas) {
			data_url = this.canvas.toDataURL('image/png');
		}

		try {
			if (!this.old_image_id) {
				if (this.reference_layer.mask._mask_database_id) {
					this.old_image_id = this.reference_layer.mask._mask_database_id;
				}
				else if (this.reference_layer.mask.link
					&& typeof this.reference_layer.mask.link.toDataURL == 'function') {
					this.old_image_id = await image_store.add(this.reference_layer.mask.link.toDataURL('image/png'));
				}
			}
			if (!this.new_image_id && data_url) {
				this.new_image_id = await image_store.add(data_url);
			}
		} catch (error) {
			console.log(error);
			requestAnimationFrame(() => {
				app.State.free(0, this.database_estimate || 1)
			});
		}

		// Estimate storage size
		try {
			this.database_estimate = new Blob([await image_store.get(this.old_image_id)]).size;
		} catch (e) {}

		// Assign mask content
		if (data_url) {
			const img = new Image();
			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = () => reject(new Error('Failed to load mask image'));
				img.src = data_url;
			});
			const ctx = this.reference_layer.mask.link.getContext('2d');
			if (this.reference_layer.mask.link.width != img.width
				|| this.reference_layer.mask.link.height != img.height) {
				this.reference_layer.mask.link.width = img.width;
				this.reference_layer.mask.link.height = img.height;
			}
			ctx.clearRect(0, 0, this.reference_layer.mask.link.width, this.reference_layer.mask.link.height);
			ctx.drawImage(img, 0, 0);
		}

		this.old_database_id = this.reference_layer.mask._mask_database_id;
		this.reference_layer.mask._mask_database_id = this.new_image_id;

		this.canvas = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	async undo() {
		super.undo();
		if (this.old_image_id != null) {
			try {
				const data_url = await image_store.get(this.old_image_id);
				const img = new Image();
				await new Promise((resolve, reject) => {
					img.onload = resolve;
					img.onerror = () => reject(new Error('Failed to load mask image'));
					img.src = data_url;
				});
				const ctx = this.reference_layer.mask.link.getContext('2d');
				if (this.reference_layer.mask.link.width != img.width
					|| this.reference_layer.mask.link.height != img.height) {
					this.reference_layer.mask.link.width = img.width;
					this.reference_layer.mask.link.height = img.height;
				}
				ctx.clearRect(0, 0, this.reference_layer.mask.link.width, this.reference_layer.mask.link.height);
				ctx.drawImage(img, 0, 0);
			} catch (error) {
				throw new Error('Failed to retrieve mask from store');
			}
		}
		this.reference_layer.mask._mask_database_id = this.old_database_id;
		this.reference_layer = null;
		app.GUI.GUI_layers.render_layers();
		config.need_render = true;
	}

	async free() {
		let has_error = false;
		if (this.new_image_id != null) {
			try {
				await image_store.delete(this.new_image_id);
			} catch (error) {
				has_error = true;
			}
			this.new_image_id = null;
		}
		if (this.is_done || !this.old_database_id) {
			if (this.old_image_id != null) {
				try {
					await image_store.delete(this.old_image_id);
				} catch (error) {
					has_error = true;
				}
				this.old_image_id = null;
			}
		}
		this.old_database_id = null;
		this.canvas = null;
		this.reference_layer = null;
		if (has_error) {
			alertify.error('A problem occurred while removing undo history. It\'s suggested you save your work and refresh the page in order to free up memory.');
		}
	}
}