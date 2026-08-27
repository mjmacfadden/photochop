import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

export class ToolManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.activeTool = null;
    this.tools = {};

    this._setupListeners();
  }

  register(tool) {
    this.tools[tool.id] = tool;
  }

  _setupListeners() {
    bus.on('tool:changed', ({ current }) => {
      if (this.activeTool) {
        this.activeTool.deactivate();
      }
      this.activeTool = this.tools[current] || null;
      if (this.activeTool) {
        this.activeTool.activate();
      }
    });

    const canvas = this.renderer.mainCanvas;

    canvas.addEventListener('mousedown', (e) => {
      if (this.activeTool) {
        const pos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        this.activeTool.onMouseDown(e, pos);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.activeTool) {
        const pos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        this.activeTool.onMouseMove(e, pos);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (this.activeTool) {
        const pos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        this.activeTool.onMouseUp(e, pos);
      }
    });

    canvas.addEventListener('dblclick', (e) => {
      if (this.activeTool) {
        const pos = this.renderer.screenToCanvas(e.clientX, e.clientY);
        this.activeTool.onDoubleClick(e, pos);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.activeTool && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        this.activeTool.onKeyDown(e);
      }
    });

    document.addEventListener('keyup', (e) => {
      if (this.activeTool && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        this.activeTool.onKeyUp(e);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const zoom = Math.max(0.1, Math.min(10, state.get('zoom') + delta));
        state.set('zoom', zoom);
        bus.emit('view:changed');
      }
    }, { passive: false });
  }
}
