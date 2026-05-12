import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* ------------------------------------------------ */
/* PROMPT ENHANCEMENT */
/* ------------------------------------------------ */

export const enhancePrompt = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string }) =>
    z.object({
      prompt: z.string().min(3).max(500),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("Missing GROQ_API_KEY");
    }

    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "system",
                content: "You are an AI cinematic prompt enhancer for image generation. Keep the MAIN SUBJECT as the primary focus at the START of the prompt. Enhance prompts with cinematic lighting, composition, atmosphere, camera framing, color grading, and visual detail while preserving the user's original intent clearly. Do NOT turn prompts into screenplay scripts. Do NOT use EXT., INT., dialogue, narration, or scene directions. Keep responses concise, visual, and optimized for AI image generation. Maximum 40 words.",
              },
              {
                role: "user",
                content: data.prompt,
              },
            ],
            temperature: 0.9,
            max_tokens: 200,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(errorText);

        throw new Error("Groq enhancement failed");
      }

      const json = await response.json();

      const enhanced =
        json.choices?.[0]?.message?.content?.trim() ??
        data.prompt;

      return {
        enhanced,
      };
    } catch (err) {
      console.error(err);

      return {
        enhanced: `
          Cinematic movie scene of ${data.prompt},
          atmospheric storytelling,
          dramatic lighting,
          immersive environment,
          emotional cinematic mood
        `,
      };
    }
  });

/* ------------------------------------------------ */
/* SCENE GENERATION */
/* ------------------------------------------------ */

export const generateScenes = createServerFn({ method: "POST" })
  .inputValidator((d: { enhanced: string }) =>
    z.object({
      enhanced: z.string(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const subject = data.enhanced;

    return {
      scenes: [
        {
          title: "Environment Reveal",
          prompt: `
            cinematic wide-angle establishing shot of ${subject},
            massive environmental scale,
            atmospheric depth,
            volumetric lighting,
            dramatic scenery,
            cinematic framing,
            highly detailed,
            movie still,
            16:9 composition
          `,
        },

        {
          title: "Hero Introduction",
          prompt: `
            cinematic medium shot of ${subject},
            character-focused composition,
            dramatic rim lighting,
            emotional atmosphere,
            shallow depth of field,
            rain particles,
            highly detailed cinematic portrait,
            movie still
          `,
        },

        {
          title: "Dynamic Action",
          prompt: `
            cinematic low-angle action shot of ${subject},
            dynamic movement,
            motion blur,
            dramatic action pose,
            sparks and particles,
            intense lighting,
            cinematic energy,
            ultra detailed action scene
          `,
        },

        {
          title: "Final Cinematic Shot",
          prompt: `
            cinematic silhouette shot of ${subject},
            emotional ending frame,
            atmospheric smoke,
            dramatic backlight,
            cinematic masterpiece composition,
            epic movie ending,
            highly detailed,
            emotional cinematic atmosphere
          `,
        },
      ],
    };
  });

/* ------------------------------------------------ */
/* IMAGE GENERATION */
/* ------------------------------------------------ */

export const generateSceneImage = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string; originalPrompt?: string }) =>
    z.object({
      prompt: z.string().min(3).max(2000),
      originalPrompt: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.STABILITY_API_KEY;

    /* -------------------------------------------- */
    /* TRY STABILITY AI FIRST */
    /* -------------------------------------------- */

    if (apiKey && apiKey.trim() !== "") {
      try {
        const response = await fetch(
          "https://api.stability.ai/v2beta/stable-image/generate/core",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
            body: (() => {
              const formData = new FormData();

              formData.append(
                "prompt",
                `${data.prompt}, cinematic movie still, ultra detailed, masterpiece`,
              );

              formData.append("output_format", "jpeg");
              formData.append("aspect_ratio", "16:9");

              return formData;
            })(),
          },
        );

        if (response.ok) {
          const json = await response.json();

          return {
            imageUrl: `data:image/jpeg;base64,${json.image}`,
          };
        }

        console.error(await response.text());
      } catch (err) {
        console.error("Stability failed:", err);
      }
    }

    /* -------------------------------------------- */
    /* FALLBACK TO POLLINATIONS (SERVER PROXY) */
    /* -------------------------------------------- */

    try {
      const fallbackPrompt =
        data.originalPrompt || data.prompt;

      const encoded = encodeURIComponent(
        `${fallbackPrompt}, cinematic lighting, movie still`
      );

      const pollinationsUrl =
        `https://image.pollinations.ai/prompt/${encoded}?model=turbo`;

      const imageResponse = await fetch(pollinationsUrl);

      if (imageResponse.ok) {
        const arrayBuffer = await imageResponse.arrayBuffer();

        const base64 = Buffer.from(arrayBuffer).toString("base64");

        const contentType =
          imageResponse.headers.get("content-type") || "image/jpeg";

        return {
          imageUrl: `data:${contentType};base64,${base64}`,
        };
      }

      console.error("Pollinations fetch failed");
    } catch (err) {
      console.error("Pollinations fallback failed:", err);
    }

    /* -------------------------------------------- */
    /* FINAL FALLBACK TO PICSUM */
    /* -------------------------------------------- */

    console.log("Using Picsum fallback");

    const seed = encodeURIComponent(data.prompt);

    return {
      imageUrl: `https://picsum.photos/seed/${seed}/1280/720`,
    };
  });