/** Official locale runtime exposed to DOM fixtures. */
export interface FixtureLocale {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
  subscribe(listener: () => void): () => void
  getSnapshot(): unknown
  getLocale(): { active: string }
  setLocale(locale: string): Promise<void>
}
export function createOfficialLocale(initial?: string): Promise<FixtureLocale>
