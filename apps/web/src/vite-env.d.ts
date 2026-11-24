/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'desktop' inside the Windows app. */
  readonly VITE_TARGET?: string;
  /** API origin for the Windows app. Empty = same origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
