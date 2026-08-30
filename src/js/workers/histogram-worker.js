self.onmessage = function (event) {
	var pixels = new Uint8ClampedArray(event.data.pixels);
	var histogram = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
	var total = pixels.length / 4;
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

	self.postMessage({
		histogram: histogram.map(function (channel) { return Array.from(channel); }),
		total: total,
		sum: sum,
	});
};