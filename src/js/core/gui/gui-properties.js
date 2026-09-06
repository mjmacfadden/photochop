import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';

/**
 * GUI class responsible for the Properties panel (adjustment params).
 * Sits as a tab alongside Adjustments. Shows sliders for the selected
 * adjustment layer; empty placeholder otherwise.
 */
class GUI_properties_class {

	constructor(GUI) {
		this.GUI = GUI;
		this.Helper = new Helper_class();
		this.Base_layers = new Base_layers_class();
		this.Tools_translate = new Tools_translate_class();
		this.bound_layer_id = null;
		this.params_at_interaction_start = null;
		this._events_bound = false;
	}

	render_main_properties() {
		this.render_properties(true);
	}

	get_adjustment_module() {
		if (this.GUI && this.GUI.modules && this.GUI.modules['layer/adjustment']) {
			return this.GUI.modules['layer/adjustment'];
		}
		return null;
	}

	render_properties(bind_events = false) {
		const target = document.getElementById('toggle_properties');
		if (!target) return;

		const layer = config.layer;
		if (!layer || layer.type !== 'adjustment') {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment</div>';
			this.bound_layer_id = null;
			this.params_at_interaction_start = null;
			if (config.LANG != 'en') {
				this.Tools_translate.translate(config.LANG, target);
			}
			return;
		}

		const adj = this.get_adjustment_module();
		if (!adj) {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment</div>';
			return;
		}

		const normType = adj.normalize_type(layer.adjustment_type);
		const conf = adj.get_config(normType);
		const params = layer.params || { ...conf.default_params };

		// Avoid wiping focused inputs if we're re-rendering the same layer
		// while the user is mid-edit (e.g. render loop). Rebuild when layer
		// or type changes, or when forced via bind_events.
		const sameLayer = this.bound_layer_id === layer.id
			&& target.querySelector('.properties_controls')
			&& target.dataset.adjType === normType;

		if (sameLayer && !bind_events) {
			this.sync_control_values(target, conf, params);
			return;
		}

		let html = '<div class="properties_controls">';
		html += `<div class="properties_title trn">${this.Helper.escapeHtml
			? this.Helper.escapeHtml(conf.title)
			: conf.title}</div>`;

		for (const p of conf.params) {
			const val = (params[p.name] !== undefined) ? params[p.name] : p.value;
			const min = (p.range && p.range[0] !== undefined) ? p.range[0] : 0;
			const max = (p.range && p.range[1] !== undefined) ? p.range[1] : 100;
			const step = (p.step !== undefined) ? p.step : 1;
			const display = this.format_value(val, step);
			html += `
				<div class="properties_row" data-param="${p.name}">
					<label class="trn properties_label" for="prop_${p.name}">${p.title}</label>
					<input type="range" class="properties_range" id="prop_range_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${val}" />
					<input type="number" class="properties_number" id="prop_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${display}" />
				</div>`;
		}
		html += '</div>';

		target.innerHTML = html;
		target.dataset.adjType = normType;
		this.bound_layer_id = layer.id;
		this.params_at_interaction_start = null;

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}

