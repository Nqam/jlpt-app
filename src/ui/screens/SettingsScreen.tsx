import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
import { useContentDb } from '@/ui/useContentDb';
import { getPlatformAdapter } from '@/platform';
import { isNewer } from '@/core/version';

const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; latest: string; url: string }
  | { kind: 'error' };

export function SettingsScreen() {
  const user = useUserDb();
  const content = useContentDb();
  const [newPerDay, setNewPerDay] = useState(user.getSetting('new_per_day', 5));
  const [reviewCap, setReviewCap] = useState(user.getSetting('review_queue_cap', 100));
  const [furigana, setFurigana] = useState(user.getSetting('furigana_enabled', true));
  const [status, setStatus] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' });
  // Bumped after a reset so the derived `markedByLevel` below is recomputed --
  // `user`/`content` are plain object refs, not reactive state.
  const [resetTick, setResetTick] = useState(0);

  const changeNewPerDay = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw)) || 1);
    setNewPerDay(n);
    user.setSetting('new_per_day', n);
  };

  const changeReviewCap = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw)) || 1);
    setReviewCap(n);
    user.setSetting('review_queue_cap', n);
  };

  const changeFurigana = (checked: boolean) => {
    setFurigana(checked);
    user.setSetting('furigana_enabled', checked);
  };

  const checkUpdate = async () => {
    setUpdate({ kind: 'checking' });
    try {
      const res = await getPlatformAdapter().checkForUpdate();
      if (!res) {
        setUpdate({ kind: 'error' });
        return;
      }
      setUpdate(
        isNewer(res.latest, APP_VERSION)
          ? { kind: 'available', latest: res.latest, url: res.url }
          : { kind: 'current' },
      );
    } catch {
      setUpdate({ kind: 'error' });
    }
  };

  const exportDb = async () => {
    setStatus(null);
    try {
      const ok = await getPlatformAdapter().exportUserDb(user.export());
      if (ok) setStatus('Резервная копия сохранена.');
    } catch {
      setStatus('Не удалось сохранить резервную копию.');
    }
  };

  const importDb = async () => {
    setStatus(null);
    if (!window.confirm('Это заменит весь текущий прогресс. Продолжить?')) return;
    try {
      const bytes = await getPlatformAdapter().importUserDb();
      if (!bytes) return;
      const valid = await user.validateImportBytes(bytes);
      if (!valid) {
        setStatus('Файл повреждён или не является резервной копией Kotsukotsu.');
        return;
      }
      await getPlatformAdapter().writeUserDb(bytes);
      window.location.reload();
    } catch {
      setStatus('Не удалось прочитать или записать файл.');
    }
  };

  // Which grammar levels have placement-marked cards, and how many per level --
  // recomputed every render (cheap, small list) so it reflects the latest reset.
  const markedIds = user.getSetting<string[]>('placement_marked_ids', []);
  const markedByLevel = new Map<string, string[]>();
  for (const id of markedIds) {
    const point = content.getGrammar(id);
    if (!point) continue;
    const arr = markedByLevel.get(point.level) ?? [];
    arr.push(id);
    markedByLevel.set(point.level, arr);
  }
  void resetTick; // referenced only to justify the re-render it triggers

  const resetLevel = (levelCode: string) => {
    const ids = markedByLevel.get(levelCode) ?? [];
    if (ids.length === 0) return;
    if (!window.confirm(`Сбросить результаты вступительного теста для ${levelCode}?`)) return;
    for (const id of ids) user.deleteCard('grammar', id);
    const remaining = markedIds.filter((id) => !ids.includes(id));
    user.setSetting('placement_marked_ids', remaining);
    setResetTick((t) => t + 1);
  };

  return (
    <section className="screen settings">
      <h1>Настройки</h1>

      <div className="settings-field">
        <label htmlFor="new-per-day">Новых карточек в день</label>
        <input
          id="new-per-day"
          type="number"
          min={1}
          value={newPerDay}
          onChange={(e) => changeNewPerDay(e.target.value)}
        />
      </div>

      <div className="settings-field">
        <label htmlFor="review-cap">Предел повторений в очереди</label>
        <input
          id="review-cap"
          type="number"
          min={1}
          value={reviewCap}
          onChange={(e) => changeReviewCap(e.target.value)}
        />
      </div>

      <div className="settings-field settings-field-checkbox">
        <label htmlFor="furigana-enabled">
          <input
            id="furigana-enabled"
            type="checkbox"
            checked={furigana}
            onChange={(e) => changeFurigana(e.target.checked)}
          />
          Показывать фуригану
        </label>
      </div>

      <div className="settings-backup">
        <h2>Резервная копия</h2>
        <button type="button" className="btn-ghost" onClick={exportDb}>
          Экспортировать
        </button>
        <button type="button" className="btn-ghost" onClick={importDb}>
          Импортировать
        </button>
        {status && <p className="settings-status">{status}</p>}
      </div>

      <div className="settings-updates">
        <h2>Обновления</h2>
        <p className="muted">Установленная версия: {APP_VERSION}</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={checkUpdate}
          disabled={update.kind === 'checking'}
        >
          {update.kind === 'checking' ? 'Проверяю…' : 'Проверить обновления'}
        </button>
        {update.kind === 'current' && (
          <p className="settings-status">Установлена последняя версия ({APP_VERSION}).</p>
        )}
        {update.kind === 'error' && (
          <p className="settings-status">Не удалось проверить обновления (нет сети?).</p>
        )}
        {update.kind === 'available' && (
          <div className="settings-update-available">
            <p className="settings-status">
              Доступна версия {update.latest.replace(/^v/i, '')}.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => getPlatformAdapter().openExternal(update.url)}
            >
              Открыть страницу загрузки
            </button>
          </div>
        )}
      </div>

      <div className="settings-placement">
        <h2>Вступительный тест</h2>
        <Link className="btn-ghost" to="/placement">
          Пройти вступительный тест заново
        </Link>
        {markedByLevel.size > 0 && (
          <div className="settings-placement-reset">
            {[...markedByLevel.entries()].map(([levelCode, levelIds]) => (
              <button
                key={levelCode}
                type="button"
                className="btn-ghost"
                onClick={() => resetLevel(levelCode)}
              >
                Сбросить результаты {levelCode} ({levelIds.length})
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
