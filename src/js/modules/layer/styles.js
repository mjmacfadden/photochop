import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';
import Effects_shadow_class from '../effects/common/shadow.js';
import Effects_outer_glow_class from '../effects/common/outer_glow.js';
import Effects_inner_glow_class from '../effects/common/inner_glow.js';
import Effects_stroke_class from '../effects/common/stroke.js';

class Layer_styles_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		this.Effects_shadow = new Effects_shadow_class();
		this.Effects_outer_glow = new Effects_outer_glow_class();
		this.Effects_inner_glow = new Effects_inner_glow_class();
		this.Effects_stroke = new Effects_stroke_class();

		this.activeTab = 'shadow';
		this.layer_id = null;
		this.styles = {};
	}

	open(initialEffect = 'shadow', filter_id = null) {
		if (config.layer == null || config.layer.type == null) {
			alertify.error('Layer is empty.');
			return;
		}

		this.layer_id = config.layer.id;
		this.activeTab = initialEffect || 'shadow';

		// Load or initialize each style configuration from current layer
		this.styles = {
			stroke: {
				name: 'Stroke',
				enabled: false,
				id: null,
				params: { size: 3, position: 'outside', opacity: 100, color: '#000000' }
			},
			inner_glow: {
				name: 'Inner Glow',
				enabled: false,
				id: null,
				params: { value: 10, opacity: 75, color: '#ffffff' }
			},
			outer_glow: {
				name: 'Outer Glow',
				enabled: false,
				id: null,
				params: { value: 10, opacity: 75, color: '#ffff00' }
			},
			shadow: {
				name: 'Drop Shadow',
				enabled: false,
				id: null,
				params: { x: 5, y: 5, value: 10, opacity: 25, color: '#000000' }
			}
		};

		if (config.layer.filters) {
			for (const f of config.layer.filters) {
				const filterName = f.name === 'drop-shadow' ? 'shadow' : f.name;
				if (this.styles[filterName]) {
					if (filter_id != null) {
						if (f.id == filter_id) {
							this.styles[filterName].enabled = !f.disabled;
							this.styles[filterName].id = f.id;
							this.styles[filterName].params = { ...this.styles[filterName].params, ...f.params };
						}
					} else {
						this.styles[filterName].enabled = !f.disabled;
						this.styles[filterName].id = f.id;
						this.styles[filterName].params = { ...this.styles[filterName].params, ...f.params };
					}
				}
			}
		}

		// Ensure the opened effect is enabled
		if (this.styles[this.activeTab]) {
			this.styles[this.activeTab].enabled = true;
		}

		this.show_dialog();
	}

	show_dialog() {
		const _this = this;
		const preview_padding = 20;

		const settings = {
			title: 'Layer Style',
			preview: true,
			preview_padding: preview_padding,
			className: 'layer_style_dialog wide',
			params: [
				{
					html: this.generate_dialog_html()
				}
			],
			on_load: function(params) {
				_this.bind_dialog_events();
				_this.update_preview();
			},
			on_change: function(params, canvas_preview, w, h) {
				_this.render_combined_preview(canvas_preview, preview_padding);
			},
			on_finish: function(params) {
				_this.save_styles();
			}
		};

		// Disable existing style filters while capturing clean preview base canvas
		this.Base_layers.disable_filter(['stroke', 'inner_glow', 'outer_glow', 'shadow', 'drop-shadow']);
		this.POP.show(settings);
		this.Base_layers.disable_filter(null);
	}

	generate_dialog_html() {
		return `
			<div class="layer_style_container">
				<div class="layer_style_sidebar">
					<div class="layer_style_list">
						${this.generate_sidebar_items()}
					</div>
				</div>
				<div class="layer_style_main">
					<div class="layer_style_controls" id="layer_style_controls">
						${this.generate_controls_html(this.activeTab)}
					</div>
				</div>
			</div>
		`;
	}

	generate_sidebar_items() {
		const items = [
			{ key: 'stroke', title: 'Stroke' },
			{ key: 'inner_glow', title: 'Inner Glow' },
			{ key: 'outer_glow', title: 'Outer Glow' },
			{ key: 'shadow', title: 'Drop Shadow' }
		];

		let html = '';
		for (const item of items) {
			const isChecked = this.styles[item.key].enabled ? 'checked' : '';
			const isActive = this.activeTab === item.key ? 'active' : '';
			html += `
				<div class="layer_style_item ${isActive}" data-effect="${item.key}">
					<input type="checkbox" class="ls_chk" data-effect="${item.key}" id="ls_chk_${item.key}" ${isChecked} />
					<span class="ls_title" data-effect="${item.key}">${item.title}</span>
				</div>
			`;
		}
		return html;
	}

	generate_controls_html(effectKey) {
		const style = this.styles[effectKey];
		if (!style) return '';

		let fields = '';
		if (effectKey === 'stroke') {
			const pos = style.params.position || 'outside';
			const size = style.params.size || 3;
			const opacity = style.params.opacity ?? 100;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_stroke_size" min="1" max="100" value="${size}" />
					<input type="number" class="ls_num" id="ls_num_stroke_size" min="1" max="100" value="${size}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Position:</span>
					<select id="ls_stroke_position">
						<option value="outside" ${pos === 'outside' ? 'selected' : ''}>Outside</option>
						<option value="inside" ${pos === 'inside' ? 'selected' : ''}>Inside</option>
						<option value="center" ${pos === 'center' ? 'selected' : ''}>Center</option>
					</select>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_stroke_opacity" min="0" max="100" value="${opacity}" />
					<input type="number" class="ls_num" id="ls_num_stroke_opacity" min="0" max="100" value="${opacity}" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_stroke_color" value="${style.params.color || '#000000'}" />
				</div>
			`;
		} else if (effectKey === 'inner_glow') {
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 75;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_inner_glow_value" min="0" max="100" value="${val}" />
					<input type="number" class="ls_num" id="ls_num_inner_glow_value" min="0" max="100" value="${val}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_inner_glow_opacity" min="0" max="100" value="${opacity}" />
					<input type="number" class="ls_num" id="ls_num_inner_glow_opacity" min="0" max="100" value="${opacity}" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_inner_glow_color" value="${style.params.color || '#ffffff'}" />
				</div>
			`;
		} else if (effectKey === 'outer_glow') {
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 75;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Size:</span>
					<input type="range" class="ls_range" id="ls_outer_glow_value" min="0" max="100" value="${val}" />
					<input type="number" class="ls_num" id="ls_num_outer_glow_value" min="0" max="100" value="${val}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_outer_glow_opacity" min="0" max="100" value="${opacity}" />
					<input type="number" class="ls_num" id="ls_num_outer_glow_opacity" min="0" max="100" value="${opacity}" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_outer_glow_color" value="${style.params.color || '#ffff00'}" />
				</div>
			`;
		} else if (effectKey === 'shadow') {
			const x = style.params.x ?? 5;
			const y = style.params.y ?? 5;
			const val = style.params.value ?? 10;
			const opacity = style.params.opacity ?? 25;
			fields = `
				<div class="ls_row">
					<span class="ls_label">Offset X:</span>
					<input type="range" class="ls_range" id="ls_shadow_x" min="-100" max="100" value="${x}" />
					<input type="number" class="ls_num" id="ls_num_shadow_x" min="-100" max="100" value="${x}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Offset Y:</span>
					<input type="range" class="ls_range" id="ls_shadow_y" min="-100" max="100" value="${y}" />
					<input type="number" class="ls_num" id="ls_num_shadow_y" min="-100" max="100" value="${y}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Radius:</span>
					<input type="range" class="ls_range" id="ls_shadow_value" min="0" max="100" value="${val}" />
					<input type="number" class="ls_num" id="ls_num_shadow_value" min="0" max="100" value="${val}" />
					<span class="ls_unit">px</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Opacity:</span>
					<input type="range" class="ls_range" id="ls_shadow_opacity" min="0" max="100" value="${opacity}" />
					<input type="number" class="ls_num" id="ls_num_shadow_opacity" min="0" max="100" value="${opacity}" />
					<span class="ls_unit">%</span>
				</div>
				<div class="ls_row">
					<span class="ls_label">Color:</span>
					<input type="color" id="ls_shadow_color" value="${style.params.color || '#000000'}" />
				</div>
			`;
		}

		return `
			<h3 class="ls_heading">${style.name}</h3>
			<div class="ls_fields">${fields}</div>
		`;
	}

	bind_dialog_events() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		// Sidebar item selection & checkbox toggling
		const sidebarItems = popup.querySelectorAll('.layer_style_item');
		sidebarItems.forEach(item => {
			const effectKey = item.dataset.effect;
			const checkbox = item.querySelector('.ls_chk');

			item.addEventListener('click', (e) => {
				if (e.target === checkbox) return;
				this.read_current_controls();
				this.activeTab = effectKey;
				if (!this.styles[effectKey].enabled) {
					this.styles[effectKey].enabled = true;
				}
				this.refresh_tabs();
				this.update_preview();
			});

			if (checkbox) {
				checkbox.addEventListener('change', (e) => {
					e.stopPropagation();
					this.read_current_controls();
					this.styles[effectKey].enabled = checkbox.checked;
					this.activeTab = effectKey;
					this.refresh_tabs();
					this.update_preview();
				});
			}
		});

		this.bind_control_inputs();
	}

	bind_control_inputs() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const controls = popup.querySelector('#layer_style_controls');
		if (!controls) return;

		// Link range inputs with number inputs bidirectionally
		const ranges = controls.querySelectorAll('input[type="range"]');
		ranges.forEach(range => {
			const key = range.id.replace('ls_', '');
			const numInput = controls.querySelector('#ls_num_' + key);
			range.addEventListener('input', () => {
				if (numInput) numInput.value = range.value;
				this.read_current_controls();
				this.update_preview();
			});
			range.addEventListener('change', () => {
				if (numInput) numInput.value = range.value;
				this.read_current_controls();
				this.update_preview();
			});
		});

		const numbers = controls.querySelectorAll('input[type="number"].ls_num');
		numbers.forEach(num => {
			const key = num.id.replace('ls_num_', '');
			const rangeInput = controls.querySelector('#ls_' + key);
			const syncFromNumber = () => {
				let val = parseFloat(num.value);
				if (isNaN(val)) return;
				if (rangeInput) {
					const min = parseFloat(rangeInput.min ?? 0);
					const max = parseFloat(rangeInput.max ?? 100);
					val = Math.max(min, Math.min(max, val));
					rangeInput.value = val;
				}
				this.read_current_controls();
				this.update_preview();
			};
			num.addEventListener('input', syncFromNumber);
			num.addEventListener('change', syncFromNumber);
		});

		const otherInputs = controls.querySelectorAll('input[type="color"], select');
		otherInputs.forEach(el => {
			el.addEventListener('input', () => {
				this.read_current_controls();
				this.update_preview();
			});
			el.addEventListener('change', () => {
				this.read_current_controls();
				this.update_preview();
			});
		});
	}

	refresh_tabs() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const items = popup.querySelectorAll('.layer_style_item');
		items.forEach(item => {
			const effectKey = item.dataset.effect;
			if (effectKey === this.activeTab) {
				item.classList.add('active');
			} else {
				item.classList.remove('active');
			}
			const checkbox = item.querySelector('.ls_chk');
			if (checkbox) {
				checkbox.checked = !!this.styles[effectKey].enabled;
			}
		});

		const controls = popup.querySelector('#layer_style_controls');
		if (controls) {
			controls.innerHTML = this.generate_controls_html(this.activeTab);
			this.bind_control_inputs();
		}
	}

	read_current_controls() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;

		const k = this.activeTab;
		const style = this.styles[k];
		if (!style) return;

		if (k === 'stroke') {
			const sizeEl = popup.querySelector('#ls_stroke_size');
			const numSizeEl = popup.querySelector('#ls_num_stroke_size');
			const posEl = popup.querySelector('#ls_stroke_position');
			const opacityEl = popup.querySelector('#ls_stroke_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_stroke_opacity');
			const colorEl = popup.querySelector('#ls_stroke_color');
			if (sizeEl || numSizeEl) {
				const size = parseInt((numSizeEl ? numSizeEl.value : sizeEl?.value) || 3);
				const position = posEl ? posEl.value : 'outside';
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 100);
				const color = colorEl?.value || '#000000';
				style.params = { size, position, opacity, color };
			}
		} else if (k === 'inner_glow') {
			const valueEl = popup.querySelector('#ls_inner_glow_value');
			const numValueEl = popup.querySelector('#ls_num_inner_glow_value');
			const opacityEl = popup.querySelector('#ls_inner_glow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_inner_glow_opacity');
			const colorEl = popup.querySelector('#ls_inner_glow_color');
			if (valueEl || numValueEl) {
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 75);
				const color = colorEl?.value || '#ffffff';
				style.params = { value, opacity, color };
			}
		} else if (k === 'outer_glow') {
			const valueEl = popup.querySelector('#ls_outer_glow_value');
			const numValueEl = popup.querySelector('#ls_num_outer_glow_value');
			const opacityEl = popup.querySelector('#ls_outer_glow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_outer_glow_opacity');
			const colorEl = popup.querySelector('#ls_outer_glow_color');
			if (valueEl || numValueEl) {
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 75);
				const color = colorEl?.value || '#ffff00';
				style.params = { value, opacity, color };
			}
		} else if (k === 'shadow') {
			const xEl = popup.querySelector('#ls_shadow_x');
			const numXEl = popup.querySelector('#ls_num_shadow_x');
			const yEl = popup.querySelector('#ls_shadow_y');
			const numYEl = popup.querySelector('#ls_num_shadow_y');
			const valueEl = popup.querySelector('#ls_shadow_value');
			const numValueEl = popup.querySelector('#ls_num_shadow_value');
			const opacityEl = popup.querySelector('#ls_shadow_opacity');
			const numOpacityEl = popup.querySelector('#ls_num_shadow_opacity');
			const colorEl = popup.querySelector('#ls_shadow_color');
			if ((xEl || numXEl) && (yEl || numYEl) && (valueEl || numValueEl)) {
				const x = parseInt((numXEl ? numXEl.value : xEl?.value) ?? 5);
				const y = parseInt((numYEl ? numYEl.value : yEl?.value) ?? 5);
				const value = parseInt((numValueEl ? numValueEl.value : valueEl?.value) ?? 10);
				const opacity = parseInt((numOpacityEl ? numOpacityEl.value : opacityEl?.value) ?? 25);
				const color = colorEl?.value || '#000000';
				style.params = { x, y, value, opacity, color };
			}
		}
	}

	update_preview() {
		const popup = this.POP.el || document.querySelector('#popups .popup');
		if (!popup) return;
		const canvas_preview = popup.querySelector('[data-id="pop_post"]');
		if (!canvas_preview) return;
		const ctx = canvas_preview.getContext('2d');
		this.render_combined_preview(ctx, 20);
	}

	render_combined_preview(ctx, padding = 20) {
		if (!ctx || !this.POP.layer_active_small) return;
		const w = this.POP.width_mini;
		const h = this.POP.height_mini;

		ctx.clearRect(0, 0, w, h);

		const layerImg = this.POP.layer_active_small;
		const drawW = w - padding * 2;
		const drawH = h - padding * 2;

		// 1. Collect outer filters for Drop Shadow and Outer Glow
		let outerFilters = [];
		if (this.styles.outer_glow && this.styles.outer_glow.enabled) {
			outerFilters.push('drop-shadow(' + this.Effects_outer_glow.convert_value(null, this.styles.outer_glow.params, 'preview') + ')');
		}
		if (this.styles.shadow && this.styles.shadow.enabled) {
			outerFilters.push('drop-shadow(' + this.Effects_shadow.convert_value(null, this.styles.shadow.params, 'preview') + ')');
		}

		// 2. Outer / Center Stroke pass (stamp expansion)
		if (this.styles.stroke && this.styles.stroke.enabled) {
			const pos = this.styles.stroke.params.position || 'outside';
			if (pos === 'outside' || pos === 'center') {
				const rawSize = this.styles.stroke.params.size ?? 3;
				const scale = Math.min(w / (config.WIDTH || 1000), h / (config.HEIGHT || 800));
				let size = pos === 'center' ? Math.max(1, Math.ceil(rawSize / 2)) : rawSize;
				size = Math.max(1, Math.round(size * scale * 2));
				const opacity = this.styles.stroke.params.opacity ?? 100;
				const color = this.Effects_stroke.get_stroke_color(this.styles.stroke.params.color || '#000000', opacity);

				// Silhouette of layerImg in stroke color
				const silCanvas = document.createElement('canvas');
				silCanvas.width = w;
				silCanvas.height = h;
				const silCtx = silCanvas.getContext('2d');
				silCtx.drawImage(layerImg, padding, padding, drawW, drawH);
				silCtx.globalCompositeOperation = 'source-in';
				silCtx.fillStyle = color;
				silCtx.fillRect(0, 0, w, h);

				// Fast stamp expansion
				const strokeCanvas = document.createElement('canvas');
				strokeCanvas.width = w;
				strokeCanvas.height = h;
				const sctx = strokeCanvas.getContext('2d');

				for (let r = 1; r <= size; r++) {
					const diag = Math.round(r * 0.7071);
					sctx.drawImage(silCanvas, r, 0);
					sctx.drawImage(silCanvas, -r, 0);
					sctx.drawImage(silCanvas, 0, r);
					sctx.drawImage(silCanvas, 0, -r);
					if (diag > 0) {
						sctx.drawImage(silCanvas, diag, diag);
						sctx.drawImage(silCanvas, -diag, diag);
						sctx.drawImage(silCanvas, diag, -diag);
						sctx.drawImage(silCanvas, -diag, -diag);
					}
				}

				// Remove interior of layer from outer stroke
				strokeCanvas.getContext('2d').globalCompositeOperation = 'destination-out';
				strokeCanvas.getContext('2d').drawImage(layerImg, padding, padding, drawW, drawH);

				ctx.save();
				if (outerFilters.length > 0) {
					ctx.filter = outerFilters.join(' ');
				}
				ctx.drawImage(strokeCanvas, 0, 0);
				ctx.restore();
			}
		}

		// 3. Draw base layer (with Drop Shadow and Outer Glow if not applied on stroke)
		ctx.save();
		if (outerFilters.length > 0 && (!this.styles.stroke || !this.styles.stroke.enabled || (this.styles.stroke.params.position === 'inside'))) {
			ctx.filter = outerFilters.join(' ');
		}
		ctx.drawImage(layerImg, padding, padding, drawW, drawH);
		ctx.restore();

		// 4. Inner Stroke pass (for inside & center)
		if (this.styles.stroke && this.styles.stroke.enabled) {
			const pos = this.styles.stroke.params.position || 'outside';
			if (pos === 'inside' || pos === 'center') {
				const rawSize = this.styles.stroke.params.size ?? 3;
				const scale = Math.min(w / (config.WIDTH || 1000), h / (config.HEIGHT || 800));
				let size = pos === 'center' ? Math.max(1, Math.floor(rawSize / 2)) : rawSize;
				size = Math.max(1, Math.round(size * scale * 2));
				if (size > 0) {
					const opacity = this.styles.stroke.params.opacity ?? 100;
					const color = this.Effects_stroke.get_stroke_color(this.styles.stroke.params.color || '#000000', opacity);

					// Layer mask canvas
					const layerCanvas = document.createElement('canvas');
					layerCanvas.width = w;
					layerCanvas.height = h;
					const lctx = layerCanvas.getContext('2d');
					lctx.drawImage(layerImg, padding, padding, drawW, drawH);

					// Inverted mask
					const maskCanvas = document.createElement('canvas');
					maskCanvas.width = w;
					maskCanvas.height = h;
					const mctx = maskCanvas.getContext('2d');
					mctx.fillStyle = '#000000';
					mctx.fillRect(0, 0, w, h);
					mctx.globalCompositeOperation = 'destination-out';
					mctx.drawImage(layerCanvas, 0, 0);

					// Inward stamp expansion
					const innerCanvas = document.createElement('canvas');
					innerCanvas.width = w;
					innerCanvas.height = h;
					const ictx = innerCanvas.getContext('2d');
					for (let r = 1; r <= size; r++) {
						const diag = Math.round(r * 0.7071);
						ictx.drawImage(maskCanvas, r, 0);
						ictx.drawImage(maskCanvas, -r, 0);
						ictx.drawImage(maskCanvas, 0, r);
						ictx.drawImage(maskCanvas, 0, -r);
						if (diag > 0) {
							ictx.drawImage(maskCanvas, diag, diag);
							ictx.drawImage(maskCanvas, -diag, diag);
							ictx.drawImage(maskCanvas, diag, -diag);
							ictx.drawImage(maskCanvas, -diag, -diag);
						}
					}
					// Clip strictly inside layer
					ictx.globalCompositeOperation = 'destination-in';
					ictx.drawImage(layerCanvas, 0, 0);
					// Colorize
					ictx.globalCompositeOperation = 'source-in';
					ictx.fillStyle = color;
					ictx.fillRect(0, 0, w, h);

					ctx.drawImage(innerCanvas, 0, 0);
				}
			}
		}

		// 5. Inner Glow pass (strictly clipped inside layer)
		if (this.styles.inner_glow && this.styles.inner_glow.enabled) {
			const rawRadius = this.styles.inner_glow.params.value ?? 10;
			const opacity = this.styles.inner_glow.params.opacity ?? 75;
			const color = this.Effects_inner_glow.get_glow_color(this.styles.inner_glow.params.color || '#ffffff', opacity);

			if (rawRadius > 0 && opacity > 0) {
				const scale = Math.min(w / (config.WIDTH || 1000), h / (config.HEIGHT || 800));
				const radius = Math.max(1, Math.round(rawRadius * scale * 2));

				const layerCanvas = document.createElement('canvas');
				layerCanvas.width = w;
				layerCanvas.height = h;
				const lctx = layerCanvas.getContext('2d');
				lctx.drawImage(layerImg, padding, padding, drawW, drawH);

				const maskCanvas = document.createElement('canvas');
				maskCanvas.width = w;
				maskCanvas.height = h;
				const mctx = maskCanvas.getContext('2d');
				mctx.fillStyle = '#000000';
				mctx.fillRect(0, 0, w, h);
				mctx.globalCompositeOperation = 'destination-out';
				mctx.drawImage(layerCanvas, 0, 0);

				const glowCanvas = document.createElement('canvas');
				glowCanvas.width = w;
				glowCanvas.height = h;
				const gctx = glowCanvas.getContext('2d');
				gctx.filter = `blur(${radius}px)`;
				gctx.drawImage(maskCanvas, 0, 0);
				gctx.filter = 'none';

				gctx.globalCompositeOperation = 'destination-in';
				gctx.drawImage(layerCanvas, 0, 0);

				gctx.globalCompositeOperation = 'source-in';
				gctx.fillStyle = color;
				gctx.fillRect(0, 0, w, h);

				ctx.drawImage(glowCanvas, 0, 0);
			}
		}
	}

	save_styles() {
		this.read_current_controls();
		var targetLayer = (this.layer_id != null) ? this.Base_layers.get_layer(this.layer_id) : config.layer;
		if (!targetLayer) {
			targetLayer = config.layer;
		}
		if (!targetLayer) return;

		// List of layer style filter names
		const styleNames = ['stroke', 'inner_glow', 'outer_glow', 'shadow'];

		// Remove existing layer style filters
		let newFilters = (targetLayer.filters || []).filter(
			f => !styleNames.includes(f.name === 'drop-shadow' ? 'shadow' : f.name)
		);

		// Add enabled filters in order
		for (const name of styleNames) {
			const style = this.styles[name];
			if (style && style.enabled) {
				newFilters.push({
					id: style.id || (Math.floor(Math.random() * 999999999) + 1),
					name: name,
					disabled: false,
					params: { ...style.params }
				});
			}
		}

		app.State.do_action(
			new app.Actions.Update_layer_action(targetLayer.id, {
				filters: newFilters
			})
		);
	}

}

export default Layer_styles_class;
