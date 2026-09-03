/**
 * Brush Library flyout — Procreate / Photoshop / Krita inspired picker
 * with category tabs and stroke preview thumbnails.
 */

import config from './../../config.js';
import BrushLibrary from './../../libs/brushes/library.js';

var instance = null;

class GUI_brush_library_class {
	constructor() {
		if (instance) return instance;
		instance = this;
		this.el = null;
		this.open = false;
		this.activeCategory = 'All';
		this._outsideHandler = null;
		this._keyHandler = null;
	}

	ensure_dom() {
		if (this.el) return this.el;
		var el = document.createElement('div');
		el.id = 'brush_library_panel';
		el.className = 'brush_library_panel';
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', 'Brush Library');
		el.innerHTML = ''
			+ '<div class="brush_library_header">'
			+   '<span class="brush_library_title">Brushes</span>'
			+   '<button type="button" class="brush_library_close" title="Close" aria-label="Close">&times;</button>'
			+ '</div>'
			+ '<div class="brush_library_cats" role="tablist"></div>'
			+ '<div class="brush_library_grid" role="listbox" aria-label="Brush presets"></div>';
		document.body.appendChild(el);
		this.el = el;

		var self = this;
		el.querySelector('.brush_library_close').addEventListener('click', function () {
			self.hide();
		});
		return el;
	}

	current_brush_id() {
		var tool = config.TOOLS && config.TOOLS.find
			? config.TOOLS.find(function (t) { return t.name === 'brush'; })
			: null;
		if (!tool && config.TOOL && config.TOOL.name === 'brush') tool = config.TOOL;
		var attrs = (tool && tool.attributes) || (config.TOOL && config.TOOL.attributes) || {};
		var preset = attrs.preset;
		if (preset && typeof preset === 'object') preset = preset.value;
		return BrushLibrary.normalizeId(preset || 'classic-round');
	}

