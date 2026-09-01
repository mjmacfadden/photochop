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
				title: 'Brightness',
				name: 'Brightness',
				default_params: { value: 30 },
				params: [
					{ name: 'value', title: 'Percentage:', value: 30, range: [-100, 100] }
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
			'blur': {
				title: 'Gaussian Blur',
				name: 'Gaussian Blur',
				default_params: { value: 5 },
				params: [
					{ name: 'value', title: 'Radius (px):', value: 5, range: [0, 50] }
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

	hue_rotate() {
		this.create_or_edit('hue-rotate');
	}

	saturate() {
		this.create_or_edit('saturate');
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

	blur() {
		this.create_or_edit('blur');
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
