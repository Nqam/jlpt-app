import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
const DEFAULT_THEME: Theme = 'system';
const STORAGE_KEY = 'jlmp.theme';

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** Читает сохранённую тему. Никогда не бросает: недоступный/битый localStorage → тема по умолчанию. */
function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Пишет тему. Никогда не бросает: если запись недоступна — тема работает в рамках сессии, но не сохраняется. */
function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage недоступен — молча продолжаем */
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  useEffect(() => {
    writeStoredTheme(theme);
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label: Record<Theme, string> = {
    system: 'Тема: как в системе',
    light: 'Тема: светлая',
    dark: 'Тема: тёмная',
  };
  return (
    <button className="theme-toggle" onClick={() => setTheme(next[theme])}>
      {label[theme]}
    </button>
  );
}
