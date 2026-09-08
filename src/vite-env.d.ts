// Renderer build-time constants injected via `define` in electron.vite.config.ts.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
