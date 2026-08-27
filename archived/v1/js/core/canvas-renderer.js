import { bus } from './event-bus.js?v=5';
import { state } from './state.js?v=5';

export class CanvasRenderer {
  constructor() {
    this.mainCanvas = document.getElementById('main-canvas');
    this.overlayCanvas = document.getElementById('overlay-canvas');
    this.mainCtx = this.mainCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this.container = document.getElementById('canvas-container');

    this._setupListeners();
  }

  _setupListeners() {
    bus.on('document:created', () => this.render());
    bus.on('document:loaded', () => this.render());
    bus.on('layer:added', () => this.render());
    bus.on('layer:removed', () => this.render());
    bus.on('layer:modified', () => this.render());
    bus.on('layer:reordered', () => this.render());
    bus.on('layer:visibility-changed', () => this.render());
    bus.on('layer:opacity-changed', () => this.render());
    bus.on('layer:blend-mode-changed', () => this.render());
    bus.on('view:changed', () => this.render());
    bus.on('transform:changed', () => this.render());
    bus.on('crop:preview', () => this.render());
  }

  setCanvasSize(width, height) {
    this.mainCanvas.width = width;
    this.mainCanvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.container.style.width = width + 'px';
    this.container.style.height = height + 'px';
    this._updateView();
  }

  _updateView() {
    const doc = state.get('document');
    if (!doc) return;

    const workspace = document.getElementById('workspace');
    const ww = workspace.clientWidth;
    const wh = workspace.clientHeight;
    const cw = doc.width;
    const ch = doc.height;

    const scaleX = (ww - 40) / cw;
    const scaleY = (wh - 40) / ch;
    const autoZoom = Math.min(scaleX, scaleY, 1);

    const zoom = state.get('zoom') * autoZoom;
    const containerW = cw * zoom;
    const containerH = ch * zoom;

    this.container.style.transform = `translate(${state.get('panX')}px, ${state.get('panY')}px) scale(1)`;
    this.mainCanvas.style.width = containerW + 'px';
    this.mainCanvas.style.height = containerH + 'px';
    this.overlayCanvas.style.width = containerW + 'px';
    this.overlayCanvas.style.height = containerH + 'px';
  }

  render() {
    const doc = state.get('document');
    if (!doc) return;

    this._updateView();

    const ctx = this.mainCtx;
    const w = this.mainCanvas.width;
    const h = this.mainCanvas.height;

    ctx.clearRect(0, 0, w, h);

    for (const layer of doc.layers) {
      if (!layer.visible) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = this._getCompositeOp(layer.blendMode);

      if (layer.canvas) {
        ctx.drawImage(layer.canvas, layer.x, layer.y);
      }

      ctx.restore();
    }
  }

  renderOverlay() {
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);
    bus.emit('overlay:render', ctx);
  }

  _getCompositeOp(mode) {
    const map = {
      'normal': 'source-over',
      'multiply': 'multiply',
      'screen': 'screen',
      'overlay': 'overlay',
      'darken': 'darken',
      'lighten': 'lighten',
      'color-dodge': 'color-dodge',
      'color-burn': 'color-burn',
      'hard-light': 'hard-light',
      'soft-light': 'soft-light',
      'difference': 'difference',
      'exclusion': 'exclusion',
    };
    return map[mode] || 'source-over';
  }

  screenToCanvas(screenX, screenY) {
    const rect = this.mainCanvas.getBoundingClientRect();
    const doc = state.get('document');
    if (!doc) return { x: 0, y: 0 };

    const scaleX = doc.width / rect.width;
    const scaleY = doc.height / rect.height;

    return {
      x: (screenX - rect.left) * scaleX,
      y: (screenY - rect.top) * scaleY
    };
  }

  canvasToScreen(canvasX, canvasY) {
    const rect = this.mainCanvas.getBoundingClientRect();
    const doc = state.get('document');
    if (!doc) return { x: 0, y: 0 };

    const scaleX = rect.width / doc.width;
    const scaleY = rect.height / doc.height;

    return {
      x: canvasX * scaleX + rect.left,
      y: canvasY * scaleY + rect.top
    };
  }

  getExportCanvas(flatten = true) {
    const doc = state.get('document');
    if (!doc) return null;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = doc.width;
    exportCanvas.height = doc.height;
    const ctx = exportCanvas.getContext('2d');

    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = this._getCompositeOp(layer.blendMode);
      if (layer.canvas) {
        ctx.drawImage(layer.canvas, layer.x, layer.y);
      }
      ctx.restore();
    }

    return exportCanvas;
  }
}
