/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADVERTISER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
