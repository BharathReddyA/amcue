jest.mock('../src/services/ai/geminiProvider', () => ({
  generateGeminiContent: jest.fn().mockResolvedValue({
    caption: 'Mock caption for Content Test App',
    imagePrompt: 'mock image prompt',
    imageUrl: 'https://res.cloudinary.com/fake/mock.png',
  }),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { generateGeminiContent } = require('../src/services/ai/geminiProvider');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'content-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'content-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Content Test App')
    .field('description', 'An app for content tests');
  projectId = projectRes.body.id;
});

afterEach(() => {
  generateGeminiContent.mockClear();
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['content-test@amcue.dev', 'content-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('content generation and review routes', () => {
  it('generates a pending content item using the AI provider', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.caption).toBe('Mock caption for Content Test App');
    expect(res.body.imagePrompt).toBe('mock image prompt');
    expect(res.body.imageUrl).toBe('https://res.cloudinary.com/fake/mock.png');
  });

  it('returns 502 and creates no content item when the AI provider fails', async () => {
    generateGeminiContent.mockRejectedValueOnce(new Error('Gemini is down'));

    const before = await prisma.contentItem.count({ where: { appProjectId: projectId } });

    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();

    const after = await prisma.contentItem.count({ where: { appProjectId: projectId } });
    expect(after).toBe(before);
  });

  it('lists only pending items for the project', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe('pending');
  });

  it('rejects an invalid status query param', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/content?status=bogus`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('approves a pending item and moves it from pending to approved', async () => {
    const list = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);
    const itemId = list.body[0].id;

    const patchRes = await request(app)
      .patch(`/content/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('approved');

    const pendingAfter = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);
    expect(pendingAfter.body.length).toBe(0);

    const approvedAfter = await request(app)
      .get(`/projects/${projectId}/content?status=approved`)
      .set('Authorization', `Bearer ${token}`);
    expect(approvedAfter.body.length).toBe(1);
  });

  it('returns 404 when patching another user\'s content item', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'content-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const list = await request(app)
      .get(`/projects/${projectId}/content?status=approved`)
      .set('Authorization', `Bearer ${token}`);
    const itemId = list.body[0].id;

    const res = await request(app)
      .patch(`/content/${itemId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'rejected' });

    expect(res.status).toBe(404);
  });
});
