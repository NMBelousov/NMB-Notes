import { h } from '../../dom.js';

const DURATIONS = { focus: 25 * 60, break: 5 * 60 };

function format(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export default {
  id: 'focus-timer',
  name: 'Таймер фокуса',
  description: 'Помодоро 25/5 с сохранением состояния',
  icon: '⏱️',
  version: '1.0.0',
  render(container, ctx) {
    const store = ctx.storage;
    let mode = store.get('mode', 'focus') === 'break' ? 'break' : 'focus';
    let running = store.get('running', false) === true;
    let endAt = Number(store.get('endAt', 0)) || 0;
    let remaining = Number(store.get('remaining', DURATIONS[mode])) || DURATIONS[mode];
    let interval = null;

    const ring = h('div', { class: 'w-timer-ring' });
    const timeEl = h('span', { class: 'w-timer-time' });
    ring.appendChild(timeEl);
    const modeEl = h('div', { class: 'w-timer-mode' });
    const subEl = h('div', { class: 'w-timer-sub' });
    const startBtn = h('button', { class: 'btn primary small' });
    const resetBtn = h('button', { class: 'btn small', text: 'Сброс' });
    const switchBtn = h('button', { class: 'btn small', text: 'Сменить' });
    const side = h(
      'div',
      { class: 'w-timer-side' },
      modeEl,
      subEl,
      h('div', { class: 'w-timer-btns' }, startBtn, resetBtn, switchBtn)
    );
    container.appendChild(h('div', { class: 'w-timer' }, ring, side));

    const currentRemaining = () => {
      if (running && endAt) {
        return Math.max(0, (endAt - Date.now()) / 1000);
      }
      return remaining;
    };

    const persist = () => {
      store.set('mode', mode);
      store.set('running', running);
      store.set('endAt', endAt);
      store.set('remaining', remaining);
    };

    const paint = () => {
      const total = DURATIONS[mode];
      const left = currentRemaining();
      timeEl.textContent = format(left);
      modeEl.textContent = mode === 'focus' ? 'Фокус · 25 минут' : 'Перерыв · 5 минут';
      const progress = Math.min(100, Math.max(0, (1 - left / total) * 100));
      ring.style.setProperty('--progress', progress.toFixed(1));
      startBtn.textContent = running ? 'Пауза' : 'Старт';
      subEl.textContent = running
        ? mode === 'focus'
          ? 'Не отвлекайтесь — всё остальное подождёт.'
          : 'Встаньте, разомнитесь, попейте воды.'
        : `Осталось ${format(left)} из ${format(total)}`;
    };

    const finish = () => {
      running = false;
      endAt = 0;
      ctx.notify(
        mode === 'focus' ? 'Фокус завершён. Время отдохнуть!' : 'Перерыв завершён. Можно работать.',
        'success'
      );
      mode = mode === 'focus' ? 'break' : 'focus';
      remaining = DURATIONS[mode];
      persist();
      paint();
    };

    const tick = () => {
      const left = currentRemaining();
      if (running && left <= 0) {
        finish();
        return;
      }
      paint();
    };

    const startInterval = () => {
      clearInterval(interval);
      interval = setInterval(tick, 500);
    };

    startBtn.addEventListener('click', () => {
      if (running) {
        remaining = currentRemaining();
        running = false;
        endAt = 0;
      } else {
        running = true;
        endAt = Date.now() + remaining * 1000;
      }
      persist();
      paint();
    });

    resetBtn.addEventListener('click', () => {
      running = false;
      endAt = 0;
      remaining = DURATIONS[mode];
      persist();
      paint();
    });

    switchBtn.addEventListener('click', () => {
      running = false;
      endAt = 0;
      mode = mode === 'focus' ? 'break' : 'focus';
      remaining = DURATIONS[mode];
      persist();
      paint();
    });

    if (running && (!endAt || endAt <= Date.now())) {
      if (endAt && endAt <= Date.now()) {
        finish();
      } else {
        running = false;
        remaining = DURATIONS[mode];
        persist();
      }
    }
    paint();
    startInterval();
    const off = ctx.on('note:selected', paint);
    return () => {
      clearInterval(interval);
      off();
      persist();
    };
  },
};
