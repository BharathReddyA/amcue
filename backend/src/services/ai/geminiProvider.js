const { uploadImageBuffer } = require('../cloudinary');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function generateCaptionAndPrompt(project) {
  const prompt = `You are a marketing assistant for an indie app called "${project.name}". App description: "${project.description}".
Return ONLY raw JSON (no markdown fences, no extra text) in this exact shape: {"caption": "...", "imagePrompt": "..."}.
"caption" is a short, friendly social media caption promoting the app (max 2 sentences, can include relevant emoji).
"imagePrompt" is a vivid, detailed prompt for an AI image generator to create a promotional image for this app (describe subject, style, and mood; do not request any text or words to appear in the image).`;

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
  if (!imagePart) {
    throw new Error('Gemini image generation returned no image data');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function generateGeminiContent(project) {
  const { caption, imagePrompt } = await generateCaptionAndPrompt(project);
  const imageBuffer = await generateImageBuffer(imagePrompt);
  const imageUrl = await uploadImageBuffer(imageBuffer, 'amcue/generated');
  return { caption, imagePrompt, imageUrl };
}

module.exports = { generateGeminiContent };
