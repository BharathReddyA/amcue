const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'analytics-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'analytics-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Analytics Test App')
    .field('description', 'An app for analytics tests');
  projectId = projectRes.body.id;

  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Post one',
      imageUrl: 'https://res.cloudinary.com/fake/one.png',
      status: 'pending',
    },
  });
  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Post two',
      imageUrl: 'https://res.cloudinary.com/fake/two.png',
      status: 'approved',
    },
  });
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['analytics-test@amcue.dev', 'analytics-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('platform analytics route', () => {
  it('returns totals and a per-post breakdown including both pending and approved items', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(2);
    const statuses = res.body.posts.map((p) => p.status).sort();
    expect(statuses).toEqual(['approved', 'pending']);
    expect(res.body.totals.views).toBe(res.body.posts.reduce((sum, p) => sum + p.views, 0));
  });

  it('returns identical numbers on a second call (deterministic)', async () => {
    const first = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.body).toEqual(second.body);
  });

  it('seeds different posts with different metrics', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    const [postA, postB] = res.body.posts;
    const identical =
      postA.views === postB.views && postA.likes === postB.likes && postA.comments === postB.comments;
    expect(identical).toBe(false);
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/facebook/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 404 for a project owned by another user', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'analytics-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
