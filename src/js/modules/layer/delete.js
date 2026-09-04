import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import { is_group, get_descendant_ids } from './../../libs/layer-tree.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Layer_delete_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	/**
	 * Confirm + delete the current multi-selection (or a specific id list).
	 * @param {number[]|number|null} ids_or_id - optional override; defaults to selected_layer_ids / active layer
	 */
	delete(ids_or_id = null) {
		const ids = this._resolve_ids(ids_or_id);
		if (!ids.length) {
			alertify.error('No layer selected.');
			return;
		}

		const layers = ids
			.map((id) => app.Layers.get_layer(id, true))
			.filter(Boolean);

		if (!layers.length) {
			alertify.error('No layer selected.');
			return;
		}

		const locked = layers.filter((l) => l.locked);
		const deletable = layers.filter((l) => !l.locked);
		if (!deletable.length) {
			alertify.error(locked.length > 1 ? 'Selected layers are locked.' : 'Cannot delete a locked layer.');
			return;
		}

		// If a selected group is included, skip separately-selected descendants (group delete removes contents).
		const skip = new Set();
		for (const l of deletable) {
			if (is_group(l)) {
				for (const did of get_descendant_ids(l.id)) {
					skip.add(did);
				}
			}
		}
		const roots = deletable.filter((l) => !skip.has(l.id));
		if (!roots.length) {
			alertify.error('Nothing to delete.');
			return;
		}

		const { title, message } = this._confirm_copy(roots, locked.length);

		alertify.confirm(
			title,
			message,
			() => {
				this._perform_delete(roots.map((l) => l.id));
			},
			() => { /* cancel */ }
		).set({
			labels: { ok: 'Delete', cancel: 'Cancel' },
			defaultFocus: 'ok',
		});
	}

	_resolve_ids(ids_or_id) {
		if (ids_or_id != null) {
			const list = Array.isArray(ids_or_id) ? ids_or_id : [ids_or_id];
			return list.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
		}
		const selected = (config.selected_layer_ids || [])
			.map((id) => parseInt(id, 10))
			.filter((id) => !isNaN(id));
		if (selected.length) {
			return selected;
		}
		if (config.layer && config.layer.id != null) {
			return [config.layer.id];
		}
		return [];
	}

	_confirm_copy(roots, locked_skipped) {
		const count = roots.length;
		const has_group = roots.some((l) => is_group(l));
		let title;
		let message;

		if (count === 1) {
			const layer = roots[0];
			if (is_group(layer)) {
				title = 'Delete Group?';
				message = 'Delete group <b>' + this._escape(layer.name) + '</b> and everything inside it?';
			} else {
				title = 'Delete Layer?';
				message = 'Delete layer <b>' + this._escape(layer.name) + '</b>?';
			}
		} else {
			title = 'Delete ' + count + ' Layers?';
			const group_note = has_group
				? ' Groups in the selection will also remove their contents.'
				: '';
			message = 'Delete <b>' + count + '</b> selected layers?' + group_note;
		}

		if (locked_skipped > 0) {
			message += '<br><br><span style="opacity:0.8">(' + locked_skipped
				+ ' locked layer' + (locked_skipped === 1 ? '' : 's') + ' will be skipped.)</span>';
		}

		return { title, message };
	}

	_escape(str) {
		return String(str == null ? '' : str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	_perform_delete(ids) {
		const actions = ids.map((id) => new app.Actions.Delete_layer_action(id));
		const label = ids.length > 1 ? 'Delete Layers' : 'Delete Layer';
		const name = ids.length > 1 ? 'delete_layers' : 'delete_layer';

		app.State.do_action(
			new app.Actions.Bundle_action(name, label, actions)
		).then(() => {
			// Reconcile selection: drop stale refs so New Layer / UI keep working.
			let live = (config.layer && config.layers && config.layers.find((l) => l.id === config.layer.id)) || null;
			if (!live && config.layers && config.layers.length) {
				live = app.Layers.get_sorted_layers()[0] || config.layers[0];
				config.layer = live;
			}
			if (!live) {
				config.layer = null;
			}
			config.selected_layer_ids = live ? [live.id] : [];
			config.layer_select_anchor_id = live ? live.id : null;
			if (app.GUI && app.GUI.GUI_layers) {
				app.GUI.GUI_layers.render_layers();
			}
		}).catch(() => {
			// Aborted (e.g. last layer) — Delete_layer_action throws; Bundle may surface it
			let live = (config.layer && config.layers && config.layers.find((l) => l.id === config.layer.id)) || null;
			if (!live && config.layers && config.layers.length) {
				live = app.Layers.get_sorted_layers()[0] || config.layers[0];
				config.layer = live;
			}
			config.selected_layer_ids = live ? [live.id] : [];
			config.layer_select_anchor_id = live ? live.id : null;
			if (app.GUI && app.GUI.GUI_layers) {
				app.GUI.GUI_layers.render_layers();
			}
		});
	}

}

export default Layer_delete_class;
