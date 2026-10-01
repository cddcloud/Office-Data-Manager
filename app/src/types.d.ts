interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css'

declare module '*.mjs?url' {
  const url: string
  export default url
}
