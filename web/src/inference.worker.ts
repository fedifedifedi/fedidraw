/**
 * Runs the ONNX model off the main thread, so drawing and animations never wait for inference.
 */
import * as ort from 'onnxruntime-web/wasm';

export interface InitMessage {
  type: 'init';
  modelUrl: string;
  act1Channels: number[];
  act2Channels: number[];
}
export interface PredictMessage {
  type: 'predict';
  id: number;
  input: Float32Array;
}
export type WorkerReply =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; probs: Float32Array; maps: Float32Array[]; ms: number };

let session: ort.InferenceSession | null = null;
let act1Channels: number[] = [];
let act2Channels: number[] = [];

function reply(message: WorkerReply, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

function channel(data: Float32Array, index: number, size: number): Float32Array {
  return data.slice(index * size, (index + 1) * size);
}

self.addEventListener('message', async (event: MessageEvent<InitMessage | PredictMessage>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    try {
      ort.env.wasm.numThreads = 1; // the model is tiny; threads would need cross-origin isolation
      session = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ['wasm'] });
      act1Channels = msg.act1Channels;
      act2Channels = msg.act2Channels;
      reply({ type: 'ready' });
    } catch (error) {
      reply({ type: 'error', message: String(error) });
    }
    return;
  }

  if (!session) return;
  const start = performance.now();
  const out = await session.run({ input: new ort.Tensor('float32', msg.input, [1, 1, 28, 28]) });
  const probs = out.probs.data as Float32Array;
  const act1 = out.act1.data as Float32Array;
  const act2 = out.act2.data as Float32Array;
  const maps = [
    ...act1Channels.map((c) => channel(act1, c, 28 * 28)),
    ...act2Channels.map((c) => channel(act2, c, 14 * 14)),
  ];
  const result = { type: 'result' as const, id: msg.id, probs: probs.slice(), maps, ms: performance.now() - start };
  reply(result, [result.probs.buffer, ...maps.map((m) => m.buffer)]);
});
