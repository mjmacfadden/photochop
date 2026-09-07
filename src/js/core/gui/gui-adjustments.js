import app from './../../app.js';
import config from './../../config.js';
import Helper_class from './../../libs/helpers.js';
import Tools_translate_class from './../../modules/tools/translate.js';
import { get_adjustment_icon } from './adjustment-icons.js';

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
			{ name: 'Brightness', target: 'layer/adjustment.brightness', type: 'brightness' },
			{ name: 'Contrast', target: 'layer/adjustment.contrast', type: 'contrast' },
			{ name: 'Hue / Saturation', target: 'layer/adjustment.hue_saturation', type: 'hue-saturation' },
			{ name: 'Exposure', target: 'layer/adjustment.exposure', type: 'exposure' },
			{ name: 'Grayscale', target: 'layer/adjustment.grayscale', type: 'grayscale' },
			{ name: 'Sepia', target: 'layer/adjustment.sepia', type: 'sepia' },
			{ name: 'Invert (Negative)', target: 'layer/adjustment.invert', type: 'invert' },
			{ name: 'Gaussian Blur', target: 'layer/adjustment.blur', type: 'blur' },
			{ name: 'Threshold', target: 'layer/adjustment.threshold', type: 'threshold' }
		];

		let html = '<div class="adjustments_grid">';
		for (const adj of adjustments) {
			html += `<button type="button" class="adjustment_btn trn" data-target="${adj.target}" title="${adj.name}" aria-label="${adj.name}">
				${get_adjustment_icon(adj.type)}
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
