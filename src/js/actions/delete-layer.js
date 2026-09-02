import config from '../config.js';
import app from './../app.js';
import { Base_action } from './base.js';
import { is_group, get_children } from './../libs/layer-tree.js';

export class Delete_layer_action extends Base_action {
	/**
	 * removes layer
	 *
	 * @param {int} id
	 * @param {boolean} force - Force to delete first layer?
	 */
	constructor(layer_id, force) {
		super('delete_layer', 'Delete Layer');
		this.layer_id = parseInt(layer_id);
		this.force = force || false;
		this.insert_layer_action = null;
		this.select_layer_action = null;
		this.delete_index = null;
		this.deleted_layer = null;
		// Group delete policy: delete group AND its contents (PS default without prompt).
		this.child_delete_actions = [];
	}

	async do() {
		super.do();
		const id = this.layer_id;
		const force = this.force;

		// Determine if there is a layer to delete, abort if not
		for (var i in config.layers) {
			if (config.layers[i].id == id) {
				this.delete_index = i;
			}
		}
		if (this.delete_index === null) {
			throw new Error('Aborted - Layer to delete not found');
		}

		// Prevent deletion of locked layers
		if (config.layers[this.delete_index].locked && !this.force) {
			throw new Error('Aborted - Cannot delete locked layer');
		}

		if (config.layers.length == 1 && (force == undefined || force == false)) {
			// Only 1 layer left
			if (config.layer.type == null) {
				//STOP
				throw new Error('Aborted - Will not delete last layer');
			}
			else {
				// Delete it, but before that - create new empty layer
				this.insert_layer_action = new app.Actions.Insert_layer_action();
				this.insert_layer_action.do();
			}
		}

		if (config.layers.length > 1 && config.layer.id == id) {
			// Select next or previous layer
			try {
				const select_action = new app.Actions.Select_next_layer_action(id);
				await select_action.do();
				this.select_layer_action = select_action;
			} catch (error) {
				const select_action = new app.Actions.Select_previous_layer_action(id);
				await select_action.do();
				this.select_layer_action = select_action;
			}
		}

		// If this is a group, delete descendants first (contents go with the group).
		const target = config.layers[this.delete_index];
		if (target && is_group(target)) {
			// Direct children only; nested groups recursively delete their own contents.
			const kids = get_children(id).slice().reverse();
			for (const child of kids) {
				const child_action = new app.Actions.Delete_layer_action(child.id, true);
				await child_action.do();
				this.child_delete_actions.push(child_action);
			}
			// refresh index after child deletes
			this.delete_index = null;
			for (var i in config.layers) {
				if (config.layers[i].id == id) {
					this.delete_index = i;
				}
			}
			if (this.delete_index === null) {
				throw new Error('Aborted - Group layer vanished while deleting children');
			}
		}

		// Remove layer from list
		this.deleted_layer = config.layers.splice(this.delete_index, 1)[0];

		// Invalidate renderer texture cache for deleted layer
		app.Layers.notify_layer_data_changed(id);

		// Estimate memory
		if (this.deleted_layer.link && this.deleted_layer.link.src && typeof this.deleted_layer.link.src === 'string') {
			this.memory_estimate = new Blob([this.deleted_layer.link.src]).size;
		}

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	async undo() {
		super.undo();
		if (this.deleted_layer) {
			config.layers.splice(this.delete_index, 0, this.deleted_layer);
			this.delete_index = null;
			this.deleted_layer = null;
		}
		// Undo child deletes in reverse order (restore deepest first was do; undo shallow-last)
		for (let i = this.child_delete_actions.length - 1; i >= 0; i--) {
			await this.child_delete_actions[i].undo();
			this.child_delete_actions[i].free();
		}
		this.child_delete_actions = [];
		if (this.select_layer_action) {
			await this.select_layer_action.undo();
			this.select_layer_action.free();
			this.select_layer_action = null;
		}
		if (this.insert_layer_action) {
			await this.insert_layer_action.undo();
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}

		// Estimate memory
		this.memory_estimate = 0;

		app.Layers.render();
		app.GUI.GUI_layers.render_layers();
	}

	free() {
		if (this.deleted_layer) {
			delete this.deleted_layer.link;
			delete this.deleted_layer.data;
		}
		for (const a of this.child_delete_actions) {
			a.free();
		}
		this.child_delete_actions = [];
		if (this.insert_layer_action) {
			this.insert_layer_action.free();
			this.insert_layer_action = null;
		}
		if (this.select_layer_action) {
			this.select_layer_action.free();
			this.select_layer_action = null;
		}
		this.deleted_layer = null;
	}
}