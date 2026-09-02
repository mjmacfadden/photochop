/**
 * Layer tree helpers for Vantage Point / PhotoChop.
 *
 * Model (flat list + parent_id):
 * - config.layers is a flat array.
 * - parent_id: 0 = root; otherwise id of a type==="group" layer.
 * - type === "group": folder/group layer (no pixels). Nested groups allowed.
 * - opened: boolean — expanded in the Layers panel (maps to ag-psd `opened`).
 * - order: global paint/UI order. Higher order = higher in the stack / nearer the
 *   top of the Layers panel. Within a parent, siblings sort by order.
 * - composition: for groups, "pass-through" (default, PS pass through) or a
 *   normal canvas blend. Compositor currently treats groups as pass-through
 *   (skips the group node; children paint in global order). Non-pass-through
 *   is preserved for PSD round-trip.
 *
 * ag-psd: Layer with `children` array = group. `opened` = expanded. children
 * ordered bottom-to-top (same as Vantage order ascending).
 */

import config from './../config.js';

export function is_group(layer) {
	return !!(layer && layer.type === 'group');
}

export function get_parent_id(layer) {
	if (!layer) return 0;
	const pid = layer.parent_id;
	return (pid == null || pid === false) ? 0 : parseInt(pid, 10) || 0;
}

export function get_children(parent_id, layers) {
	const pid = parseInt(parent_id, 10) || 0;
	const list = layers || config.layers || [];
	return list
		.filter((l) => get_parent_id(l) === pid)
		.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function get_children_desc(parent_id, layers) {
	return get_children(parent_id, layers).slice().reverse();
}

/** All descendant ids (not including the root id), depth-first. */
export function get_descendant_ids(layer_id, layers) {
	const list = layers || config.layers || [];
	const out = [];
	const walk = (pid) => {
		for (const child of get_children(pid, list)) {
			out.push(child.id);
			if (is_group(child)) walk(child.id);
		}
	};
	walk(parseInt(layer_id, 10));
	return out;
}

export function get_ancestors(layer_id, layers) {
	const list = layers || config.layers || [];
	const byId = new Map(list.map((l) => [l.id, l]));
	const out = [];
	let cur = byId.get(parseInt(layer_id, 10));
	const guard = new Set();
	while (cur) {
		const pid = get_parent_id(cur);
		if (!pid || guard.has(pid)) break;
		guard.add(pid);
		const parent = byId.get(pid);
		if (!parent) break;
		out.push(parent);
		cur = parent;
	}
	return out;
}

export function get_depth(layer, layers) {
	return get_ancestors(layer && layer.id, layers).length;
}

/** True if layer and all ancestor groups are visible. */
export function is_effectively_visible(layer, layers) {
	if (!layer || layer.visible === false) return false;
	const ancestors = get_ancestors(layer.id, layers);
	for (const a of ancestors) {
		if (a.visible === false) return false;
	}
	return true;
}

/** Would placing `layer_id` under `new_parent_id` create a cycle? */
export function would_cycle(layer_id, new_parent_id, layers) {
	const lid = parseInt(layer_id, 10);
	const np = parseInt(new_parent_id, 10) || 0;
	if (!np) return false;
	if (np === lid) return true;
	const desc = new Set(get_descendant_ids(lid, layers));
	return desc.has(np);
}

/**
 * Flat list for Layers panel (top of panel first = high order).
 * Respects collapsed groups (skips descendants of closed groups).
 */
export function get_tree_rows(layers) {
	const list = layers || config.layers || [];
	const rows = [];
	const walk = (parent_id, depth) => {
		const kids = get_children_desc(parent_id, list);
		for (const layer of kids) {
			rows.push({ layer, depth });
			if (is_group(layer) && layer.opened !== false) {
				walk(layer.id, depth + 1);
			}
		}
	};
	walk(0, 0);
	return rows;
}

/**
 * Count nodes in an ag-psd children tree (groups + leaves).
 */
export function count_psd_nodes(nodes) {
	if (!nodes || !nodes.length) return 0;
	let n = 0;
	for (const node of nodes) {
		n += 1;
		if (node.children && node.children.length) {
			n += count_psd_nodes(node.children);
		} else if (node.children) {
			// empty group still counts as the group node only (already +1)
		}
	}
	return n;
}

export function is_psd_group(node) {
	return !!(node && Object.prototype.hasOwnProperty.call(node, 'children'));
}

/**
 * Next order value above current max (or above a reference).
 */
export function next_order(layers) {
	const list = layers || config.layers || [];
	let max = 0;
	for (const l of list) {
		if (l.order != null && l.order > max) max = l.order;
	}
	return max + 1;
}

/**
 * Order for a newly inserted layer: directly above the active layer
 * (Photoshop paste / New Layer behavior). Higher order = higher in stack.
 * - Active group (inserting inside it): above the current topmost child,
 *   or just above the group header if empty.
 * - Otherwise: active.order + 1
 * - Fallback: next_order()
 */
export function resolve_insert_order(active_layer, parent_id, layers) {
	const list = layers || config.layers || [];
	const pid = parseInt(parent_id, 10) || 0;

	if (active_layer && is_group(active_layer) && active_layer.id === pid) {
		const kids = get_children(pid, list);
		if (kids.length) {
			return (kids[kids.length - 1].order || 0) + 1;
		}
		return (active_layer.order || 0) + 1;
	}

	if (active_layer && active_layer.order != null) {
		return (active_layer.order || 0) + 1;
	}

	return next_order(list);
}


/**
 * Resolve parent for a newly inserted layer:
 * - If active layer is a group → insert inside it.
 * - Else → same parent as active layer.
 */
export function resolve_insert_parent_id(active_layer) {
	if (!active_layer) return 0;
	if (is_group(active_layer)) return active_layer.id;
	return get_parent_id(active_layer);
}

export default {
	is_group,
	get_parent_id,
	get_children,
	get_children_desc,
	get_descendant_ids,
	get_ancestors,
	get_depth,
	is_effectively_visible,
	would_cycle,
	get_tree_rows,
	count_psd_nodes,
	is_psd_group,
	next_order,
	resolve_insert_order,
	resolve_insert_parent_id,
};
