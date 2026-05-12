/* Procedural cinematic background music via Web Audio API.
 * Returns an AudioNode connected to a MediaStreamDestination so we can
 * mux it into MediaRecorder alongside the canvas video stream. */

export type MusicStyle = "cinematic" | "synthwave" | "ambient";

export interface MusicSession {
  ctx: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  stop: () => void;
}

const STYLES: Record<MusicStyle, { root: number; chord: number[]; tempo: number; wave: OscillatorType }> = {
  cinematic: { root: 110, chord: [0, 7, 12, 16], tempo: 60, wave: "sine" },
  synthwave: { root: 130.81, chord: [0, 4, 7, 11], tempo: 92, wave: "sawtooth" },
  ambient:   { root: 98,  chord: [0, 5, 7, 12], tempo: 48, wave: "triangle" },
};

export function startMusic(style: MusicStyle, ctx?: AudioContext): MusicSession {
  const audio = ctx ?? new AudioContext();
  const dest = audio.createMediaStreamDestination();
  const master = audio.createGain();
  master.gain.value = 0.32;
  master.connect(dest);
  master.connect(audio.destination);

  // gentle reverb-ish via delay feedback
  const delay = audio.createDelay();
  delay.delayTime.value = 0.38;
  const fb = audio.createGain();
  fb.gain.value = 0.32;
  delay.connect(fb).connect(delay);
  delay.connect(master);

  const { root, chord, wave } = STYLES[style];
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  // Pad chord
  chord.forEach((semi, i) => {
    const o = audio.createOscillator();
    o.type = wave;
    o.frequency.value = root * Math.pow(2, semi / 12);
    const g = audio.createGain();
    g.gain.value = 0;
    o.connect(g).connect(master);
    g.connect(delay);
    o.start();
    // slow swell
    const t = audio.currentTime;
    g.gain.linearRampToValueAtTime(0.08 + i * 0.015, t + 1.2);
    oscs.push(o);
    gains.push(g);
  });

  // Gentle bass pulse
  const bass = audio.createOscillator();
  bass.type = "sine";
  bass.frequency.value = root / 2;
  const bassG = audio.createGain();
  bassG.gain.value = 0.0;
  bass.connect(bassG).connect(master);
  bass.start();
  const beat = 60 / STYLES[style].tempo;
  let beatTimer: number | null = window.setInterval(() => {
    const now = audio.currentTime;
    bassG.gain.cancelScheduledValues(now);
    bassG.gain.setValueAtTime(0.0, now);
    bassG.gain.linearRampToValueAtTime(0.18, now + 0.05);
    bassG.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.9);
  }, beat * 1000);

  return {
    ctx: audio,
    destination: dest,
    stop: () => {
      if (beatTimer !== null) { clearInterval(beatTimer); beatTimer = null; }
      const t = audio.currentTime;
      gains.forEach((g) => g.gain.linearRampToValueAtTime(0, t + 0.5));
      bassG.gain.linearRampToValueAtTime(0, t + 0.5);
      setTimeout(() => {
        oscs.forEach((o) => { try { o.stop(); } catch { /* noop */ } });
        try { bass.stop(); } catch { /* noop */ }
      }, 600);
    },
  };
}
