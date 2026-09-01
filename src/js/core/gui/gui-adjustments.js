import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';

class GUI_adjustments_class {

	constructor(GUI) {
		this.GUI = GUI;
		this.Helper = new Helper_class();
		this.Tools_translate = new Tools_translate_class();
	}

	render_main_adjustments() {
		const target = document.getElementById('toggle_adjustments');
		if (!target) return;

		const adjustments = [
			{
				name: 'Brightness',
				target: 'layer/adjustment.brightness',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/></svg>`
			},
			{
				name: 'Contrast',
				target: 'layer/adjustment.contrast',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>`
			},
			{
				name: 'Hue Rotate',
				target: 'layer/adjustment.hue_rotate',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2a10 10 0 0 1 10 10c0 4-2.5 7.5-6 9"/><path d="M12 2A10 10 0 0 0 2 12c0 4 2.5 7.5 6 9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M19 16l3 5-5-1"/></svg>`
			},
			{
				name: 'Saturate',
				target: 'layer/adjustment.saturate',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/><path d="M12 2.69v18.62a8 8 0 0 0 5.66-13z" fill="currentColor"/></svg>`
			},
			{
				name: 'Grayscale',
				target: 'layer/adjustment.grayscale',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><polygon points="3,4 21,20 3,20" fill="currentColor"/></svg>`
			},
			{
				name: 'Sepia',
				target: 'layer/adjustment.sepia',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><polyline points="21 15 16 10 5 21"/></svg>`
			},
			{
				name: 'Invert (Negative)',
				target: 'layer/adjustment.invert',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polygon points="3,3 21,21 3,21" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="#3c3c3c"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/></svg>`
			},
			{
				name: 'Gaussian Blur',
				target: 'layer/adjustment.blur',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3.5"/><circle cx="5.5" cy="9.5" r="2.2" opacity="0.6"/><circle cx="18.5" cy="9.5" r="2.2" opacity="0.6"/><circle cx="8.5" cy="17.5" r="2.2" opacity="0.6"/><circle cx="15.5" cy="17.5" r="2.2" opacity="0.6"/><circle cx="12" cy="4.5" r="1.8" opacity="0.5"/></svg>`
			},
			{
				name: 'Threshold',
				target: 'layer/adjustment.threshold',
				icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><rect x="12" y="3" width="9" height="18" fill="currentColor"/></svg>`
			}
		];

		let html = '<div class="adjustments_grid">';
		for (const adj of adjustments) {
			html += `<button type="button" class="adjustment_btn trn" data-target="${adj.target}" title="${adj.name}" aria-label="${adj.name}">
				${adj.icon}
			</button>`;
		}
		html += '</div>';

		target.innerHTML = html;
		this.set_events();
	}

	set_events() {
		const target = document.getElementById('toggle_adjustments');
		if (!target) return;

		target.addEventListener('click', (e) => {
			const btn = e.target.closest('.adjustment_btn');
			if (!btn) return;
			const targetAction = btn.dataset.target;
			if (!targetAction) return;

			const parts = targetAction.split('.');
			const module = parts[0];
			const function_name = parts[1];

			if (this.GUI.modules[module] && typeof this.GUI.modules[module][function_name] === 'function') {
				this.GUI.modules[module][function_name]();
			}
		});
	}

}

export default GUI_adjustments_class;
