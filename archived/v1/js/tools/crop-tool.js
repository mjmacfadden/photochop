import { ToolBase } from './tool-base.js?v=5';
import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

export class CropTool extends ToolBase {
  constructor(renderer) {
    super('crop', renderer);
    this.isCropping = false;
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.startMouse = null;
    this.cropRect = null;
    this.aspectRatio = null;

    bus.on('crop:apply', () => this.applyCrop());
    bus.on('crop:cancel', () => this.cancelCrop());
    bus.on('overlay:render', (ctx) => this._renderOverlay(ctx));
    bus.on('option:crop-aspect:changed', (val) => {
      if (val === 'free') {
        this.aspectRatio = null;
      } else {
        const [w, h] = val.split(':').map(Number);
        this.aspectRatio = w / h;
      }
    });
  }

  activate() {
    const doc = state.get('document');
    if (!doc) return;

    this.cropRect = { x: 0, y: 0, width: doc.width, height: doc.height };
    this.isCropping = true;
    this.renderer.renderOverlay();
  }

  deactivate() {
    this.cancelCrop();
  }

  _getHandles() {
    if (!this.cropRect) return [];
    const c = this.cropRect;
    return [
      { id: 'tl', x: c.x, y: c.y, cursor: 'nw-resize' },
      { id: 'tr', x: c.x + c.width, y: c.y, cursor: 'ne-resize' },
      { id: 'bl', x: c.x, y: c.y + c.height, cursor: 'sw-resize' },
      { id: 'br', x: c.x + c.width, y: c.y + c.height, cursor: 'se-resize' },
      { id: 'tm', x: c.x + c.width / 2, y: c.y, cursor: 'n-resize' },
      { id: 'bm', x: c.x + c.width / 2, y: c.y + c.height, cursor: 's-resize' },
      { id: 'ml', x: c.x, y: c.y + c.height / 2, cursor: 'w-resize' },
      { id: 'mr', x: c.x + c.width, y: c.y + c.height / 2, cursor: 'e-resize' },
    ];
  }

