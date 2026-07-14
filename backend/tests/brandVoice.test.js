jest.mock('../src/services/ai/geminiProvider', () => ({
  generateGeminiContent: jest.fn().mockResolvedValue({
    caption: 'Voice test caption',
    imagePrompt: 'voice test prompt',
    imageUrl: 'https://res.cloudinary.com/fake/voice.png',
  }),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { generateGeminiContent } = require('../src/services/ai/geminiProvider');
const { getVoiceContext } = require('../src/services/ai/brandVoice');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'voice-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'voice-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Voice Test App')
    .field('description', 'An app for brand voice tests');
  projectId = projectRes.body.id;

  const approved = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Approved witty caption',
      imageUrl: 'https://res.cloudinary.com/fake/a.png',
      status: 'approved',
    },
  });
  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Rejected bland caption',
      imageUrl: 'https://res.cloudinary.com/fake/r.png',
      status: 'rejected',
    },
  });
  await prisma.contentMessage.create({
    data: { contentItemId: approved.id, role: 'user', text: 'Make it punchier' },
  });
  await prisma.contentMessage.create({
    data: { contentItemId: approved.id, role: 'assistant', text: 'Done!' },
  });
});

afterEach(() => {
  generateGeminiContent.mockClear();
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  }
});

afterAll(async () => {
  await prisma.contentMessage.deleteMany({
    where: { contentItem: { appProjectId: projectId } },
  });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['voice-test@amcue.dev', 'voice-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('brand voice', () => {
  it('getVoiceContext returns project-scoped signals (user messages only)', async () => {
    const ctx = await getVoiceContext(projectId);
    expect(ctx.approved).toEqual(['Approved witty caption']);
    expect(ctx.rejected).toEqual(['Rejected bland caption']);
    expect(ctx.edits).toEqual(['Make it punchier']);
    expect(ctx.summary).toBeNull();
  });

  it('generate passes the voice context to the provider', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    const [, voiceArg] = generateGeminiContent.mock.calls[0];
    expect(voiceArg.approved).toContain('Approved witty caption');
    expect(voiceArg.rejected).toContain('Rejected bland caption');
    expect(voiceArg.edits).toContain('Make it punchier');
  });

  it('GET brand-voice returns counts and staleness', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/brand-voice`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.counts.approved).toBe(1);
    expect(res.body.counts.rejected).toBe(1);
    expect(res.body.counts.edits).toBe(1);
    expect(res.body.stale).toBe(true);
  });

  it('POST refresh distills and stores the summary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Witty, punchy, emoji-light.' }] } }],
        }),
    });

    const res = await request(app)
      .post(`/projects/${projectId}/brand-voice/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('Witty, punchy, emoji-light.');
    expect(res.body.stale).toBe(false);

    const project = await prisma.appProject.findUnique({ where: { id: projectId } });
    expect(project.brandVoiceSummary).toBe('Witty, punchy, emoji-light.');
    expect(project.brandVoiceSignals).toBe(3);
  });

  it('POST refresh failure leaves the prior summary intact', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    const res = await request(app)
      .post(`/projects/${projectId}/brand-voice/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    const project = await prisma.appProject.findUnique({ where: { id: projectId } });
    expect(project.brandVoiceSummary).toBe('Witty, punchy, emoji-light.');
  });

  it('returns 404 for another user\'s project', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'voice-test-other@amcue.dev', password: 'password123' });

    const res = await request(app)
      .get(`/projects/${projectId}/brand-voice`)
      .set('Authorization', `Bearer ${otherRes.body.token}`);

    expect(res.status).toBe(404);
  });
});
