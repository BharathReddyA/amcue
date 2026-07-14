const prisma = require('../../prismaClient');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';

// ponytail: "learning" is retrieval + prompt injection over rows we already
// store - no embeddings, no background jobs. Revisit only if projects
// accumulate hundreds of signals and prompt size becomes a real problem.
async function getVoiceContext(projectId) {
  const [approvedItems, rejectedItems, editMessages, project] = await Promise.all([
    prisma.contentItem.findMany({
      where: { appProjectId: projectId, status: 'approved', caption: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { caption: true },
    }),
    prisma.contentItem.findMany({
      where: { appProjectId: projectId, status: 'rejected', caption: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { caption: true },
    }),
    prisma.contentMessage.findMany({
      where: { role: 'user', contentItem: { appProjectId: projectId } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { text: true },
    }),
    prisma.appProject.findUnique({
      where: { id: projectId },
      select: { brandVoiceSummary: true },
    }),
  ]);

  return {
    approved: approvedItems.map((i) => i.caption),
    rejected: rejectedItems.map((i) => i.caption),
    edits: editMessages.map((m) => m.text),
    summary: project?.brandVoiceSummary || null,
  };
}

async function countVoiceSignals(projectId) {
  const [approved, rejected, edits] = await Promise.all([
    prisma.contentItem.count({ where: { appProjectId: projectId, status: 'approved' } }),
    prisma.contentItem.count({ where: { appProjectId: projectId, status: 'rejected' } }),
    prisma.contentMessage.count({
      where: { role: 'user', contentItem: { appProjectId: projectId } },
    }),
  ]);
  return { approved, rejected, edits, total: approved + rejected + edits };
}

async function distillVoice(projectId) {
  const context = await getVoiceContext(projectId);

  const prompt = `You are analyzing a brand's editorial voice from real user behavior.

Captions the user APPROVED:
${context.approved.map((c) => `- ${c}`).join('\n') || '(none)'}

Captions the user REJECTED:
${context.rejected.map((c) => `- ${c}`).join('\n') || '(none)'}

Edit instructions the user gave when refining content:
${context.edits.map((e) => `- ${e}`).join('\n') || '(none)'}

Write a concise brand voice description (max 80 words, plain prose, no headings or
bullets) covering tone, style, and clear dos/don'ts inferred from the above.`;

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Brand voice distillation failed with status ${res.status}`);
  }

  const data = await res.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!summary) {
    throw new Error('Brand voice distillation returned no content');
  }
  return summary;
}

module.exports = { getVoiceContext, countVoiceSignals, distillVoice };