		this.bind_control_events(target, layer.id);
	}

	format_value(val, step) {
		const n = Number(val);
		if (isNaN(n)) return val;
		if (step != null && step < 1) {
			const decimals = String(step).includes('.')
				? String(step).split('.')[1].length
				: 2;
			return parseFloat(n.toFixed(decimals));
		}
		return Math.round(n);
	}

	sync_control_values(target, conf, params) {
		for (const p of conf.params) {
			const val = (params[p.name] !== undefined) ? params[p.name] : p.value;
			const range = target.querySelector(`#prop_range_${p.name}`);
			const number = target.querySelector(`#prop_${p.name}`);
			if (document.activeElement === range || document.activeElement === number) {
				continue;
			}
			const display = this.format_value(val, p.step);
			if (range && String(range.value) !== String(val)) range.value = val;
			if (number && String(number.value) !== String(display)) number.value = display;
		}
	}

	bind_control_events(target, layer_id) {
		const ranges = target.querySelectorAll('.properties_range');
		const numbers = target.querySelectorAll('.properties_number');

		ranges.forEach((range) => {
			range.addEventListener('mousedown', () => {
				this.snapshot_params(layer_id);
			});
			range.addEventListener('touchstart', () => {
				this.snapshot_params(layer_id);
			}, { passive: true });
			range.addEventListener('input', () => {
				const name = range.name;
				const val = this.parse_input_value(range);
				const number = target.querySelector(`#prop_${name}`);
				if (number) number.value = this.format_value(val, parseFloat(range.step) || 1);
				this.apply_live(layer_id, name, val);
			});
			range.addEventListener('change', () => {
				const name = range.name;
				const val = this.parse_input_value(range);
				this.commit_params(layer_id);
			});
		});

		numbers.forEach((number) => {
			number.addEventListener('focus', () => {
				this.snapshot_params(layer_id);
			});
			number.addEventListener('input', () => {
				const name = number.name;
				const val = this.parse_input_value(number);
				if (val === null) return;
				const range = target.querySelector(`#prop_range_${name}`);
				if (range) range.value = val;
				this.apply_live(layer_id, name, val);
			});
			number.addEventListener('change', () => {
				const name = number.name;
				let val = this.parse_input_value(number);
				if (val === null) {
					const layer = this.Base_layers.get_layer(layer_id);
					val = layer && layer.params ? layer.params[name] : 0;
				}
				const min = parseFloat(number.min);
				const max = parseFloat(number.max);
				if (!isNaN(min)) val = Math.max(min, val);
				if (!isNaN(max)) val = Math.min(max, val);
				number.value = this.format_value(val, parseFloat(number.step) || 1);
				const range = target.querySelector(`#prop_range_${name}`);
				if (range) range.value = val;
				this.apply_live(layer_id, name, val);
				this.commit_params(layer_id);
			});
		});
	}

	parse_input_value(el) {
		const raw = el.value;
		if (raw === '' || raw === '-' || raw === '.') return null;
		const n = parseFloat(raw);
		return isNaN(n) ? null : n;
	}

	snapshot_params(layer_id) {
		const layer = this.Base_layers.get_layer(layer_id);
		if (!layer) return;
		this.params_at_interaction_start = JSON.parse(JSON.stringify(layer.params || {}));
	}

	apply_live(layer_id, name, val) {
		const layer = this.Base_layers.get_layer(layer_id);
		if (!layer || layer.type !== 'adjustment') return;
		if (!layer.params) layer.params = {};
		layer.params[name] = val;
		this.Base_layers.invalidate({ document: true });
		this.Base_layers.render(true);
	}

	commit_params(layer_id) {
		const layer = this.Base_layers.get_layer(layer_id);
		if (!layer || layer.type !== 'adjustment') return;

		const next = JSON.parse(JSON.stringify(layer.params || {}));
		const prev = this.params_at_interaction_start;

		if (prev && JSON.stringify(prev) === JSON.stringify(next)) {
			this.params_at_interaction_start = null;
			return;
		}

		// Restore pre-drag params so Update_layer_action records correct undo
		if (prev) {
			layer.params = JSON.parse(JSON.stringify(prev));
		}
		this.params_at_interaction_start = null;

		app.State.do_action(
			new app.Actions.Update_layer_action(layer.id, {
				params: next
			})
		);
	}

	/**
	 * Focus Properties tab and refresh controls for the given (or current) layer.
	 */
	show_for_layer(layer_id) {
		if (layer_id != null && (!config.layer || config.layer.id !== layer_id)) {
			this.Base_layers.select(layer_id);
		}
		if (this.GUI && typeof this.GUI.activate_adjustments_tab === 'function') {
			this.GUI.activate_adjustments_tab('properties');
		}
		this.bound_layer_id = null; // force rebuild
		this.render_properties(true);
	}
}

export default GUI_properties_class;
