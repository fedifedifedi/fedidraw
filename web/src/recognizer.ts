import type { InitMessage, PredictMessage, WorkerReply } from './inference.worker';
import { assetUrl, type Labels } from './labels';

export interface Prediction {
  /** Model input that produced this prediction (28x28, 0..1). */
  input: Float32Array;
  probs: Float32Array;
  /** Selected activation maps: layer-1 channels (28x28) then layer-2 channels (14x14). */
  maps: Float32Array[];
  ms: number;
}

/**
 * Client for the inference worker. While the model is busy, a newer drawing replaces
 * the queued one; the replaced request resolves to null.
 */
export class Recognizer {
  readonly ready: Promise<void>;
  private readonly worker: Worker;
  private nextId = 0;
  private inFlight: { id: number; input: Float32Array; resolve: (p: Prediction | null) => void } | null = null;
  private queued: { input: Float32Array; resolve: (p: Prediction | null) => void } | null = null;

  constructor(labels: Labels) {
    this.worker = new Worker(new URL('./inference.worker.ts', import.meta.url), { type: 'module' });
    this.ready = new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerReply>) => {
        if (event.data.type === 'ready') resolve();
        else if (event.data.type === 'error') reject(new Error(event.data.message));
        else this.onResult(event.data);
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', (e) => reject(new Error(e.message)));
    });
    const init: InitMessage = {
      type: 'init',
      modelUrl: assetUrl(`model/${labels.model}`),
      act1Channels: labels.brain.act1_channels,
      act2Channels: labels.brain.act2_channels,
    };
    this.worker.postMessage(init);
  }

  predict(input: Float32Array): Promise<Prediction | null> {
    return new Promise((resolve) => {
      this.queued?.resolve(null);
      this.queued = { input, resolve };
      this.pump();
    });
  }

  private pump(): void {
    if (this.inFlight || !this.queued) return;
    const { input, resolve } = this.queued;
    this.queued = null;
    const id = ++this.nextId;
    this.inFlight = { id, input, resolve };
    const message: PredictMessage = { type: 'predict', id, input: input.slice() };
    this.worker.postMessage(message, [message.input.buffer]);
  }

  private onResult(result: Extract<WorkerReply, { type: 'result' }>): void {
    const done = this.inFlight;
    this.inFlight = null;
    if (done && done.id === result.id) {
      // Delivered even if a newer drawing is queued: a slightly late answer beats none while drawing fast.
      done.resolve({ input: done.input, probs: result.probs, maps: result.maps, ms: result.ms });
    }
    this.pump();
  }
}
