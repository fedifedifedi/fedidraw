import type { PreprocessParams } from './preprocess';

export interface ClassInfo {
  id: string;
  en: string;
  fr: string;
}

/** public/model/labels.json, written by training/export_onnx.py. */
export interface Labels {
  model: string;
  classes: ClassInfo[];
  input: { name: string; shape: number[]; normalization: { mean: number; std: number; applied_in_model: boolean } };
  outputs: Record<'probs' | 'act1' | 'act2', number[]>;
  preprocessing: PreprocessParams;
  brain: { act1_channels: number[]; act2_channels: number[] };
}

export function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href;
}

export async function loadLabels(): Promise<Labels> {
  const response = await fetch(assetUrl('model/labels.json'));
  if (!response.ok) throw new Error(`labels.json: HTTP ${response.status}`);
  return response.json() as Promise<Labels>;
}

let samples: Promise<Record<string, Uint8Array[]>> | null = null;

/** A few real Quick Draw test drawings per class (debug panel), loaded on first use. */
export function loadSamples(): Promise<Record<string, Uint8Array[]>> {
  samples ??= fetch(assetUrl('model/samples.json'))
    .then((r) => r.json() as Promise<Record<string, string[]>>)
    .then((raw) =>
      Object.fromEntries(
        Object.entries(raw).map(([id, list]) => [id, list.map((b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))]),
      ),
    );
  return samples;
}
