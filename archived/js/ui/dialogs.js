import { bus } from '../core/event-bus.js?v=5';

export class Dialogs {
  constructor() {
    this.overlay = document.getElementById('dialog-overlay');
    this.container = document.getElementById('dialog-container');
    bus.on('dialog:show', (opts) => this.show(opts));
  }

  show(options) {
    const { title, fields, onConfirm, onCancel } = options;

    this.container.innerHTML = '';
    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const header = document.createElement('div');
    header.className = 'dialog-header';
    header.innerHTML = `<span>${title}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dialog-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const body = document.createElement('div');
    body.className = 'dialog-body';

    const values = {};

    for (const field of fields) {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'dialog-field';

      const label = document.createElement('label');
      label.textContent = field.label;
      fieldDiv.appendChild(label);

      if (field.type === 'select') {
        const select = document.createElement('select');
        for (const opt of field.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          select.appendChild(o);
        }
        select.value = field.value || field.options[0].value;
        select.addEventListener('change', () => { values[field.name] = select.value; });
        values[field.name] = select.value;
        fieldDiv.appendChild(select);
      } else if (field.type === 'checkbox') {
        const cb = document.createElement('label');
        cb.className = 'option-checkbox';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = field.value || false;
        cb.appendChild(input);
        cb.appendChild(document.createTextNode(field.label));
        fieldDiv.appendChild(cb);
        values[field.name] = input.checked;
        input.addEventListener('change', () => { values[field.name] = input.checked; });
      } else {
        const input = document.createElement('input');
        input.type = field.type || 'text';
        input.value = field.value || '';
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        input.addEventListener('change', () => { values[field.name] = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            this.hide();
            onConfirm?.(values);
          }
        });
        values[field.name] = field.value || '';
        fieldDiv.appendChild(input);
      }

      body.appendChild(fieldDiv);
    }

    dialog.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'dialog-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.hide();
      onCancel?.();
    });
    footer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'OK';
    confirmBtn.addEventListener('click', () => {
      this.hide();
      onConfirm?.(values);
    });
    footer.appendChild(confirmBtn);

    dialog.appendChild(footer);
    this.container.appendChild(dialog);
    this.overlay.classList.remove('hidden');

    const firstInput = body.querySelector('input:not([type="checkbox"])');
    if (firstInput) {
      setTimeout(() => {
        firstInput.focus();
        firstInput.select();
      }, 50);
    }
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.container.innerHTML = '';
  }
}
