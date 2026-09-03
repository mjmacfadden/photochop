import app from './../../app.js';
import config from './../../config.js';
import Dialog_class from './../../libs/popup.js';
import Base_layers_class from './../../core/base-layers.js';
import Helper_class from './../../libs/helpers.js';
import alertify from './../../../../node_modules/alertifyjs/build/alertify.min.js';

class Layer_adjustment_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();

		this.ADJUSTMENT_TYPES = {
			'brightness': {
				title: 'Brightness / Contrast',
				name: 'Brightness',
				default_params: { value: 0, contrast: 0 },
				params: [
					{ name: 'value', title: 'Brightness (%):', value: 0, range: [-100, 100] },
					{ name: 'contrast', title: 'Contrast (%):', value: 0, range: [-100, 100] }
				]
			},
			'contrast': {
				title: 'Contrast',
				name: 'Contrast',
				default_params: { value: 30 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 30, range: [-100, 100] }
				]
			},
			'hue-saturation': {
				title: 'Hue / Saturation',
				name: 'Hue/Saturation',
				default_params: { hue: 0, saturation: 0, lightness: 0 },
				params: [
					{ name: 'hue', title: 'Hue:', value: 0, range: [-180, 180] },
					{ name: 'saturation', title: 'Saturation:', value: 0, range: [-100, 100] },
					{ name: 'lightness', title: 'Lightness:', value: 0, range: [-100, 100] }
				]
			},
			// Legacy single-channel types (still editable / PSD-exportable)
			'hue-rotate': {
				title: 'Hue Rotate',
				name: 'Hue Rotate',
				default_params: { value: 90 },
				params: [
					{ name: 'value', title: 'Degree:', value: 90, range: [0, 360] }
				]
			},
			'saturate': {
				title: 'Saturate',
				name: 'Saturate',
				default_params: { value: 50 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 50, range: [-100, 100] }
				]
			},
			'grayscale': {
				title: 'Grayscale',
				name: 'Grayscale',
				default_params: { value: 100 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 100, range: [0, 100] }
				]
			},
			'sepia': {
				title: 'Sepia',
				name: 'Sepia',
				default_params: { value: 100 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 100, range: [0, 100] }
				]
			},
			'invert': {
				title: 'Invert',
				name: 'Invert',
				default_params: { value: 100 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 100, range: [0, 100] }
				]
			},
			'exposure': {
				title: 'Exposure',
				name: 'Exposure',
				default_params: { exposure: 0, offset: 0, gamma: 1 },
				params: [
					{ name: 'exposure', title: 'Exposure:', value: 0, range: [-20, 20], step: 0.01 },
					{ name: 'offset', title: 'Offset:', value: 0, range: [-0.5, 0.5], step: 0.001 },
					{ name: 'gamma', title: 'Gamma Correction:', value: 1, range: [0.1, 3], step: 0.01 }
				]
			},
			'threshold': {
				title: 'Threshold',
				name: 'Threshold',
				default_params: { value: 128 },
				params: [
					{ name: 'value', title: 'Threshold Level:', value: 128, range: [0, 255] }
				]
			}
		};
	}

	normalize_type(type) {
		if (!type) return 'brightness';
		type = type.toLowerCase().replace(/_/g, '-');
		if (type === 'hue_rotate') type = 'hue-rotate';
		if (type === 'hue/saturation' || type === 'huesaturation' || type === 'hue_saturation') {
			type = 'hue-saturation';
		}
		return type;
	}

	get_config(type) {
		const norm = this.normalize_type(type);
		return this.ADJUSTMENT_TYPES[norm] || this.ADJUSTMENT_TYPES['brightness'];
	}

	generate_layer_name(typeName) {
		let maxNum = 0;
		const baseName = typeName;
		const regex = new RegExp('^' + baseName + '(?: (\\d+))?$', 'i');

		if (config.layers && Array.isArray(config.layers)) {
			for (const layer of config.layers) {
				const match = (layer.name || '').match(regex);
				if (match) {
					const num = match[1] ? parseInt(match[1]) : 1;
					if (num > maxNum) maxNum = num;
				}
			}
		}

		return baseName + ' ' + (maxNum + 1);
	}

	brightness() {
		this.create_or_edit('brightness');
	}

	contrast() {
		this.create_or_edit('contrast');
	}

	hue_saturation() {
		this.create_or_edit('hue-saturation');
	}

	hue_rotate() {
		// Prefer combined Hue/Saturation for new layers
		this.create_or_edit('hue-saturation');
	}

	saturate() {
		this.create_or_edit('hue-saturation');
	}

	grayscale() {
		this.create_or_edit('grayscale');
	}

	sepia() {
		this.create_or_edit('sepia');
	}

	invert() {
		this.create_or_edit('invert');
	}

	exposure() {
		this.create_or_edit('exposure');
	}

	threshold() {
		this.create_or_edit('threshold');
	}

	create_or_edit(type) {
		const normType = this.normalize_type(type);
		if (config.layer && config.layer.type === 'adjustment') {
			const currentNorm = this.normalize_type(config.layer.adjustment_type);
			if (currentNorm === normType) {
				this.edit(config.layer.id);
				return;
			}
		}
		this.create(normType);
	}

	async create(type) {
		const normType = this.normalize_type(type);
		const conf = this.get_config(normType);
		const layerName = this.generate_layer_name(conf.name);

		let target_order = 1;
		if (config.layer && config.layer.order != null) {
			target_order = config.layer.order + 1;
		} else if (config.layers && config.layers.length > 0) {
			let maxOrder = 0;
			for (const l of config.layers) {
				if (l.order > maxOrder) maxOrder = l.order;
			}
			target_order = maxOrder + 1;
		}

		const settings = {
			name: layerName,
			type: 'adjustment',
			adjustment_type: normType,
			params: { ...conf.default_params },
			width: config.WIDTH,
			height: config.HEIGHT,
			x: 0,
			y: 0,
			visible: true,
			locked: false,
			opacity: 100,
			composition: 'source-over',
			order: target_order,
			mask: null
		};

		await app.State.do_action(
			new app.Actions.Insert_layer_action(settings, false)
		);

		if (config.layer && config.layer.type === 'adjustment') {
			this.edit(config.layer.id);
		}
	}

	edit(layer_id) {
		if (layer_id == null && config.layer) {
			layer_id = config.layer.id;
		}
		const layer = this.Base_layers.get_layer(layer_id);
		if (!layer || layer.type !== 'adjustment') {
			alertify.error('Selected layer is not an adjustment layer.');
			return;
		}

		if (config.layer == null || config.layer.id !== layer.id) {
			this.Base_layers.select(layer.id);
		}

		const normType = this.normalize_type(layer.adjustment_type);
		const conf = this.get_config(normType);
		const initialParams = JSON.parse(JSON.stringify(layer.params || conf.default_params));

		const dialogParams = conf.params.map(p => ({
			...p,
			value: (initialParams && initialParams[p.name] !== undefined) ? initialParams[p.name] : p.value
		}));

		const _this = this;
		const settings = {
			title: conf.title,
			preview: false,
			params: dialogParams,
			on_change: function (params) {
				layer.params = { ...params };
				_this.Base_layers.invalidate({ document: true });
				_this.Base_layers.render(true);
			},
			on_finish: function (params) {
				layer.params = initialParams;
				app.State.do_action(
					new app.Actions.Update_layer_action(layer.id, {
						params: { ...params }
					})
				);
			},
			on_cancel: function () {
				layer.params = initialParams;
				_this.Base_layers.invalidate({ document: true });
				_this.Base_layers.render(true);
			}
		};

		this.POP.show(settings);
	}

}

export default Layer_adjustment_class;
