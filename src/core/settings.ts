import { DEFAULT_MODEL, MODELS } from '../assess/reader';

export type Mode = 'anthropic' | 'ollama' | 'codex' | 'claude' | 'none';

/** Provider and model from stored settings, tolerant of FORMA 1.x settings. */
export function providerOf(settings: any): { mode: Mode; model: string } {
  const mode: Mode = settings?.mode === 'ollama' || settings?.mode === 'none' || settings?.mode === 'codex' || settings?.mode === 'claude' ? settings.mode : 'anthropic';
  const model = mode === 'anthropic' ? (MODELS.some(m => m.id === settings?.model) ? settings.model : DEFAULT_MODEL) : mode === 'ollama' ? String(settings?.model || '') : '';
  return { mode, model };
}
