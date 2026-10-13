interface ImportMetaEnv {
  /** Optional built-in Gemini key, read from a git-ignored .env.local at build time. */
  readonly VITE_GEMINI_API_KEY?: string;
  /** OAuth client id (Web application type) used for "Sign in with Google", read from .env.local at build time. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
