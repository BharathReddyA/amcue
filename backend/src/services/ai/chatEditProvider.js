const { uploadImageBuffer } = require('../cloudinary');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function decideChatAction({ caption, imagePrompt, history, userText }) {
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = `You are an assistant helping someone refine a piece of marketing content before they approve it.

Current caption: "${caption}"
Current image description: "${imagePrompt}"

Conversation so far:
${historyText || '(no messages yet)'}

New user message: "${userText}"

Decide what to do and respond with ONLY raw JSON (no markdown fences, no extra text) in this exact shape:
{"reply": "...", "updateCaption": false, "newCaption": null, "updateImage": false, "imageEditInstruction": null}

"reply" is a short, friendly conversational response to the user.
Set "updateCaption" to true and provide "newCaption" only if the user asked to change the caption/text.
Set "updateImage" to true and provide "imageEditInstruction" (a clear instruction for an image editor, e.g. "change the background to blue") only if the user asked to change the image.
If the message doesn't request any change, leave both update flags false and the other fields null.`;

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini chat decision failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini chat decision returned no content');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.reply !== 'string') {
    throw new Error('Gemini chat decision returned malformed JSON');
  }

  return parsed;
}

async function editImage(currentImageUrl, instruction) {
  const imageRes = await fetch(currentImageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch current image with status ${imageRes.status}`);
  }
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = imageRes.headers.get('content-type') || 'image/png';

  // ponytail: same no-image-in-response retry as generateImageBuffer in
  // geminiProvider.js - the image model occasionally returns text-only with
  // no deterministic cause, one retry is the standard mitigation.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await fetch(
      `${API_BASE}/${IMAGE_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini image edit failed with status ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData);
    if (imagePart) {
      return Buffer.from(imagePart.inlineData.data, 'base64');
    }
  }

  throw new Error('Gemini image edit returned no image data after retry');
}

async function applyChatMessage({ contentItem, history, userText }) {
  const decision = await decideChatAction({
    caption: contentItem.caption,
    imagePrompt: contentItem.imagePrompt,
    history,
    userText,
  });

  const updates = {};
  if (decision.updateCaption && decision.newCaption) {
    updates.caption = decision.newCaption;
  }
  if (decision.updateImage && decision.imageEditInstruction) {
    const editedBuffer = await editImage(contentItem.imageUrl, decision.imageEditInstruction);
    updates.imageUrl = await uploadImageBuffer(editedBuffer, 'amcue/generated');
    updates.imagePrompt = decision.imageEditInstruction;
  }

  return { reply: decision.reply, updates };
}

module.exports = { applyChatMessage, decideChatAction, editImage };
