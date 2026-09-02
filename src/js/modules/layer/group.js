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
	 * Wrap the currently selected layer in a new group (PS "Group Layers"
	 * for a single selection — multi-select is not implemented yet).
	 */
	group_layers() {
		const active = config.layer;
		if (!active) {
			alertify.error('No layer selected.');
			return;
		}
		if (active.locked) {
			alertify.error('Cannot group a locked layer.');
			return;
		}
		if (is_group(active)) {
			alertify.error('Select a non-group layer to wrap, or use New Group.');
			return;
		}

		const parent_id = get_parent_id(active);
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
			order: (active.order || 0) + 1,
			width: null,
			height: null,
			data: null,
			link: null,
			is_vector: false,
		};

		app.State.do_action(
			new app.Actions.Bundle_action('group_layers', 'Group Layers', [
				new app.Actions.Insert_layer_action(group_settings, false),
				new app.Actions.Update_layer_action(active.id, { parent_id: group_id }),
			])
		);
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
		const lid = parseInt(layer_id, 10);
		const layer = app.Layers.get_layer(lid);
		if (!layer || layer.locked) return;
		const tp = parseInt(target_parent_id, 10) || 0;
		if (would_cycle(lid, tp)) {
			alertify.error('Cannot move a group into itself.');
			return;
		}
		if (tp) {
			const parent = app.Layers.get_layer(tp);
			if (!parent || !is_group(parent)) {
				alertify.error('Drop target parent must be a group.');
				return;
			}
		}

		const updates = { parent_id: tp };
		const ref = reference_layer_id ? app.Layers.get_layer(parseInt(reference_layer_id, 10)) : null;
		if (ref) {
			const delta = place_above ? 0.5 : -0.5;
			updates.order = (ref.order || 0) + delta;
		}

		const actions = [new app.Actions.Update_layer_action(lid, updates)];

		if (is_group(layer) && ref && updates.order != null) {
			const desc = get_descendant_ids(lid);
			const shift = updates.order - (layer.order || 0);
			for (const did of desc) {
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

		app.State.do_action(
			new app.Actions.Bundle_action('reparent_layer', 'Move Layer', actions)
		);
	}

}

export default Layer_group_class;
