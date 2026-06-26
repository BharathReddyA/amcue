jest.mock('../src/services/x/xApi', () => ({
  uploadMedia: jest.fn(),
  postTweet: jest.fn(),
  fetchRecentTweets: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { fetchRecentTweets } = require('../src/services/x/xApi');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'timeline-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'timeline-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Timeline Test App')
    .field('description', 'An app for account/timeline tests');
  projectId = projectRes.body.id;
});

afterEach(() => {
  fetchRecentTweets.mockClear();
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('account header and timeline on the analytics route', () => {
  it('returns null account and empty timeline for X when not connected', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
    expect(res.body.timeline).toEqual([]);
    expect(fetchRecentTweets).not.toHaveBeenCalled();
  });

  it('returns the real account and timeline for X when connected', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { xAccessToken: 'fake-token', xUserId: 'x-user-123', xUsername: 'faketestuser' },
    });
    fetchRecentTweets.mockResolvedValue([
      { id: 'tweet-1', text: 'Hello world', url: 'https://x.com/i/web/status/tweet-1', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({
      username: 'faketestuser',
      profileUrl: 'https://x.com/faketestuser',
    });
    expect(res.body.timeline.length).toBe(1);
    expect(res.body.timeline[0].text).toBe('Hello world');
    expect(fetchRecentTweets).toHaveBeenCalledWith('fake-token', 'x-user-123', 10);
  });

  it('returns 200 with an empty timeline if fetchRecentTweets throws', async () => {
    fetchRecentTweets.mockRejectedValue(new Error('X API is down'));

    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({
      username: 'faketestuser',
      profileUrl: 'https://x.com/faketestuser',
    });
    expect(res.body.timeline).toEqual([]);
  });

  it('returns fixed placeholder account and timeline for mock platforms', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({ username: 'demo_instagram_user', profileUrl: '#' });
    expect(res.body.timeline.length).toBeGreaterThan(0);
  });
});
