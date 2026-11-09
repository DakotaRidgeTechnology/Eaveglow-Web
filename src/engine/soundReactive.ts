/** Browser-side sound reactive mode using Web Audio API. */

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let rafId: number | null = null;

export async function startSoundReactive(
  onUpdate: (bri: number, cct: number) => void
): Promise<boolean> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let lastUpdate = 0;

    const tick = () => {
      if (!analyser) return;
      analyser.getByteFrequencyData(data);
      // Bass = low bins, mid = middle, treble = high
      const bass = data.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
      const treble = data.slice(32, 64).reduce((a, b) => a + b, 0) / 32;

      const bri = Math.min(255, Math.round((bass / 255) * 255));
      const cct = Math.min(255, Math.round((treble / 255) * 255));

      const now = Date.now();
      if (now - lastUpdate > 200) {
        lastUpdate = now;
        onUpdate(bri, cct);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return true;
  } catch {
    return false;
  }
}

export function stopSoundReactive() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (audioCtx) audioCtx.close();
  audioCtx = null;
  analyser = null;
}
