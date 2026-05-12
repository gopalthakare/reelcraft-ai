/* Cinematic Reel Renderer V2
 * Browser-native cinematic reel rendering engine
 * with motion, transitions, soundtrack, overlays,
 * and downloadable WebM export.
 */

import { startMusic, type MusicStyle } from "./music";

export interface RenderOptions {
  images: HTMLImageElement[];
  width?: number;
  height?: number;
  perSceneSeconds?: number;
  crossfadeSeconds?: number;
  music?: MusicStyle;
  onProgress?: (p: number) => void;
}

export interface RenderResult {
  blob: Blob;
  url: string;
  mimeType: string;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = reject;

    img.src = src;
  });
}

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  for (const m of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(m)
    ) {
      return m;
    }
  }

  return "video/webm";
}

/* ------------------------------------------------ */
/* CINEMATIC DRAW ENGINE */
/* ------------------------------------------------ */

function drawScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  progress: number,
  variant: number,
  alpha: number,
) {
  ctx.save();

  ctx.globalAlpha = alpha;

  // cinematic easing
  const ease = 1 - Math.pow(1 - progress, 3);

  // cover-fit sizing
  const imgRatio = img.width / img.height;
  const canvasRatio = w / h;

  let baseW: number;
  let baseH: number;

  if (imgRatio > canvasRatio) {
    baseH = h;
    baseW = h * imgRatio;
  } else {
    baseW = w;
    baseH = w / imgRatio;
  }

  /* -------------------------------------------- */
  /* MOTION SYSTEM */
  /* -------------------------------------------- */

  // smoother cinematic zoom
  const zoom = 1 + 0.08 * ease;

  const drawW = baseW * zoom;
  const drawH = baseH * zoom;

  // cinematic directional pans
  const dirs = [
    [-30, -15],
    [30, -10],
    [-20, 20],
    [20, 10],
  ];

  const [dx, dy] = dirs[variant % dirs.length];

  const panX = dx * ease;
  const panY = dy * ease;

  // subtle handheld camera shake
  const shakeX = Math.sin(progress * 18) * 0.8;
  const shakeY = Math.cos(progress * 14) * 0.8;

  const x = (w - drawW) / 2 + panX + shakeX;
  const y = (h - drawH) / 2 + panY + shakeY;

  /* -------------------------------------------- */
  /* TRANSITION BLUR */
  /* -------------------------------------------- */

  const blur =
    progress < 0.06
      ? (1 - progress / 0.06) * 3
      : progress > 0.94
        ? ((progress - 0.94) / 0.06) * 3
        : 0;

  ctx.filter = `
    blur(${blur}px)
    contrast(1.08)
    saturate(1.12)
    brightness(0.96)
  `;

  ctx.drawImage(img, x, y, drawW, drawH);

  ctx.filter = "none";

  /* -------------------------------------------- */
  /* CINEMATIC VIGNETTE */
  /* -------------------------------------------- */

  const grad = ctx.createRadialGradient(
    w / 2,
    h / 2,
    w * 0.25,
    w / 2,
    h / 2,
    w * 0.75,
  );

  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.62)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  /* -------------------------------------------- */
  /* FILM GRAIN */
  /* -------------------------------------------- */

  for (let i = 0; i < 60; i++) {
    const gx = Math.random() * w;
    const gy = Math.random() * h;

    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;

    ctx.fillRect(gx, gy, 1, 1);
  }

  /* -------------------------------------------- */
  /* CINEMATIC BLACK BARS */
  /* -------------------------------------------- */

  ctx.fillStyle = "black";

  ctx.fillRect(0, 0, w, 45);
  ctx.fillRect(0, h - 45, w, 45);

  ctx.restore();
}

/* ------------------------------------------------ */
/* MAIN RENDERER */
/* ------------------------------------------------ */

export async function renderReel(
  opts: RenderOptions,
): Promise<RenderResult> {
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;

  const per = opts.perSceneSeconds ?? 3.5;
  const xfade = opts.crossfadeSeconds ?? 0.7;

  const fps = 30;

  const canvas = document.createElement("canvas");

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0B0F19";
  ctx.fillRect(0, 0, W, H);

  /* -------------------------------------------- */
  /* STREAM SETUP */
  /* -------------------------------------------- */

  const videoStream = canvas.captureStream(fps);

  const music = opts.music
    ? startMusic(opts.music)
    : null;

  const tracks = [...videoStream.getVideoTracks()];

  if (music) {
    tracks.push(
      ...music.destination.stream.getAudioTracks(),
    );
  }

  const stream = new MediaStream(tracks);

  /* -------------------------------------------- */
  /* HIGHER QUALITY EXPORT */
  /* -------------------------------------------- */

  const mimeType = pickMime();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 10_000_000,
  });

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(250);

  const total = opts.images.length * per;

  const start = performance.now();

  /* -------------------------------------------- */
  /* FRAME LOOP */
  /* -------------------------------------------- */

  await new Promise<void>((resolve) => {
    function frame() {
      const elapsed =
        (performance.now() - start) / 1000;

      if (elapsed >= total) {
        resolve();
        return;
      }

      const idx = Math.min(
        opts.images.length - 1,
        Math.floor(elapsed / per),
      );

      const localT = elapsed - idx * per;

      const localP = Math.min(
        1,
        localT / per,
      );

      ctx.fillStyle = "#0B0F19";
      ctx.fillRect(0, 0, W, H);

      /* current scene */

      drawScene(
        ctx,
        opts.images[idx],
        W,
        H,
        localP,
        idx,
        1,
      );

      /* crossfade next scene */

      if (
        idx < opts.images.length - 1 &&
        per - localT < xfade
      ) {
        const fadeP =
          1 - (per - localT) / xfade;

        // subtle flash transition
        ctx.fillStyle = `rgba(255,255,255,${
          fadeP * 0.08
        })`;

        ctx.fillRect(0, 0, W, H);

        drawScene(
          ctx,
          opts.images[idx + 1],
          W,
          H,
          0,
          idx + 1,
          fadeP,
        );
      }

      opts.onProgress?.(elapsed / total);

      requestAnimationFrame(frame);
    }

    frame();
  });

  recorder.stop();

  await stopped;

  music?.stop();

  const blob = new Blob(chunks, {
    type: mimeType,
  });

  return {
    blob,
    url: URL.createObjectURL(blob),
    mimeType,
  };
}