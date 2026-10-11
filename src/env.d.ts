interface ImportMetaEnv {
  /** Optional built-in Gemini key, read from a git-ignored .env.local at build time. */
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
