/**
 * Слаг GitHub-репозитория `owner/repo` для проверки обновлений
 * (`api.github.com/repos/${GITHUB_REPO}/releases/latest`).
 *
 * Пустая строка — «репозиторий ещё не настроен»: кнопка «Проверить обновления»
 * это распознаёт и ничего не запрашивает.
 */
export const GITHUB_REPO = 'Nqam/jlpt-app';

/** Страница релизов — открывается, когда доступна новая версия. */
export const releasesUrl = (): string =>
  GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases/latest` : '';