  _hitHandle(pos) {
    const handles = this._getHandles();
    const doc = state.get('document');
    if (!doc) return null;

    const zoom = this.renderer.mainCanvas.getBoundingClientRect().width / doc.width;
    const threshold = 10;

    for (const h of handles) {
      const dx = (pos.x - h.x) * zoom;
      const dy = (pos.y - h.y) * zoom;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        return h;
      }
    }
    return null;
  }

  _isInsideCrop(pos) {
    if (!this.cropRect) return false;
    const c = this.cropRect;
    return pos.x >= c.x && pos.x <= c.x + c.width &&
           pos.y >= c.y && pos.y <= c.y + c.height;
  }

  onMouseDown(e, pos) {
    if (!this.isCropping) return;

    const handle = this._hitHandle(pos);
    if (handle) {
      this.isResizing = true;
      this.resizeHandle = handle;
      this.startMouse = { ...pos };
      this.startCrop = { ...this.cropRect };
    } else if (this._isInsideCrop(pos)) {
      this.isDragging = true;
      this.startMouse = { ...pos };
      this.startCrop = { ...this.cropRect };
    } else {
      this.cropRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
      this.isResizing = true;
      this.resizeHandle = { id: 'br' };
      this.startMouse = { ...pos };
      this.startCrop = { ...this.cropRect };
    }
  }

  onMouseMove(e, pos) {
    if (!this.isCropping) return;

    if (this.isDragging && this.startMouse) {
      const dx = pos.x - this.startMouse.x;
      const dy = pos.y - this.startMouse.y;
      const doc = state.get('document');

      this.cropRect.x = Math.max(0, Math.min(doc.width - this.startCrop.width, this.startCrop.x + dx));
      this.cropRect.y = Math.max(0, Math.min(doc.height - this.startCrop.height, this.startCrop.y + dy));
      this.renderer.renderOverlay();
    } else if (this.isResizing && this.startMouse && this.resizeHandle) {
      const dx = pos.x - this.startMouse.x;
      const dy = pos.y - this.startMouse.y;
      const id = this.resizeHandle.id;
      const s = this.startCrop;
      const doc = state.get('document');

      let x = s.x, y = s.y, w = s.width, h = s.height;

      if (id.includes('r')) w = Math.max(10, s.width + dx);
      if (id.includes('l')) { w = Math.max(10, s.width - dx); x = s.x + s.width - w; }
      if (id.includes('b')) h = Math.max(10, s.height + dy);
      if (id.includes('t')) { h = Math.max(10, s.height - dy); y = s.y + s.height - h; }

      if (this.aspectRatio && (id === 'tl' || id === 'tr' || id === 'bl' || id === 'br')) {
        h = w / this.aspectRatio;
        if (id.includes('t')) y = s.y + s.height - h;
      }

      x = Math.max(0, Math.min(doc.width - w, x));
      y = Math.max(0, Math.min(doc.height - h, y));

      this.cropRect = { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
      this.renderer.renderOverlay();
    }

    const handle = this._hitHandle(pos);
    if (handle) {
      this.renderer.mainCanvas.style.cursor = handle.cursor;
    } else if (this._isInsideCrop(pos)) {
      this.renderer.mainCanvas.style.cursor = 'move';
    } else {
      this.renderer.mainCanvas.style.cursor = 'crosshair';
    }
  }

  onMouseUp(e, pos) {
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.startMouse = null;
    this.startCrop = null;
  }

  applyCrop() {
    if (!this.isCropping || !this.cropRect) return;

    const doc = state.get('document');
    if (!doc) return;

    const c = this.cropRect;
    if (c.width < 2 || c.height < 2) {
      this.cancelCrop();
      return;
    }

    const newWidth = Math.round(c.width);
    const newHeight = Math.round(c.height);
    const offsetX = Math.round(c.x);
    const offsetY = Math.round(c.y);

    for (const layer of doc.layers) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = newWidth;
      tempCanvas.height = newHeight;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(layer.canvas, -offsetX, -offsetY);

      layer.canvas.width = newWidth;
      layer.canvas.height = newHeight;
      layer.ctx.drawImage(tempCanvas, 0, 0);
      layer.x -= offsetX;
      layer.y -= offsetY;
    }

    doc.width = newWidth;
    doc.height = newHeight;

    this.isCropping = false;
    this.cropRect = null;
    state.set('modified', true);

    bus.emit('document:resized', { width: newWidth, height: newHeight });
    bus.emit('status:update', `Cropped to ${newWidth}x${newHeight}`);
  }

  cancelCrop() {
    this.isCropping = false;
    this.cropRect = null;
    this.renderer.renderOverlay();
    this.renderer.mainCanvas.style.cursor = '';
  }

  _renderOverlay(ctx) {
    if (!this.isCropping || !this.cropRect) return;

    const doc = state.get('document');
    if (!doc) return;

    const c = this.cropRect;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, doc.width, c.y);
    ctx.fillRect(0, c.y, c.x, c.height);
    ctx.fillRect(c.x + c.width, c.y, doc.width - c.x - c.width, c.height);
    ctx.fillRect(0, c.y + c.height, doc.width, doc.height - c.y - c.height);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x, c.y, c.width, c.height);

    const thirdW = c.width / 3;
    const thirdH = c.height / 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 0.5;

    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(c.x + thirdW * i, c.y);
      ctx.lineTo(c.x + thirdW * i, c.y + c.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(c.x, c.y + thirdH * i);
      ctx.lineTo(c.x + c.width, c.y + thirdH * i);
      ctx.stroke();
    }

    const handles = this._getHandles();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2680eb';
    ctx.lineWidth = 1;

    for (const h of handles) {
      ctx.fillRect(h.x - 4, h.y - 4, 8, 8);
      ctx.strokeRect(h.x - 4, h.y - 4, 8, 8);
    }
  }
}
