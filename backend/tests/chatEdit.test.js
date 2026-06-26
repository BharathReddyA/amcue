jest.mock('../src/services/ai/chatEditProvider', () => ({
  applyChatMessage: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { applyChatMessage } = require('../src/services/ai/chatEditProvider');

let token;
let userId;
let projectId;
let contentItemId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'chat-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'chat-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Chat Test App')
    .field('description', 'An app for chat edit tests');
  projectId = projectRes.body.id;

  const item = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Original caption',
      imagePrompt: 'Original image prompt',
      imageUrl: 'https://res.cloudinary.com/fake/original.png',
      status: 'pending',
    },
  });
  contentItemId = item.id;
});

afterEach(() => {
  applyChatMessage.mockClear();
});

afterAll(async () => {
  await prisma.contentMessage.deleteMany({ where: { contentItemId } });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['chat-test@amcue.dev', 'chat-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('conversational post editor routes', () => {
  it('saves a user message and an assistant reply, updating the caption', async () => {
    applyChatMessage.mockResolvedValue({
      reply: 'Updated the caption for you!',
      updates: { caption: 'A punchier caption' },
    });

    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Make the caption punchier' });

    expect(res.status).toBe(201);
    expect(res.body.message.role).toBe('assistant');
    expect(res.body.message.text).toBe('Updated the caption for you!');
    expect(res.body.contentItem.caption).toBe('A punchier caption');
  });

  it('saves messages with no field changes when no update is decided', async () => {
    applyChatMessage.mockResolvedValue({ reply: 'Sounds good!', updates: {} });

    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Thanks, looks good' });

    expect(res.status).toBe(201);
    expect(res.body.contentItem.caption).toBe('A punchier caption');
  });

  it('returns the full message history in order', async () => {
    const res = await request(app)
      .get(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0].role).toBe('user');
    expect(res.body[0].text).toBe('Make the caption punchier');
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the content item is not pending', async () => {
    const approvedItem = await prisma.contentItem.create({
      data: {
        appProjectId: projectId,
        caption: 'Already approved',
        imageUrl: 'https://res.cloudinary.com/fake/approved.png',
        status: 'approved',
      },
    });

    const res = await request(app)
      .post(`/content/${approvedItem.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'change something' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a content item not owned by the requesting user', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'chat-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const res = await request(app)
      .get(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