	render_categories() {
		var catsEl = this.el.querySelector('.brush_library_cats');
		catsEl.innerHTML = '';
		var cats = ['All'].concat(BrushLibrary.getCategories());
		var self = this;
		cats.forEach(function (cat) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'brush_library_cat' + (cat === self.activeCategory ? ' active' : '');
			btn.setAttribute('role', 'tab');
			btn.setAttribute('aria-selected', cat === self.activeCategory ? 'true' : 'false');
			btn.textContent = cat;
			btn.addEventListener('click', function () {
				self.activeCategory = cat;
				self.render_categories();
				self.render_grid();
			});
			catsEl.appendChild(btn);
		});
	}

	render_grid() {
		var grid = this.el.querySelector('.brush_library_grid');
		grid.innerHTML = '';
		var brushes = BrushLibrary.getBrushes(
			this.activeCategory === 'All' ? null : this.activeCategory
		);
		var selected = this.current_brush_id();
		var self = this;

		brushes.forEach(function (brush) {
			var item = document.createElement('button');
			item.type = 'button';
			item.className = 'brush_library_item' + (brush.id === selected ? ' selected' : '');
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', brush.id === selected ? 'true' : 'false');
			item.dataset.brushId = brush.id;
			item.title = brush.name + ' (' + brush.category + ')';

			var preview = document.createElement('img');
			preview.className = 'brush_library_preview';
			preview.alt = '';
			preview.src = brush.preview;
			preview.loading = 'lazy';

			var meta = document.createElement('div');
			meta.className = 'brush_library_meta';
			var name = document.createElement('div');
			name.className = 'brush_library_name';
			name.textContent = brush.name;
			var eng = document.createElement('div');
			eng.className = 'brush_library_engine';
			eng.textContent = brush.engine === 'hokusai' ? 'Hokusai' : 'Classic';
			meta.appendChild(name);
			meta.appendChild(eng);

			item.appendChild(preview);
			item.appendChild(meta);
			item.addEventListener('click', function () {
				self.select_brush(brush.id);
			});
			grid.appendChild(item);
		});
	}

	select_brush(brushId) {
		var brush = BrushLibrary.getBrush(brushId);
		if (!brush) return;

		// Prefer the live TOOL object (same reference as attributes UI).
		var attrs = null;
		if (config.TOOL && config.TOOL.name === 'brush' && config.TOOL.attributes) {
			attrs = config.TOOL.attributes;
		} else if (config.TOOLS) {
			for (var i = 0; i < config.TOOLS.length; i++) {
				if (config.TOOLS[i].name === 'brush') {
					attrs = config.TOOLS[i].attributes;
					break;
				}
			}
		}
		if (!attrs) return;

		BrushLibrary.applyToToolAttributes(brush.id, attrs);
		this.hide();
		try {
			if (window.GUI_tools && typeof window.GUI_tools.show_action_attributes === 'function') {
				window.GUI_tools.show_action_attributes();
			}
		} catch (err) { /* ignore */ }
	}

	update_trigger_label() {
		var trigger = document.getElementById('brush_library_trigger');
		if (!trigger) return;
		var brush = BrushLibrary.getBrush(this.current_brush_id());
		var label = trigger.querySelector('.brush_library_trigger_label');
		if (label) label.textContent = brush ? brush.name : 'Brushes';
		var thumb = trigger.querySelector('.brush_library_trigger_thumb');
		if (thumb && brush && brush.preview) {
			thumb.src = brush.preview;
			thumb.style.display = '';
		}
	}

	show(anchorEl) {
		this.ensure_dom();
		this.render_categories();
		this.render_grid();
		this.el.classList.add('open');
		this.open = true;

		// Position under the trigger button
		if (anchorEl && anchorEl.getBoundingClientRect) {
			var rect = anchorEl.getBoundingClientRect();
			var top = rect.bottom + 6;
			var left = Math.max(8, Math.min(rect.left, window.innerWidth - 360));
			this.el.style.top = top + 'px';
			this.el.style.left = left + 'px';
		}

		var self = this;
		this._outsideHandler = function (ev) {
			if (!self.el.contains(ev.target) && ev.target !== anchorEl
				&& !(anchorEl && anchorEl.contains && anchorEl.contains(ev.target))) {
				self.hide();
			}
		};
		this._keyHandler = function (ev) {
			if (ev.key === 'Escape') self.hide();
		};
		setTimeout(function () {
			document.addEventListener('mousedown', self._outsideHandler, true);
			document.addEventListener('keydown', self._keyHandler, true);
		}, 0);
	}

	hide() {
		if (!this.el) return;
		this.el.classList.remove('open');
		this.open = false;
		if (this._outsideHandler) {
			document.removeEventListener('mousedown', this._outsideHandler, true);
			this._outsideHandler = null;
		}
		if (this._keyHandler) {
			document.removeEventListener('keydown', this._keyHandler, true);
			this._keyHandler = null;
		}
	}

	toggle(anchorEl) {
		if (this.open) this.hide();
		else this.show(anchorEl);
	}

	/**
	 * Build the options-bar "Brushes" control (replaces the old preset <select>).
	 */
	render_trigger(container) {
		var self = this;
		var wrap = document.createElement('div');
		wrap.className = 'item brush_library_trigger_wrap';

		var btn = document.createElement('button');
		btn.type = 'button';
		btn.id = 'brush_library_trigger';
		btn.className = 'brush_library_trigger ui_button';
		btn.title = 'Brush Library';

		var thumb = document.createElement('img');
		thumb.className = 'brush_library_trigger_thumb';
		thumb.alt = '';
		var label = document.createElement('span');
		label.className = 'brush_library_trigger_label';
		label.textContent = 'Brushes';
		var chev = document.createElement('span');
		chev.className = 'brush_library_trigger_chev';
		chev.textContent = '▾';

		btn.appendChild(thumb);
		btn.appendChild(label);
		btn.appendChild(chev);
		btn.addEventListener('click', function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			self.toggle(btn);
		});

		wrap.appendChild(btn);
		container.appendChild(wrap);
		this.update_trigger_label();
		return wrap;
	}
}

export default GUI_brush_library_class;
