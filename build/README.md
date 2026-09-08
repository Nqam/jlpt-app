# build/ — ресурсы сборки electron-builder (`buildResources`)

- `icon.svg` — исходник иконки приложения (кандзи 日, акцентный цвет проекта).
- `icon.ico` — собранная иконка Windows (7 размеров, 16–256 px). Коммитится;
  пересобирать при изменении `icon.svg`: `npm run make-icon`
  (рендер SVG → PNG через Chromium из @playwright/test, сборка .ico через
  png-to-ico; без сетевых загрузок).
