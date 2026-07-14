const { uploadImageBuffer } = require('../cloudinary');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

function buildVoiceSection(voice) {
  if (!voice) return '';
  const parts = [];
  if (voice.summary) {
    parts.push(`Brand voice summary: ${voice.summary}`);
  }
  if (voice.approved?.length) {
    parts.push(
      `Match the style, tone, and voice of these captions the user approved:\n${voice.approved
        .map((c) => `- ${c}`)
        .join('\n')}`
    );
  }
  if (voice.rejected?.length) {
    parts.push(
      `Avoid the style and content patterns of these captions the user rejected:\n${voice.rejected
        .map((c) => `- ${c}`)
        .join('\n')}`
    );
  }
  if (voice.edits?.length) {
    parts.push(
      `The user has given these standing preferences when editing content - respect them:\n${voice.edits
        .map((e) => `- ${e}`)
        .join('\n')}`
    );
  }
  if (parts.length === 0) return '';
  return `\n\nBRAND VOICE (learned from this user's editorial history):\n${parts.join('\n\n')}`;
}

async function generateCaptionAndPrompt(project, voice) {
  const prompt = `You are a marketing assistant for an indie app called "${project.name}". App description: "${project.description}".
Return ONLY raw JSON (no markdown fences, no extra text) in this exact shape: {"caption": "...", "imagePrompt": "..."}.
"caption" is a short, friendly social media caption promoting the app (max 2 sentences, can include relevant emoji).
"imagePrompt" is a vivid, detailed prompt for an AI image generator to create a promotional image for this app (describe subject, style, and mood; do not request any text or words to appear in the image).${buildVoiceSection(voice)}`;

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini text generation failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini text generation returned no content');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed.caption || !parsed.imagePrompt) {
    throw new Error('Gemini text generation returned malformed JSON');
  }

  return { caption: parsed.caption, imagePrompt: parsed.imagePrompt };
}

async function generateImageBuffer(imagePrompt) {
  // ponytail: gemini-2.5-flash-image occasionally returns a text-only response
  // with no image for no deterministic reason (confirmed by re-running an
  // identical failing prompt 6/6 successfully). One retry is the standard
  // mitigation for this kind of model flakiness, not a rate-limit backoff.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await fetch(
      `${API_BASE}/${IMAGE_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: imagePrompt }] }] }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini image generation failed with status ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData);
    if (imagePart) {
      return Buffer.from(imagePart.inlineData.data, 'base64');
    }
  }

  throw new Error('Gemini image generation returned no image data after retry');
}

async function generateGeminiContent(project, voice = null) {
  const { caption, imagePrompt } = await generateCaptionAndPrompt(project, voice);
  const imageBuffer = await generateImageBuffer(imagePrompt);
  const imageUrl = await uploadImageBuffer(imageBuffer, 'amcue/generated');
  return { caption, imagePrompt, imageUrl };
}

module.exports = { generateGeminiContent, generateImageBuffer };
