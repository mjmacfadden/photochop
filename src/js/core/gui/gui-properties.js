import app from './../../app.js';
import config from './../../config.js';
import Base_layers_class from './../base-layers.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';

/**
 * GUI class responsible for the Properties panel.
 * Tab alongside Adjustments. Shows:
 *  - adjustment params for the selected adjustment layer
 *  - Type tool options-bar features for a selected text layer
 * Empty placeholder otherwise.
 *
 * Visibility: selecting a text layer does NOT auto-open this tab.
 * Type controls appear when Properties is already displaying / user opens it
 * with a text layer selected. Adjustments still auto-show via show_for_layer().
 */
class GUI_properties_class {

	constructor(GUI) {
		this.GUI = GUI;
		this.Helper = new Helper_class();
		this.Base_layers = new Base_layers_class();
		this.Tools_translate = new Tools_translate_class();
		this.bound_layer_id = null;
		this.bound_kind = null; // 'adjustment' | 'text' | null
		this.params_at_interaction_start = null;
		this._events_bound = false;
		this._applying_text = false;
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

	get_text_tool_config() {
		return (config.TOOLS || []).find((t) => t && t.name === 'text') || null;
	}

	get_text_tool_attributes() {
		const cfg = this.get_text_tool_config();
		return cfg && cfg.attributes ? cfg.attributes : null;
	}

	get_text_module() {
		if (this.GUI && this.GUI.GUI_tools && this.GUI.GUI_tools.tools_modules
			&& this.GUI.GUI_tools.tools_modules['text']) {
			return this.GUI.GUI_tools.tools_modules['text'].object;
		}
		return null;
	}

	esc(text) {
		if (this.Helper && typeof this.Helper.escapeHtml === 'function') {
			return this.Helper.escapeHtml(String(text == null ? '' : text));
		}
		return String(text == null ? '' : text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	attr_value(item) {
		if (item == null) return '';
		if (typeof item === 'object' && item !== null && 'value' in item) {
			return item.value;
		}
		return item;
	}

	set_attr_value(attrs, key, value) {
		if (!attrs || !(key in attrs)) return;
		if (typeof attrs[key] === 'object' && attrs[key] !== null && 'value' in attrs[key]) {
			attrs[key].value = value;
		} else {
			attrs[key] = value;
		}
	}

	is_point_text(layer) {
		if (!layer || !layer.params) return true;
		const b = layer.params.boundary;
		const s = String(b == null ? 'dynamic' : b).toLowerCase();
		return !(s === 'box' || s === 'paragraph');
	}

	render_properties(bind_events = false) {
		const target = document.getElementById('toggle_properties');
		if (!target) return;

		const layer = config.layer;
		if (layer && layer.type === 'adjustment') {
			this.render_adjustment_properties(target, layer, bind_events);
			return;
		}
		if (layer && layer.type === 'text') {
			this.render_text_properties(target, layer, bind_events);
			return;
		}

		target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment or text layer</div>';
		this.bound_layer_id = null;
		this.bound_kind = null;
		this.params_at_interaction_start = null;
		delete target.dataset.adjType;
		delete target.dataset.textSig;
		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}
	}

	// ─── Adjustment controls (unchanged behavior) ───────────────────────────

	render_adjustment_properties(target, layer, bind_events = false) {
		const adj = this.get_adjustment_module();
		if (!adj) {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment or text layer</div>';
			return;
		}

		const normType = adj.normalize_type(layer.adjustment_type);
		const conf = adj.get_config(normType);
		const params = layer.params || { ...conf.default_params };

		const sameLayer = this.bound_layer_id === layer.id
			&& this.bound_kind === 'adjustment'
			&& target.querySelector('.properties_controls')
			&& target.dataset.adjType === normType;

		if (sameLayer && !bind_events) {
			this.sync_control_values(target, conf, params);
			return;
		}

		let html = '<div class="properties_controls">';
		html += `<div class="properties_title trn">${this.esc(conf.title)}</div>`;

		for (const p of conf.params) {
			const val = (params[p.name] !== undefined) ? params[p.name] : p.value;
			const min = (p.range && p.range[0] !== undefined) ? p.range[0] : 0;
			const max = (p.range && p.range[1] !== undefined) ? p.range[1] : 100;
			const step = (p.step !== undefined) ? p.step : 1;
			const display = this.format_value(val, step);
			const defVal = (conf.default_params && conf.default_params[p.name] !== undefined)
				? conf.default_params[p.name]
				: p.value;
			html += `
				<div class="properties_row" data-param="${p.name}">
					<label class="trn properties_label" for="prop_${p.name}">${p.title}</label>
					<input type="range" class="properties_range" id="prop_range_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${val}"
						data-default="${defVal}" title="Double-click to reset" />
					<input type="number" class="properties_number" id="prop_${p.name}"
						name="${p.name}" min="${min}" max="${max}" step="${step}" value="${display}"
						data-default="${defVal}" title="Double-click to reset" />
				</div>`;
		}
		html += '</div>';

		target.innerHTML = html;
		target.dataset.adjType = normType;
		delete target.dataset.textSig;
		this.bound_layer_id = layer.id;
		this.bound_kind = 'adjustment';
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

		const reset_to_default = (el) => {
			const defRaw = el.getAttribute('data-default');
			if (defRaw === null || defRaw === '') return;
			const defVal = parseFloat(defRaw);
			if (isNaN(defVal)) return;
			const name = el.name;
			this.snapshot_params(layer_id);
			const range = target.querySelector(`#prop_range_${name}`);
			const number = target.querySelector(`#prop_${name}`);
			const step = parseFloat((range && range.step) || (number && number.step) || 1) || 1;
			if (range) range.value = defVal;
			if (number) number.value = this.format_value(defVal, step);
			this.apply_live(layer_id, name, defVal);
			this.commit_params(layer_id);
		};

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
				this.commit_params(layer_id);
			});
			range.addEventListener('dblclick', (e) => {
				e.preventDefault();
				reset_to_default(range);
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
			number.addEventListener('dblclick', (e) => {
				e.preventDefault();
				reset_to_default(number);
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
	 * Also unhides the Adjustments sidebar block / wrapper if collapsed.
	 * Used for adjustment create + edit/select only — NOT for text / Type tool.
	 */
	show_for_layer(layer_id) {
		if (layer_id != null && (!config.layer || config.layer.id !== layer_id)) {
			this.Base_layers.select(layer_id);
		}
		if (this.GUI && typeof this.GUI.activate_adjustments_tab === 'function') {
			this.GUI.activate_adjustments_tab('properties');
		}
		this.bound_layer_id = null;
		this.render_properties(true);
	}

	// ─── Text / Type tool controls ──────────────────────────────────────────

	text_signature(attrs, layer) {
		if (!attrs) return '';
		const keys = ['font', 'size', 'weight', 'bold', 'italic', 'underline', 'strikethrough', 'fill', 'halign', 'kerning', 'leading', 'boundary'];
		const parts = keys.map((k) => String(this.attr_value(attrs[k])));
		parts.push(this.is_point_text(layer) ? 'point' : 'box');
		return parts.join('|');
	}

	render_text_properties(target, layer, bind_events = false) {
		const attrs = this.get_text_tool_attributes();
		if (!attrs) {
			target.innerHTML = '<div class="properties_placeholder trn">Select an adjustment or text layer</div>';
			return;
		}

		// Keep TOOLS attrs aligned with layer Mode/align/size before painting UI
		const textMod = this.get_text_module();
		if (textMod && typeof textMod.sync_text_tool_attributes_from_layer === 'function') {
			try { textMod.sync_text_tool_attributes_from_layer(layer); } catch (e) { /* ignore */ }
		}

		const sig = this.text_signature(attrs, layer);
		const sameLayer = this.bound_layer_id === layer.id
			&& this.bound_kind === 'text'
			&& target.querySelector('.properties_text_controls')
			&& target.dataset.textSig === sig;

		if (sameLayer && !bind_events) {
			this.sync_text_control_values(target, attrs, layer);
			return;
		}

		// Rebuild when font/weight list changes (sig includes weight label; font change
		// also changes available weight options via values()).
		const fontVal = this.attr_value(attrs.font) || 'Roboto';
		const sizeVal = this.attr_value(attrs.size);
		const weightVal = this.attr_value(attrs.weight) || 'Regular (400)';
		const fillVal = this.attr_value(attrs.fill) || '#008000';
		const kerningVal = this.attr_value(attrs.kerning);
		const leadingVal = this.attr_value(attrs.leading);
		const halignVal = String(this.attr_value(attrs.halign) || 'Left');
		const modeVal = String(this.attr_value(attrs.boundary) || (this.is_point_text(layer) ? 'Point' : 'Paragraph'));
		const isPoint = this.is_point_text(layer);

		const fontOptions = (attrs.font && typeof attrs.font.values === 'function')
			? attrs.font.values()
			: (attrs.font && attrs.font.values) || ['Roboto'];
		const weightOptions = (attrs.weight && typeof attrs.weight.values === 'function')
			? attrs.weight.values()
			: (attrs.weight && attrs.weight.values) || ['Regular (400)', 'Bold (700)'];

		const sizeMin = (attrs.size && attrs.size.min != null) ? attrs.size.min : 1;
		const sizeMax = (attrs.size && attrs.size.max != null) ? attrs.size.max : 999;
		const sizeStep = (attrs.size && attrs.size.inputStep != null) ? attrs.size.inputStep
			: ((attrs.size && attrs.size.step != null) ? attrs.size.step : 1);
		const kernMin = (attrs.kerning && attrs.kerning.min != null) ? attrs.kerning.min : -999;
		const kernMax = (attrs.kerning && attrs.kerning.max != null) ? attrs.kerning.max : 999;
		const leadMin = (attrs.leading && attrs.leading.min != null) ? attrs.leading.min : -999;
		const leadMax = (attrs.leading && attrs.leading.max != null) ? attrs.leading.max : 999;

		const boolPressed = (key) => {
			const v = this.attr_value(attrs[key]);
			return v === true || v === 'true';
		};

		const alignIcons = {
			Left: 'align-left.svg',
			Center: 'align-center.svg',
			Right: 'align-right.svg',
			Justify: 'align-justify.svg',
		};
		const styleIcons = {
			bold: 'bold.svg',
			italic: 'italic.svg',
			underline: 'underline.svg',
			strikethrough: 'strikethrough.svg',
		};

		let html = '<div class="properties_controls properties_text_controls">';
		html += '<div class="properties_title trn">Type</div>';

		// Font
		html += `<div class="properties_row" data-prop="font">
			<label class="trn properties_label" for="prop_text_font">Font</label>
			<select class="properties_select" id="prop_text_font" data-text-key="font">`;
		for (const f of fontOptions) {
			const sel = String(f) === String(fontVal) ? ' selected' : '';
			html += `<option value="${this.esc(f)}"${sel}>${this.esc(f)}</option>`;
		}
		html += `</select></div>`;

		// Size
		html += `<div class="properties_row" data-prop="size">
			<label class="trn properties_label" for="prop_text_size">Size</label>
			<input type="number" class="properties_number" id="prop_text_size" data-text-key="size"
				min="${sizeMin}" max="${sizeMax}" step="${sizeStep}"
				value="${sizeVal != null && sizeVal !== '' && !Number.isNaN(Number(sizeVal)) ? sizeVal : ''}" />
		</div>`;

		// Weight
		html += `<div class="properties_row" data-prop="weight">
			<label class="trn properties_label" for="prop_text_weight">Weight</label>
			<select class="properties_select" id="prop_text_weight" data-text-key="weight">`;
		for (const w of weightOptions) {
			const sel = String(w) === String(weightVal) ? ' selected' : '';
			html += `<option value="${this.esc(w)}"${sel}>${this.esc(w)}</option>`;
		}
		html += `</select></div>`;

		// Style toggles
		html += `<div class="properties_row" data-prop="style">
			<label class="trn properties_label">Style</label>
			<div class="properties_toggle_row ui_button_group no_wrap">`;
		for (const key of ['bold', 'italic', 'underline', 'strikethrough']) {
			const pressed = boolPressed(key);
			const icon = styleIcons[key];
			const title = key[0].toUpperCase() + key.slice(1);
			html += `<button type="button" class="trn ui_icon_button input_height properties_toggle"
				id="prop_text_${key}" data-text-key="${key}" title="${title}"
				aria-pressed="${pressed ? 'true' : 'false'}">
				<img style="width:16px;height:16px;" alt="${title}" src="images/icons/${icon}" />
			</button>`;
		}
		html += `</div></div>`;

		// Fill
		html += `<div class="properties_row" data-prop="fill">
			<label class="trn properties_label" for="prop_text_fill">Fill</label>
			<input type="color" class="properties_color" id="prop_text_fill" data-text-key="fill"
				value="${this.esc(fillVal)}" />
		</div>`;

		// Align
		html += `<div class="properties_row" data-prop="halign">
			<label class="trn properties_label">Align</label>
			<div class="properties_align_group ui_button_group no_wrap" id="prop_text_halign_group">`;
		for (const align of ['Left', 'Center', 'Right', 'Justify']) {
			const isSelected = halignVal.toLowerCase() === align.toLowerCase();
			const disabled = (align === 'Justify' && isPoint);
			html += `<button type="button" class="trn ui_icon_button input_height properties_align_btn"
				id="prop_text_halign_${align.toLowerCase()}" data-text-key="halign" data-align="${align}"
				title="${align} Align" aria-pressed="${isSelected ? 'true' : 'false'}"
				${disabled ? 'disabled aria-disabled="true" style="opacity:0.35;pointer-events:none"' : ''}>
				<img style="width:16px;height:16px;" alt="${align}" src="images/icons/${alignIcons[align]}" />
			</button>`;
		}
		html += `</div></div>`;

		// Kerning
		html += `<div class="properties_row" data-prop="kerning">
			<label class="trn properties_label" for="prop_text_kerning">Kerning</label>
			<input type="number" class="properties_number" id="prop_text_kerning" data-text-key="kerning"
				min="${kernMin}" max="${kernMax}" step="1"
				value="${kerningVal != null && kerningVal !== '' && !Number.isNaN(Number(kerningVal)) ? kerningVal : 0}" />
		</div>`;

		// Leading
		html += `<div class="properties_row" data-prop="leading">
			<label class="trn properties_label" for="prop_text_leading">Leading</label>
			<input type="number" class="properties_number" id="prop_text_leading" data-text-key="leading"
				min="${leadMin}" max="${leadMax}" step="1"
				value="${leadingVal != null && leadingVal !== '' && !Number.isNaN(Number(leadingVal)) ? leadingVal : 0}" />
		</div>`;

		// Mode
		html += `<div class="properties_row" data-prop="boundary">
			<label class="trn properties_label" for="prop_text_boundary">Mode</label>
			<select class="properties_select" id="prop_text_boundary" data-text-key="boundary">
				<option value="Point"${modeVal === 'Point' ? ' selected' : ''}>Point</option>
				<option value="Paragraph"${modeVal === 'Paragraph' ? ' selected' : ''}>Paragraph</option>
			</select>
		</div>`;

		html += '</div>';

		target.innerHTML = html;
		delete target.dataset.adjType;
		target.dataset.textSig = sig;
		this.bound_layer_id = layer.id;
		this.bound_kind = 'text';
		this.params_at_interaction_start = null;

		if (config.LANG != 'en') {
			this.Tools_translate.translate(config.LANG, target);
		}

		this.bind_text_control_events(target, layer.id);
	}

	sync_text_control_values(target, attrs, layer) {
		if (!attrs || !target) return;
		const active = document.activeElement;

		const setSelect = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			if (String(el.value) !== String(value)) el.value = value;
		};
		const setNumber = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			const display = (value == null || value === '' || Number.isNaN(Number(value))) ? '' : value;
			if (String(el.value) !== String(display)) el.value = display;
		};
		const setColor = (id, value) => {
			const el = target.querySelector('#' + id);
			if (!el || active === el) return;
			if (value && String(el.value).toLowerCase() !== String(value).toLowerCase()) {
				el.value = value;
			}
		};
		const setToggle = (id, pressed) => {
			const el = target.querySelector('#' + id);
			if (!el) return;
			el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
		};

		setSelect('prop_text_font', this.attr_value(attrs.font) || '');
		setNumber('prop_text_size', this.attr_value(attrs.size));
		// Weight options may change with font — rebuild option list if needed
		const weightEl = target.querySelector('#prop_text_weight');
		if (weightEl && active !== weightEl) {
			const weightOptions = (attrs.weight && typeof attrs.weight.values === 'function')
				? attrs.weight.values()
				: (attrs.weight && attrs.weight.values) || [];
			const want = String(this.attr_value(attrs.weight) || '');
			const currentOpts = Array.from(weightEl.options).map((o) => o.value);
			if (weightOptions.length && (currentOpts.length !== weightOptions.length
				|| weightOptions.some((w, i) => String(w) !== currentOpts[i]))) {
				weightEl.innerHTML = weightOptions.map((w) =>
					`<option value="${this.esc(w)}"${String(w) === want ? ' selected' : ''}>${this.esc(w)}</option>`
				).join('');
			} else if (String(weightEl.value) !== want) {
				weightEl.value = want;
			}
		}
		setToggle('prop_text_bold', this.attr_value(attrs.bold) === true);
		setToggle('prop_text_italic', this.attr_value(attrs.italic) === true);
		setToggle('prop_text_underline', this.attr_value(attrs.underline) === true);
		setToggle('prop_text_strikethrough', this.attr_value(attrs.strikethrough) === true);
		setColor('prop_text_fill', this.attr_value(attrs.fill) || '#000000');
		setNumber('prop_text_kerning', this.attr_value(attrs.kerning));
		setNumber('prop_text_leading', this.attr_value(attrs.leading));
		setSelect('prop_text_boundary', this.attr_value(attrs.boundary) || (this.is_point_text(layer) ? 'Point' : 'Paragraph'));

		const halignVal = String(this.attr_value(attrs.halign) || 'Left');
		const isPoint = this.is_point_text(layer);
		for (const align of ['Left', 'Center', 'Right', 'Justify']) {
			const btn = target.querySelector('#prop_text_halign_' + align.toLowerCase());
			if (!btn) continue;
			const selected = halignVal.toLowerCase() === align.toLowerCase();
			btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
			if (align === 'Justify') {
				if (isPoint) {
					btn.disabled = true;
					btn.setAttribute('aria-disabled', 'true');
					btn.style.opacity = '0.35';
					btn.style.pointerEvents = 'none';
					btn.title = 'Justify is only available for paragraph text';
				} else {
					btn.disabled = false;
					btn.removeAttribute('aria-disabled');
					btn.style.opacity = '';
					btn.style.pointerEvents = '';
					btn.title = 'Justify Align';
				}
			}
		}

		target.dataset.textSig = this.text_signature(attrs, layer);
	}

	bind_text_control_events(target, layer_id) {
		const selects = target.querySelectorAll('select[data-text-key]');
		selects.forEach((sel) => {
			sel.addEventListener('change', () => {
				const key = sel.getAttribute('data-text-key');
				this.apply_text_attr(key, sel.value, { rebuild: key === 'font' || key === 'boundary' || key === 'weight' });
			});
		});

		const numbers = target.querySelectorAll('input.properties_number[data-text-key]');
		numbers.forEach((input) => {
			input.addEventListener('change', () => {
				const key = input.getAttribute('data-text-key');
				let val = this.parse_input_value(input);
				if (val === null) return;
				const min = parseFloat(input.min);
				const max = parseFloat(input.max);
				if (!isNaN(min)) val = Math.max(min, val);
				if (!isNaN(max)) val = Math.min(max, val);
				input.value = val;
				this.apply_text_attr(key, val);
			});
			// Live-ish for size/kerning/leading while typing is committed on change;
			// also fire on input for smoother preview like the options bar number widgets.
			input.addEventListener('input', () => {
				const key = input.getAttribute('data-text-key');
				const val = this.parse_input_value(input);
				if (val === null) return;
				this.apply_text_attr(key, val, { skipBarRebuild: true });
			});
		});

		const color = target.querySelector('#prop_text_fill');
		if (color) {
			color.addEventListener('input', () => {
				this.apply_text_attr('fill', color.value, { skipBarRebuild: true });
			});
			color.addEventListener('change', () => {
				this.apply_text_attr('fill', color.value);
			});
		}

		const toggles = target.querySelectorAll('button.properties_toggle[data-text-key]');
		toggles.forEach((btn) => {
			btn.addEventListener('click', () => {
				const key = btn.getAttribute('data-text-key');
				const next = btn.getAttribute('aria-pressed') !== 'true';
				btn.setAttribute('aria-pressed', next ? 'true' : 'false');
				this.apply_text_attr(key, next, { rebuild: key === 'bold' });
			});
		});

		const alignBtns = target.querySelectorAll('button.properties_align_btn');
		alignBtns.forEach((btn) => {
			btn.addEventListener('click', () => {
				if (btn.disabled) return;
				const align = btn.getAttribute('data-align');
				alignBtns.forEach((b) => {
					b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
				});
				this.apply_text_attr('halign', align, { skipBarRebuild: true });
			});
		});
	}

	/**
	 * Push a Type attribute change through the same path as the options bar:
	 * update config.TOOLS text attrs → text.on_params_update → refresh options bar.
	 */
	apply_text_attr(key, value, options = {}) {
		const attrs = this.get_text_tool_attributes();
		if (!attrs || !(key in attrs)) return;

		this._applying_text = true;
		try {
			this.set_attr_value(attrs, key, value);

			// Font change: keep weight list / selection valid even when Type isn't active
			// (on_params_update weight sync uses action_data(), which is the active tool).
			if (key === 'font' && value && !String(value).includes('...')) {
				if (attrs.weight) {
					const variants = (typeof attrs.weight.values === 'function')
						? attrs.weight.values()
						: (attrs.weight.values || ['Regular (400)']);
					const current = attrs.weight.value;
					const matched = variants.find((v) => String(v) === String(current)
						|| String(v).toLowerCase() === String(current).toLowerCase()
						|| (String(v).match(/\((\d+)\)/) && String(current).match(/\((\d+)\)/)
							&& String(v).match(/\((\d+)\)/)[1] === String(current).match(/\((\d+)\)/)[1]));
					attrs.weight.value = matched || variants[0] || 'Regular (400)';
					if (attrs.bold) {
						const w = String(attrs.weight.value);
						const m = w.match(/\((\d+)\)/);
						const n = m ? parseInt(m[1], 10) : (/bold/i.test(w) ? 700 : 400);
						attrs.bold.value = n >= 700;
					}
				}
			}

			const textMod = this.get_text_module();
			if (textMod && typeof textMod.on_params_update === 'function') {
				const result = textMod.on_params_update({ key, value });
				if (result && result.new_values) {
					for (const k in result.new_values) {
						this.set_attr_value(attrs, k, result.new_values[k]);
					}
				}
			}

			// Two-way: keep Type options bar in sync when Type tool is active
			if (!options.skipBarRebuild
				&& config.TOOL && config.TOOL.name === 'text'
				&& this.GUI && this.GUI.GUI_tools
				&& typeof this.GUI.GUI_tools.show_action_attributes === 'function') {
				this.GUI.GUI_tools.show_action_attributes();
			} else if (key === 'halign' && textMod
				&& typeof textMod.update_halign_justify_availability === 'function') {
				try {
					textMod.update_halign_justify_availability(this.is_point_text(config.layer));
				} catch (e) { /* ignore */ }
			}

			if (options.rebuild) {
				this.bound_layer_id = null;
				this.render_properties(true);
			} else {
				const target = document.getElementById('toggle_properties');
				if (target && target.querySelector('.properties_text_controls') && config.layer) {
					this.sync_text_control_values(target, attrs, config.layer);
				}
			}
		} finally {
			this._applying_text = false;
		}
	}

	/**
	 * Called from the Type options bar after attributes remount / change so
	 * Properties stays two-way bound. No-op while Properties is driving the change,
	 * or when Properties isn't showing text controls / text isn't selected.
	 */
	on_text_attributes_changed() {
		if (this._applying_text) return;
		const layer = config.layer;
		if (!layer || layer.type !== 'text') return;
		const target = document.getElementById('toggle_properties');
		if (!target || !target.querySelector('.properties_text_controls')) return;
		const attrs = this.get_text_tool_attributes();
		if (!attrs) return;
		this.sync_text_control_values(target, attrs, layer);
	}
}

export default GUI_properties_class;
