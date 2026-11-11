import { h } from '../../dom.js';
import { icon } from '../../icons.js';
import { toast, notifyError } from '../../toast.js';
import { confirmDialog } from '../../modal.js';
import { state, updateSettings } from '../../state.js';
import { listWidgets, reloadWidgets } from '../../widgets/registry.js';
import {
  openWidgetGuide,
  openInstallWidget,
  openWidgetStudio,
} from './widgetStudio.js';
import { section, note, actionsRow, button } from './shared.js';

const api = window.api;

export function renderWidgetsSettings({ refresh }) {
  const wrap = h('div');
  const enabled = new Set(state.settings.widgets.enabled || []);
  const widgets = listWidgets().sort((a, b) => Number(a.user) - Number(b.user));

  const list = h('div');
  if (!widgets.length) {
    list.appendChild(h('div', { class: 'empty-state', text: 'Виджеты не найдены.' }));
  }

  for (const widget of widgets) {
    const toggle = h('button', {
      class: `toggle${enabled.has(widget.id) ? ' on' : ''}`,
      type: 'button',
      role: 'switch',
      'aria-checked': enabled.has(widget.id) ? 'true' : 'false',
      'aria-label': `Включить виджет ${widget.name}`,
      onClick: async () => {
        const next = new Set(state.settings.widgets.enabled);
        if (next.has(widget.id)) next.delete(widget.id);
        else next.add(widget.id);
        toggle.classList.toggle('on', next.has(widget.id));
        try {
          await updateSettings({ widgets: { enabled: Array.from(next) } });
        } catch (error) {
          notifyError(error);
        }
      },
    });

    const row = h(
      'div',
      { class: 'widget-row' },
      h('div', { class: 'widget-row-icon', text: widget.icon }),
      h(
        'div',
        { class: 'widget-row-info' },
        h(
          'div',
          { class: 'widget-row-name' },
          h('span', { text: widget.name }),
          h('span', { class: 'badge', text: widget.user ? 'свой' : 'встроен' })
        ),
        h('div', {
          class: 'widget-row-desc',
          text: widget.description || `Версия ${widget.version}`,
        })
      ),
      toggle
    );

    if (widget.user) {
      row.appendChild(
        h(
          'button',
          {
            class: 'btn icon-only',
            title: 'Удалить виджет',
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Удалить виджет «${widget.name}»?`,
                message: `Файл ${widget.id}.js будет удалён из папки widgets.`,
                confirmLabel: 'Удалить',
                danger: true,
              });
              if (!ok) return;
              try {
                await api.widgets.delete(widget.id);
                const next = state.settings.widgets.enabled.filter(
                  (id) => id !== widget.id
                );
                await updateSettings({ widgets: { enabled: next } });
                await reloadWidgets();
                toast('Виджет удалён');
                refresh();
              } catch (error) {
                notifyError(error);
              }
            },
          },
          icon('trash')
        )
      );
    }
    list.appendChild(row);
  }

  wrap.appendChild(
    section(
      'Виджеты',
      note(
        'Виджет — это ES-модуль в папке widgets профиля. Включайте нужные, встраивайте в заметку строкой ::widget[id] или создавайте новые через AI. Изменения применяются сразу.'
      ),
      list
    )
  );

  const errors = state.widgetErrors || [];
  if (errors.length) {
    const errorList = h('div');
    for (const error of errors) {
      errorList.appendChild(
        h(
          'div',
          { class: 'studio-error', style: { display: 'block' } },
          h('strong', { text: `${error.fileId}.js: ` }),
          h('span', { text: error.message }),
          h(
            'button',
            {
              class: 'btn small',
              style: { marginTop: '7px' },
              onClick: async () => {
                try {
                  await api.widgets.delete(error.fileId);
                  await reloadWidgets();
                  refresh();
                } catch (deleteError) {
                  notifyError(deleteError);
                }
              },
            },
            'Удалить файл'
          )
        )
      );
    }
    wrap.appendChild(section('Ошибки загрузки', errorList));
  }

  wrap.appendChild(
    section(
      'Создание виджетов',
      actionsRow(
        button(
          'Создать с AI',
          () => openWidgetStudio(refresh),
          { icon: 'sparkle', variant: 'primary' }
        ),
        button('Установить из кода', () => openInstallWidget(refresh), {
          icon: 'upload',
        }),
        button('Руководство и API', () => openWidgetGuide(), { icon: 'book' }),
        button(
          'Перезагрузить',
          async () => {
            try {
              await reloadWidgets();
              toast('Виджеты перезагружены');
              refresh();
            } catch (error) {
              notifyError(error);
            }
          },
          { icon: 'refresh' }
        ),
        button('Папка виджетов', () => api.app.openFolder('widgets'), {
          icon: 'folder',
        })
      ),
      note(
        'Встроить виджет в заметку: ::widget[stats] — откроется в предпросмотре. Настроить список виджетов можно здесь; свои виджеты лежат в userData/widgets и переносятся вместе с профилем.'
      )
    )
  );

  wrap.appendChild(
    note(
      'Безопасность: пользовательские виджеты выполняются в sandbox renderer без Node.js. Устанавливайте только код, которому доверяете.'
    )
  );

  return wrap;
}
