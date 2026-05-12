import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles,
  Wand2,
  Film,
  Download,
  RotateCcw,
  Loader2,
  Check,
  Image as ImageIcon,
  Music,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { enhancePrompt, generateScenes, generateSceneImage } from "@/lib/reel.functions";
import { loadImage, renderReel } from "@/lib/render-reel";
import type { MusicStyle } from "@/lib/music";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Cinematic Reel Generator — Text to Cinematic Video" },
      {
        name: "description",
        content:
          "Turn a single text prompt into a downloadable cinematic AI reel. Auto storyboard, AI-generated scenes, motion, music, and MP4-style export.",
      },
      { property: "og:title", content: "AI Cinematic Reel Generator" },
      {
        property: "og:description",
        content: "Text → cinematic AI video reel in under a minute.",
      },
    ],
  }),
  component: ReelStudio,
});

const SUGGESTIONS = [
  "A futuristic cyberpunk city at night with neon rain",
  "Lone astronaut walking on a glowing alien desert",
  "Ancient temple swallowed by jungle at golden hour",
  "Underwater ruins lit by bioluminescent jellyfish",
];

type Stage = "idle" | "enhancing" | "scenes" | "images" | "rendering" | "done" | "error";

interface SceneData {
  title: string;
  prompt: string;
  imageUrl?: string;
}

const MAX_PROMPT = 280;
const MUSIC_OPTIONS: { id: MusicStyle; label: string; desc: string }[] = [
  { id: "cinematic", label: "Cinematic", desc: "Sweeping orchestral pad" },
  { id: "synthwave", label: "Synthwave", desc: "Retro neon pulse" },
  { id: "ambient", label: "Ambient", desc: "Drifting atmospheric drone" },
];

function ReelStudio() {
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [enhanced, setEnhanced] = useState<string>("");
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [music, setMusic] = useState<MusicStyle>("cinematic");
  const lastBlobUrl = useRef<string | null>(null);

  const enhanceFn = useServerFn(enhancePrompt);
  const scenesFn = useServerFn(generateScenes);
  const imageFn = useServerFn(generateSceneImage);

  const busy = stage !== "idle" && stage !== "done" && stage !== "error";
  const charsLeft = MAX_PROMPT - prompt.length;

  const reset = useCallback(() => {
    if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    lastBlobUrl.current = null;
    setStage("idle");
    setEnhanced("");
    setScenes([]);
    setRenderProgress(0);
    setVideoUrl(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    lastBlobUrl.current = null;
    setVideoUrl(null);
    setScenes([]);
    setRenderProgress(0);

    try {
      // 1. enhance
      setStage("enhancing");
      const { enhanced: e } = await enhanceFn({ data: { prompt: prompt.trim() } });
      setEnhanced(e);

      // 2. scenes
      setStage("scenes");
      const { scenes: sc } = await scenesFn({ data: { enhanced: e, count: 4 } });
      const initial: SceneData[] = sc.map((s) => ({ title: s.title, prompt: s.prompt }));
      setScenes(initial);

      // 3. images (parallel)
      setStage("images");
      const results = await Promise.all(
        initial.map(async (s, i) => {
          try {
            const { imageUrl } = await imageFn({
              data: {
                prompt: s.prompt,
                originalPrompt: prompt,
              },
            });
            setScenes((prev) => {
              const next = [...prev];
              next[i] = { ...next[i], imageUrl };
              return next;
            });
            return imageUrl;
          } catch (err) {
            console.error("image gen failed", err);
            throw err;
          }
        }),
      );

      // 4. render
      setStage("rendering");
      const imgs = await Promise.all(results.map((u) => loadImage(u)));
      const { url } = await renderReel({
        images: imgs,
        music,
        onProgress: setRenderProgress,
      });
      lastBlobUrl.current = url;
      setVideoUrl(url);
      setStage("done");
      toast.success("Your cinematic reel is ready");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      setStage("error");
    }
  }, [prompt, busy, music, enhanceFn, scenesFn, imageFn]);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <BackgroundAurora />

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-32 pt-16 sm:pt-24">
        <Hero />

        <section className="mt-14">
          <PromptCard
            prompt={prompt}
            setPrompt={setPrompt}
            charsLeft={charsLeft}
            busy={busy}
            onGenerate={handleGenerate}
            music={music}
            setMusic={setMusic}
          />
        </section>

        <AnimatePresence mode="wait">
          {stage !== "idle" && (
            <motion.section
              key="status"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-12"
            >
              <StatusPanel stage={stage} renderProgress={renderProgress} enhanced={enhanced} />
            </motion.section>
          )}
        </AnimatePresence>

        {scenes.length > 0 && (
          <section className="mt-12">
            <SceneGrid scenes={scenes} />
          </section>
        )}

        {videoUrl && stage === "done" && (
          <section className="mt-14">
            <VideoOutput url={videoUrl} onRegenerate={handleGenerate} onReset={reset} />
          </section>
        )}
      </main>

      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        Crafted for cinematic prompts · v1
      </footer>
    </div>
  );
}

