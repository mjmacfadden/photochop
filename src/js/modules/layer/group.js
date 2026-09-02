import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import {
	is_group,
	get_parent_id,
	get_descendant_ids,
	resolve_insert_parent_id,
	next_order,
	would_cycle,
} from './../../libs/layer-tree.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Layer_group_class {

	constructor() {
		this.Base_layers = new Base_layers_class();
	}

	/**
	 * Create an empty group. Places it inside the active group, or as a sibling
	 * of the active layer.
	 */
	new_group() {
		const active = config.layer;
		const parent_id = resolve_insert_parent_id(active);
		const order = next_order();
		const settings = {
			name: 'Group ' + app.Layers.auto_increment,
			type: 'group',
			parent_id: parent_id,
			opened: true,
			composition: 'pass-through',
			opacity: 100,
			visible: true,
			order: order,
			width: null,
			height: null,
			data: null,
			link: null,
			is_vector: false,
		};
		app.State.do_action(
			new app.Actions.Bundle_action('new_group', 'New Group', [
				new app.Actions.Insert_layer_action(settings, false),
			])
		);
	}

	/**
	 * Wrap currently selected layer(s) in a new group (Photoshop "Group Layers").
	 * Uses config.selected_layer_ids when multi-select is active.
	 */
	group_layers() {
		const id_list = (Array.isArray(config.selected_layer_ids) && config.selected_layer_ids.length)
			? config.selected_layer_ids.slice()
			: (config.layer ? [config.layer.id] : []);

		const layers = [];
		for (const raw of id_list) {
			const layer = app.Layers.get_layer(parseInt(raw, 10));
			if (!layer) continue;
			if (layer.locked) {
				alertify.error('Cannot group a locked layer.');
				return;
			}
			layers.push(layer);
		}

		if (!layers.length) {
			alertify.error('No layer selected.');
			return;
		}

		const parent_id = get_parent_id(layers[0]);
		for (let i = 1; i < layers.length; i++) {
			if (get_parent_id(layers[i]) !== parent_id) {
				alertify.error('Selected layers must share the same parent to group.');
				return;
			}
		}

		// Preserve relative stack order (ascending = bottom → top)
		layers.sort((a, b) => (a.order || 0) - (b.order || 0));

		let max_order = 0;
		for (const l of layers) {
			if ((l.order || 0) > max_order) max_order = l.order || 0;
		}

		const group_id = app.Layers.auto_increment;
		const group_settings = {
			id: group_id,
			name: 'Group ' + group_id,
			type: 'group',
			parent_id: parent_id,
			opened: true,
			composition: 'pass-through',
			opacity: 100,
			visible: true,
			order: max_order + 1,
			width: null,
			height: null,
			data: null,
			link: null,
			is_vector: false,
		};

		const actions = [
			new app.Actions.Insert_layer_action(group_settings, false),
		];
		for (const l of layers) {
			actions.push(new app.Actions.Update_layer_action(l.id, { parent_id: group_id }));
		}

		app.State.do_action(
			new app.Actions.Bundle_action('group_layers', 'Group Layers', actions)
		).then(() => {
			config.selected_layer_ids = [group_id];
			config.layer_select_anchor_id = group_id;
			if (app.GUI && app.GUI.GUI_layers) {
				app.GUI.GUI_layers.render_layers();
			}
		});
	}

	/**
	 * Ungroup: move children to the group's parent, then delete the group shell.
	 * Children are kept (Photoshop "Ungroup Layers").
	 */
	ungroup() {
		const active = config.layer;
		if (!active || !is_group(active)) {
			alertify.error('Select a group to ungroup.');
			return;
		}
		const group_id = active.id;
		const new_parent = get_parent_id(active);
		const children = (config.layers || []).filter((l) => get_parent_id(l) === group_id);
		const actions = children.map((c) =>
			new app.Actions.Update_layer_action(c.id, { parent_id: new_parent })
		);
		actions.push(new app.Actions.Delete_layer_action(group_id, true));
		app.State.do_action(
			new app.Actions.Bundle_action('ungroup', 'Ungroup Layers', actions)
		);
	}

	toggle_opened(layer_id) {
		const id = parseInt(layer_id, 10);
		const layer = app.Layers.get_layer(id);
		if (!layer || !is_group(layer)) return;
		app.State.do_action(
			new app.Actions.Update_layer_action(id, { opened: layer.opened === false })
		);
	}

	/**
	 * Reparent layer under target_parent_id and place its order near
	 * reference_layer (drop target). Used by Layers panel drag-and-drop.
	 */
	reparent(layer_id, target_parent_id, reference_layer_id, place_above) {
		this.reparent_many([layer_id], target_parent_id, reference_layer_id, place_above);
	}

	/**
	 * Reparent one or more layers (multi-select drag). Preserves relative
	 * stack order. Skips locked layers and descendants of other moved groups.
	 */
	reparent_many(layer_ids, target_parent_id, reference_layer_id, place_above) {
		const raw = (Array.isArray(layer_ids) ? layer_ids : [layer_ids])
			.map((id) => parseInt(id, 10))
			.filter((id) => !isNaN(id));
		if (!raw.length) return;

		const tp = parseInt(target_parent_id, 10) || 0;
		if (tp) {
			const parent = app.Layers.get_layer(tp);
			if (!parent || !is_group(parent)) {
				alertify.error('Drop target parent must be a group.');
				return;
			}
		}

		// Resolve layers; skip locked / missing.
		const candidates = [];
		for (const id of raw) {
			const layer = app.Layers.get_layer(id);
			if (!layer) continue;
			if (layer.locked) continue;
			candidates.push(layer);
		}
		if (!candidates.length) return;

		// If a group is moved, skip separately-selected descendants.
		const skip = new Set();
		for (const l of candidates) {
			if (is_group(l)) {
				for (const did of get_descendant_ids(l.id)) {
					skip.add(parseInt(did, 10));
				}
			}
		}
		let layers = candidates.filter((l) => !skip.has(parseInt(l.id, 10)));

		// Never drop a selection onto / into itself.
		const moving_ids = new Set(layers.map((l) => parseInt(l.id, 10)));
		if (tp && moving_ids.has(tp)) {
			alertify.error('Cannot move a group into itself.');
			return;
		}
		for (const l of layers) {
			if (would_cycle(l.id, tp)) {
				alertify.error('Cannot move a group into itself.');
				return;
			}
		}

		// Preserve relative stack order (ascending = bottom → top).
		layers.sort((a, b) => (a.order || 0) - (b.order || 0));

		const ref = reference_layer_id
			? app.Layers.get_layer(parseInt(reference_layer_id, 10))
			: null;

		const n = layers.length;
		const orders = [];
		if (ref) {
			if (place_above) {
				// Block sits just above the reference (higher order = higher in stack).
				const base = (ref.order || 0) + 0.5;
				for (let i = 0; i < n; i++) {
					orders.push(base + i * 0.001);
				}
			} else {
				// Block sits just below the reference; top of block closest to ref.
				const top = (ref.order || 0) - 0.5;
				for (let i = 0; i < n; i++) {
					orders.push(top - (n - 1 - i) * 0.001);
				}
			}
		} else {
			let o = next_order();
			for (let i = 0; i < n; i++) {
				orders.push(o + i);
			}
		}

		const actions = [];
		for (let i = 0; i < n; i++) {
			const layer = layers[i];
			const new_order = orders[i];
			const updates = { parent_id: tp, order: new_order };
			actions.push(new app.Actions.Update_layer_action(layer.id, updates));

			if (is_group(layer)) {
				const shift = new_order - (layer.order || 0);
				if (shift !== 0) {
					for (const did of get_descendant_ids(layer.id)) {
						const dlayer = app.Layers.get_layer(did);
						if (dlayer) {
							actions.push(
								new app.Actions.Update_layer_action(did, {
									order: (dlayer.order || 0) + shift,
								})
							);
						}
					}
				}
			}
		}

		const label = n > 1 ? 'Move Layers' : 'Move Layer';
		const name = n > 1 ? 'reparent_layers' : 'reparent_layer';
		const moved_ids = layers.map((l) => l.id);

		app.State.do_action(
			new app.Actions.Bundle_action(name, label, actions)
		).then(() => {
			// Keep the multi-selection after the move.
			config.selected_layer_ids = moved_ids.slice();
			if (config.layer && moved_ids.indexOf(config.layer.id) === -1) {
				const primary = app.Layers.get_layer(moved_ids[moved_ids.length - 1]);
				if (primary) config.layer = primary;
			}
			config.layer_select_anchor_id = config.layer ? config.layer.id : (moved_ids[0] || null);
			if (app.GUI && app.GUI.GUI_layers) {
				app.GUI.GUI_layers.render_layers();
			}
		});
	}

}

export default Layer_group_class;
