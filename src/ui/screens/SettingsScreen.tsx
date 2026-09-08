import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserDb } from '@/ui/useUserDb';
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
  const [newPerDay, setNewPerDay] = useState(user.getSetting('new_per_day', 5));
  const [reviewCap, setReviewCap] = useState(user.getSetting('review_queue_cap', 100));
  const [furigana, setFurigana] = useState(user.getSetting('furigana_enabled', true));
  const [status, setStatus] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateState>({ kind: 'idle' });
  // Bumped after a reset so the derived `markedByType` below is recomputed --
  // `user` is a plain object ref, not reactive state.
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

  // Per-type placement-marked ids — recomputed every render (cheap, small lists).
  const TYPES: { type: 'grammar' | 'kanji' | 'vocab'; label: string }[] = [
    { type: 'grammar', label: 'грамматика' },
    { type: 'kanji', label: 'кандзи' },
    { type: 'vocab', label: 'слова' },
  ];
  const markedByType = new Map<'grammar' | 'kanji' | 'vocab', string[]>();
  for (const { type } of TYPES) {
    markedByType.set(type, user.getSetting<string[]>(`placement_marked_${type}_ids`, []));
  }
  void resetTick; // referenced only to justify the re-render it triggers

  const resetType = (type: 'grammar' | 'kanji' | 'vocab', label: string) => {
    const ids = markedByType.get(type) ?? [];
    if (ids.length === 0) return;
    if (!window.confirm(`Сбросить результаты теста по разделу «${label}»?`)) return;
    for (const id of ids) user.deleteCard(type, id);
    user.setSetting(`placement_marked_${type}_ids`, []);
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
        {TYPES.map(({ type, label }) => (
          <Link key={type} className="btn-ghost" to={`/placement/${type}`}>
            Тест: {label}
          </Link>
        ))}
        {TYPES.some(({ type }) => (markedByType.get(type) ?? []).length > 0) && (
          <div className="settings-placement-reset">
            {TYPES.filter(({ type }) => (markedByType.get(type) ?? []).length > 0).map(
              ({ type, label }) => (
                <button
                  key={type}
                  type="button"
                  className="btn-ghost"
                  onClick={() => resetType(type, label)}
                >
                  Сбросить тест: {label} ({markedByType.get(type)!.length})
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
