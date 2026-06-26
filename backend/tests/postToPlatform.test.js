jest.mock('../src/services/x/xApi', () => ({
  uploadMedia: jest.fn(),
  postTweet: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { uploadMedia, postTweet } = require('../src/services/x/xApi');

let token;
let userId;
let projectId;
let approvedItemId;
let pendingItemId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'post-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'post-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Post Test App')
    .field('description', 'An app for post-to-platform tests');
  projectId = projectRes.body.id;

  const approvedItem = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Approved post',
      imageUrl: 'https://res.cloudinary.com/fake/approved.png',
      status: 'approved',
    },
  });
  approvedItemId = approvedItem.id;

  const pendingItem = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Pending post',
      imageUrl: 'https://res.cloudinary.com/fake/pending.png',
      status: 'pending',
    },
  });
  pendingItemId = pendingItem.id;
});

afterEach(() => {
  uploadMedia.mockClear();
  postTweet.mockClear();
});

afterAll(async () => {
  await prisma.contentItemPost.deleteMany({
    where: { contentItem: { appProjectId: projectId } },
  });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('post-to-platform route', () => {
  it('mock-posts to instagram with no external call', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'instagram' });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('instagram');
    expect(res.body.externalUrl).toBeNull();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(postTweet).not.toHaveBeenCalled();
  });

  it('returns 400 when posting to X without being connected', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'x' });

    expect(res.status).toBe(400);
  });

  it('posts to X when connected, using the mocked X API', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { xAccessToken: 'fake-token', xUsername: 'faketestuser' },
    });
    uploadMedia.mockResolvedValue('media-123');
    postTweet.mockResolvedValue({ id: 'tweet-456', url: 'https://x.com/i/web/status/tweet-456' });

    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'x' });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('x');
    expect(res.body.externalUrl).toBe('https://x.com/i/web/status/tweet-456');
    expect(uploadMedia).toHaveBeenCalledWith('fake-token', 'https://res.cloudinary.com/fake/approved.png');
  });

  it('returns 404 when posting a pending (not approved) item', async () => {
    const res = await request(app)
      .post(`/content/${pendingItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'instagram' });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'facebook' });

    expect(res.status).toBe(400);
  });

  it('lists all posts for a content item', async () => {
    const res = await request(app)
      .get(`/content/${approvedItemId}/posts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    const platforms = res.body.map((p) => p.platform).sort();
    expect(platforms).toEqual(['instagram', 'x']);
  });
});
