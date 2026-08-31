import config from './../../config.js';
import Base_layers_class from './../../core/base-layers.js';
import Dialog_class from './../../libs/popup.js';
import Helper_class from './../../libs/helpers.js';

class Image_histogram_class {

	constructor() {
		this.POP = new Dialog_class();
		this.Base_layers = new Base_layers_class();
		this.Helper = new Helper_class();
		this.worker = null;
		this.request_id = 0;
	}

	histogram() {
		var _this = this;

		var settings = {
			title: 'Histogram',
			on_change: function (params) {
				_this.histogram_onload(params);
			},
			params: [
				{name: "channel", title: "Channel:", values: ["Gray", "Red", "Green", "Blue"], },
				{title: 'Histogram:', function: function () {
						var html = '<canvas style="position:relative;" id="c_h" width="256" height="100"></canvas>';
						return html;
					}},
				{title: "Total pixels:", value: ""},
				{title: "Average:", value: ""},
			],
		};
		this.POP.show(settings);

		this.histogram_onload({});
	}

	async histogram_onload(params) {
		//get canvas from layer
		var canvas = this.Base_layers.convert_layer_to_canvas(config.layer.id);
		var ctx = canvas.getContext("2d");
		var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
		var request_id = ++this.request_id;
		var result = await this.calculate_histogram(img.data);
		if (request_id !== this.request_id)
			return;

		var channel = 0;
		if (params.channel == 'Red')
			channel = 1;
		else if (params.channel == 'Green')
			channel = 2;
		else if (params.channel == 'Blue')
			channel = 3;

		var hist_data = result.histogram;
		var total = result.total;
		var sum = result.sum;

		var c = document.getElementById("c_h").getContext("2d");
		c.rect(0, 0, 256, 100);
		c.fillStyle = "#ffffff";
		c.fill();
		var opacity = 1;

		//draw histogram
		for (var h in hist_data) {
			for (var i = 0; i <= 255; i++) {
				if (h != channel)
					continue;
				if (hist_data[h][i] == 0)
					continue;
				c.beginPath();

				if (h == 0)
					c.strokeStyle = "rgba(64, 64, 64, " + opacity * 2 + ")";
				else if (h == 1)
					c.strokeStyle = "rgba(255, 0, 0, " + opacity + ")";
				else if (h == 2)
					c.strokeStyle = "rgba(0, 255, 0, " + opacity + ")";
				else if (h == 3)
					c.strokeStyle = "rgba(0, 0, 255, " + opacity + ")";

				c.lineWidth = 1;
				c.moveTo(i + 0.5, 100 + 0.5);
				c.lineTo(i + 0.5, 100 - Math.round(hist_data[h][i] * 255 * 100 / total / 6) + 0.5);
				c.stroke();
			}
		}

		document.getElementById("pop_data_totalpixel").innerHTML = this.Helper.number_format(total, 0);
		var average;
		if (total > 0)
			average = Math.round(sum * 10 / total / 3) / 10;
		else
			average = '-';
		document.getElementById("pop_data_average").innerHTML = average;

		canvas.width = 1;
		canvas.height = 1;
	}

	calculate_histogram(pixels) {
		if (typeof Worker === 'undefined') {
			return Promise.resolve(this.calculate_histogram_locally(pixels));
		}
		if (this.worker == null) {
			this.worker = new Worker(new URL('./../../workers/histogram-worker.js', import.meta.url));
		}
		return new Promise((resolve, reject) => {
			this.worker.onmessage = function (event) {
				resolve(event.data);
			};
			this.worker.onerror = reject;
			this.worker.postMessage({ pixels: pixels.buffer }, [pixels.buffer]);
		});
	}

	calculate_histogram_locally(pixels) {
		var histogram = [new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0), new Array(256).fill(0)];
		var sum = 0;
		for (var index = 0; index < pixels.length; index += 4) {
			var red = pixels[index];
			var green = pixels[index + 1];
			var blue = pixels[index + 2];
			histogram[0][Math.round((red + green + blue) / 3)]++;
			histogram[1][red]++;
			histogram[2][green]++;
			histogram[3][blue]++;
			sum += red + green + blue;
		}
		return { histogram: histogram, total: pixels.length / 4, sum: sum };
	}

}

export default Image_histogram_class;