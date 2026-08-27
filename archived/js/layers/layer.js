export class Layer {
  constructor(name, docWidth, docHeight) {
    this.name = name;
    this.x = 0;
    this.y = 0;
    this.visible = true;
    this.opacity = 100;
    this.blendMode = 'normal';
    this.locked = false;

    this.canvas = document.createElement('canvas');
    this.canvas.width = docWidth;
    this.canvas.height = docHeight;
    this.ctx = this.canvas.getContext('2d');
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  clone() {
    const dup = new Layer(this.name + ' Copy', this.canvas.width, this.canvas.height);
    dup.x = this.x;
    dup.y = this.y;
    dup.visible = this.visible;
    dup.opacity = this.opacity;
    dup.blendMode = this.blendMode;
    dup.ctx.drawImage(this.canvas, 0, 0);
    return dup;
  }

  resize(newWidth, newHeight) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = newWidth;
    this.canvas.height = newHeight;
    this.ctx.drawImage(tempCanvas, 0, 0);
  }

  getCropData(x, y, width, height) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, -x, -y);
    return tempCanvas;
  }

  drawImage(img, dx = 0, dy = 0) {
    this.ctx.drawImage(img, dx, dy);
  }

  getBounds() {
    return {
      x: this.x,
      y: this.y,
      width: this.canvas.width,
      height: this.canvas.height
    };
  }
}