/* ----------------- Hero ----------------- */
function Hero() {
  return (
    <div className="text-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur"
      >
        <Sparkles className="h-3 w-3 text-secondary" />
        AI Cinematic Reel Studio
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.7 }}
        className="mt-6 text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl md:text-7xl"
      >
        Create <span className="text-gradient">cinematic AI reels</span>
        <br /> from a single line of text.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.6 }}
        className="mx-auto mt-6 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg"
      >
        Type a scene. We'll storyboard it, generate cinematic frames, animate them with Ken Burns
        motion, score it with a soundtrack, and hand you a downloadable reel.
      </motion.p>
    </div>
  );
}

/* ----------------- Prompt card ----------------- */
function PromptCard(props: {
  prompt: string;
  setPrompt: (v: string) => void;
  charsLeft: number;
  busy: boolean;
  onGenerate: () => void;
  music: MusicStyle;
  setMusic: (m: MusicStyle) => void;
}) {
  const { prompt, setPrompt, charsLeft, busy, onGenerate, music, setMusic } = props;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.6 }}
      className="glass relative mx-auto w-full max-w-3xl rounded-3xl p-6 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-aurora opacity-40" />

      <label className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/90">
        <Wand2 className="h-4 w-4 text-secondary" />
        Describe your scene
      </label>

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT))}
        placeholder="A futuristic cyberpunk city at night, neon reflections, flying vehicles…"
        className="min-h-32 resize-none border-border/60 bg-background/40 text-base placeholder:text-muted-foreground/60 focus-visible:ring-primary"
        disabled={busy}
      />

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Tip: include lighting, mood, and camera framing.</span>
        <span className={cn(charsLeft < 30 && "text-secondary")}>{charsLeft} chars left</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => setPrompt(s)}
            className="rounded-full border border-border/60 bg-background/30 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Music className="h-4 w-4 text-secondary" /> Soundtrack
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {MUSIC_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              onClick={() => setMusic(m.id)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                music === m.id
                  ? "border-primary/70 bg-primary/10 ring-1 ring-primary/40"
                  : "border-border/60 bg-background/30 hover:border-primary/40",
                busy && "opacity-50",
              )}
            >
              <div className="text-sm font-medium text-foreground">{m.label}</div>
              <div className="text-xs text-muted-foreground">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-7 flex justify-end">
        <motion.div whileHover={{ scale: busy ? 1 : 1.02 }} whileTap={{ scale: busy ? 1 : 0.98 }}>
          <Button
            size="lg"
            disabled={busy || prompt.trim().length < 3}
            onClick={onGenerate}
            className="bg-gradient-cinematic font-medium text-primary-foreground shadow-lg hover:opacity-95 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate cinematic reel
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ----------------- Status ----------------- */
function StatusPanel({
  stage,
  renderProgress,
  enhanced,
}: {
  stage: Stage;
  renderProgress: number;
  enhanced: string;
}) {
  const order: Stage[] = ["enhancing", "scenes", "images", "rendering", "done"];
  const labels: Record<Stage, string> = {
    idle: "",
    enhancing: "Enhancing prompt",
    scenes: "Storyboarding scenes",
    images: "Generating cinematic frames",
    rendering: "Rendering reel",
    done: "Reel ready",
    error: "Something went wrong",
  };
  const currentIdx = order.indexOf(stage);

  return (
    <div className="glass mx-auto max-w-3xl rounded-2xl p-6">
      <div className="grid gap-3">
        {order.slice(0, 4).map((s, i) => {
          const done = i < currentIdx || stage === "done";
          const active = i === currentIdx && stage !== "done";
          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs",
                  done && "border-secondary/60 bg-secondary/15 text-secondary",
                  active && "border-primary/60 bg-primary/15 text-primary animate-pulse-glow",
                  !done && !active && "border-border/60 bg-background/40 text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : active ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-sm font-medium",
                    active
                      ? "text-foreground"
                      : done
                        ? "text-foreground/80"
                        : "text-muted-foreground",
                  )}
                >
                  {labels[s]}
                </div>
                {s === "rendering" && active && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className="h-full bg-gradient-cinematic transition-all"
                      style={{ width: `${Math.round(renderProgress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {enhanced && (
        <div className="mt-5 rounded-xl border border-border/40 bg-background/40 p-4 text-xs text-muted-foreground">
          <div className="mb-1 uppercase tracking-widest text-[10px] text-secondary">
            Enhanced prompt
          </div>
          <p className="text-sm text-foreground/85">{enhanced}</p>
        </div>
      )}
    </div>
  );
}

/* ----------------- Scene grid ----------------- */
function SceneGrid({ scenes }: { scenes: SceneData[] }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-secondary" />
        <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Storyboard
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scenes.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="group glass relative aspect-video overflow-hidden rounded-2xl"
          >
            {s.imageUrl ? (
              <img
                src={s.imageUrl}
                alt={s.title}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-background/30">
                <div className="absolute inset-0 shimmer" />
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-3">
              <div className="text-[10px] uppercase tracking-widest text-secondary">
                Scene {i + 1}
              </div>
              <div className="line-clamp-1 text-sm font-medium text-foreground">{s.title}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ----------------- Video output ----------------- */
function VideoOutput({
  url,
  onRegenerate,
  onReset,
}: {
  url: string;
  onRegenerate: () => void;
  onReset: () => void;
}) {
  const filename = useMemo(() => `cinematic-reel-${Date.now()}.webm`, [url]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass mx-auto max-w-4xl rounded-3xl p-5 sm:p-7"
    >
      <div className="mb-4 flex items-center gap-2">
        <Film className="h-4 w-4 text-secondary" />
        <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Your cinematic reel
        </h2>
      </div>
      <div className="ring-glow overflow-hidden rounded-2xl bg-black">
        <video src={url} controls autoPlay loop className="aspect-video w-full" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <Button variant="ghost" onClick={onReset}>
          <Play className="h-4 w-4" /> New prompt
        </Button>
        <Button variant="outline" onClick={onRegenerate}>
          <RotateCcw className="h-4 w-4" /> Regenerate
        </Button>
        <a href={url} download={filename}>
          <Button className="bg-gradient-cinematic text-primary-foreground">
            <Download className="h-4 w-4" /> Download reel
          </Button>
        </a>
      </div>
      <p className="mt-3 text-right text-xs text-muted-foreground">
        Exported as .webm · 1280×720 · ~14s
      </p>
    </motion.div>
  );
}

/* ----------------- Background ----------------- */
function BackgroundAurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0.4 }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 left-1/2 h-[60vh] w-[80vw] -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background: "radial-gradient(ellipse, oklch(0.62 0.24 295 / 0.45), transparent 60%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-[-20vh] right-[-10vw] h-[55vh] w-[55vw] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(ellipse, oklch(0.72 0.16 210 / 0.4), transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black, transparent 70%)",
        }}
      />
    </div>
  );
}
