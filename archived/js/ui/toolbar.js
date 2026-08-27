import { bus } from '../core/event-bus.js?v=5';
import { state } from '../core/state.js?v=5';

const toolDefs = [
  { id: 'move', label: 'Move Tool (V)', icon: 'move', shortcut: 'V' },
  { id: 'crop', label: 'Crop Tool (C)', icon: 'crop', shortcut: 'C' },
  { id: 'transform', label: 'Transform (T)', icon: 'transform', shortcut: 'T' },
  { id: 'separator1', type: 'separator' },
  { id: 'brush', label: 'Brush (B)', icon: 'brush', shortcut: 'B', disabled: true },
  { id: 'eraser', label: 'Eraser (E)', icon: 'eraser', shortcut: 'E', disabled: true },
  { id: 'separator2', type: 'separator' },
  { id: 'text', label: 'Text (T)', icon: 'text', shortcut: null, disabled: true },
  { id: 'shape', label: 'Shape (U)', icon: 'shape', shortcut: 'U', disabled: true },
];

const icons = {
  move: `<svg viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  crop: `<svg viewBox="0 0 24 24"><path d="M17 15h2V7c0-1.1-.9-2-2-2H9v2h8v8zM7 17V1H5v4H1v2h4v10c0 1.1.9 2 2 2h10v4h2v-4h4v-2H7z"/></svg>`,
  transform: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>`,
  brush: `<svg viewBox="0 0 24 24"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34a.996.996 0 00-1.41 0L9 12.25 11.75 15l8.96-8.96a.996.996 0 000-1.41z"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24"><path d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.77-.78 2.04 0 2.83l3.85 3.85c.39.39.9.59 1.41.59h7.71c.51 0 1.02-.2 1.41-.59l7.44-7.44c.78-.78.78-2.04 0-2.83L16.55 3.59c-.39-.39-.9-.59-1.41-.59z"/></svg>`,
  text: `<svg viewBox="0 0 24 24"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>`,
  shape: `<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>`,
};

export class Toolbar {
  constructor() {
    this.el = document.getElementById('toolbar');
    this._render();
    this._setupShortcuts();
  }

  _render() {
    this.el.innerHTML = '';
    for (const tool of toolDefs) {
      if (tool.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'tool-separator';
        this.el.appendChild(sep);
        continue;
      }

      const btn = document.createElement('button');
      btn.className = 'tool-btn' + (state.get('activeTool') === tool.id ? ' active' : '');
      btn.dataset.tool = tool.id;
      btn.title = tool.label;
      btn.innerHTML = icons[tool.icon] || '';

      if (tool.disabled) {
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
      }

      btn.addEventListener('click', () => this._selectTool(tool.id));
      this.el.appendChild(btn);
    }
  }

  _selectTool(toolId) {
    const prev = state.get('activeTool');
    state.set('activeTool', toolId);

    this.el.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolId);
    });

    bus.emit('tool:changed', { prev, current: toolId });
  }

  _setupShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      for (const tool of toolDefs) {
        if (tool.shortcut && tool.shortcut.toLowerCase() === e.key.toLowerCase()) {
          e.preventDefault();
          this._selectTool(tool.id);
          return;
        }
      }
    });
  }
}
