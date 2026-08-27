import { ToolBase } from './tool-base.js?v=5';
import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

export class TransformTool extends ToolBase {
  constructor(renderer) {
    super('transform', renderer);
    this.isTransforming = false;
    this.isDragging = false;
    this.handle = null;
    this.startMouse = null;
    this.startBounds = null;
    this.originalCanvas = null;
    this.originalData = null;

    bus.on('transform:apply', () => this.applyTransform());
    bus.on('transform:cancel', () => this.cancelTransform());
    bus.on('overlay:render', (ctx) => this._renderOverlay(ctx));

    bus.on('option:transform-x:changed', (v) => this._applyOption('x', v));
    bus.on('option:transform-y:changed', (v) => this._applyOption('y', v));
    bus.on('option:transform-w:changed', (v) => this._applyOption('w', v));
    bus.on('option:transform-h:changed', (v) => this._applyOption('h', v));
  }

  _applyOption(prop, value) {
    if (!this.isTransforming || !this.layer) return;
    const b = this.layer.getBounds();
    const canvas = this.originalCanvas;
    let newX = b.x, newY = b.y, newW = b.width, newH = b.height;

    if (prop === 'x') newX = value;
    else if (prop === 'y') newY = value;
    else if (prop === 'w') newW = Math.max(1, value);
    else if (prop === 'h') newH = Math.max(1, value);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.round(newW);
    tempCanvas.height = Math.round(newH);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newW, newH);

    this.layer.canvas.width = Math.round(newW);
    this.layer.canvas.height = Math.round(newH);
    this.layer.ctx.drawImage(tempCanvas, 0, 0);
    this.layer.x = Math.round(newX);
    this.layer.y = Math.round(newY);

    this._updateOptions();
    this.renderer.render();
    this.renderer.renderOverlay();
  }

  activate() {
    const doc = state.get('document');
    if (!doc) return;

    const layer = state.get('activeLayer') || doc.layers[doc.layers.length - 1];
    if (!layer) return;

    this._startTransform(layer);
  }

  deactivate() {
    this.cancelTransform();
  }

  _startTransform(layer) {
    this.layer = layer;
    this.isTransforming = true;

    this.originalCanvas = document.createElement('canvas');
    this.originalCanvas.width = layer.canvas.width;
    this.originalCanvas.height = layer.canvas.height;
    this.originalCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);

    this.originalData = { x: layer.x, y: layer.y };

    this.renderer.renderOverlay();
    this._updateOptions();
  }

  _getHandles() {
    if (!this.layer) return [];
    const b = this.layer.getBounds();
    const s = 6;
    return [
      { id: 'tl', x: b.x, y: b.y, cursor: 'nw-resize' },
      { id: 'tr', x: b.x + b.width, y: b.y, cursor: 'ne-resize' },
      { id: 'bl', x: b.x, y: b.y + b.height, cursor: 'sw-resize' },
      { id: 'br', x: b.x + b.width, y: b.y + b.height, cursor: 'se-resize' },
      { id: 'tm', x: b.x + b.width / 2, y: b.y, cursor: 'n-resize' },
      { id: 'bm', x: b.x + b.width / 2, y: b.y + b.height, cursor: 's-resize' },
      { id: 'ml', x: b.x, y: b.y + b.height / 2, cursor: 'w-resize' },
      { id: 'mr', x: b.x + b.width, y: b.y + b.height / 2, cursor: 'e-resize' },
    ];
  }

  _hitHandle(pos) {
    const handles = this._getHandles();
    const threshold = 10;
    const doc = state.get('document');
    if (!doc) return null;

    const zoom = this.renderer.mainCanvas.getBoundingClientRect().width / doc.width;

    for (const h of handles) {
      const dx = (pos.x - h.x) * zoom;
      const dy = (pos.y - h.y) * zoom;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        return h;
      }
    }
    return null;
  }

  onMouseDown(e, pos) {
    if (!this.isTransforming || !this.layer) return;

    const handle = this._hitHandle(pos);
    if (handle) {
      this.isDragging = true;
      this.handle = handle;
      this.startMouse = { x: pos.x, y: pos.y };
      this.startBounds = { ...this.layer.getBounds() };
    }
  }

  onMouseMove(e, pos) {
    if (!this.isDragging || !this.layer || !this.handle) {
      if (this.isTransforming && this.layer) {
        const handle = this._hitHandle(pos);
        this.renderer.mainCanvas.style.cursor = handle ? handle.cursor : 'default';
      }
      return;
    }

    const dx = pos.x - this.startMouse.x;
    const dy = pos.y - this.startMouse.y;
    const b = this.startBounds;
    const layer = this.layer;
    const canvas = this.originalCanvas;

    let newX = b.x;
    let newY = b.y;
    let newW = b.width;
    let newH = b.height;

    const id = this.handle.id;

    if (id.includes('r')) newW = Math.max(1, b.width + dx);
    if (id.includes('l')) { newX = b.x + dx; newW = Math.max(1, b.width - dx); }
    if (id.includes('b')) newH = Math.max(1, b.height + dy);
    if (id.includes('t')) { newY = b.y + dy; newH = Math.max(1, b.height - dy); }

    if (e.shiftKey) {
      const ratio = canvas.width / canvas.height;
      if (id === 'tl' || id === 'tr' || id === 'bl' || id === 'br') {
        newH = newW / ratio;
        if (id.includes('t')) newY = b.y + b.height - newH;
      }
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = Math.round(newW);
    tempCanvas.height = Math.round(newH);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, newW, newH);

    layer.canvas.width = Math.round(newW);
    layer.canvas.height = Math.round(newH);
    layer.ctx.drawImage(tempCanvas, 0, 0);
    layer.x = Math.round(newX);
    layer.y = Math.round(newY);

    this._updateOptions();
    this.renderer.render();
    this.renderer.renderOverlay();
  }

  onMouseUp(e, pos) {
    this.isDragging = false;
    this.handle = null;
  }

  applyTransform() {
    if (!this.isTransforming) return;
    this.isTransforming = false;
    this.originalCanvas = null;
    state.set('modified', true);
    this.renderer.renderOverlay();
    this.renderer.render();
    bus.emit('status:update', 'Transform applied');
  }

  cancelTransform() {
    if (!this.isTransforming || !this.layer) return;

    this.layer.canvas.width = this.originalCanvas.width;
    this.layer.canvas.height = this.originalCanvas.height;
    this.layer.ctx.drawImage(this.originalCanvas, 0, 0);
    this.layer.x = this.originalData.x;
    this.layer.y = this.originalData.y;

    this.isTransforming = false;
    this.originalCanvas = null;
    this.renderer.renderOverlay();
    this.renderer.render();
    bus.emit('status:update', 'Transform cancelled');
  }

  _updateOptions() {
    if (!this.layer) return;
    const b = this.layer.getBounds();
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = Math.round(val);
    };
    setVal('transform-x', b.x);
    setVal('transform-y', b.y);
    setVal('transform-w', b.width);
    setVal('transform-h', b.height);
  }

  _renderOverlay(ctx) {
    if (!this.isTransforming || !this.layer) return;

    const b = this.layer.getBounds();
    const handles = this._getHandles();

    ctx.strokeStyle = '#2680eb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.setLineDash([]);

    const size = 5;
    for (const h of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(h.x - size, h.y - size, size * 2, size * 2);
      ctx.strokeStyle = '#2680eb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(h.x - size, h.y - size, size * 2, size * 2);
    }
  }
}
