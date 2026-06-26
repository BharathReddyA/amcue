const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'connect-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'connect-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Connect Test App')
    .field('description', 'An app for connect tests');
  projectId = projectRes.body.id;
});

afterAll(async () => {
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

const DISCONNECTED = { instagram: false, tiktok: false, youtube: false, x: false };

describe('mock social-connect routes', () => {
  it('starts disconnected for all platforms', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(DISCONNECTED);
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/connect/facebook`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('toggles instagram on, then off again', async () => {
    const connectRes = await request(app)
      .post(`/projects/${projectId}/connect/instagram`)
      .set('Authorization', `Bearer ${token}`);

    expect(connectRes.status).toBe(200);
    expect(connectRes.body).toEqual({ ...DISCONNECTED, instagram: true });

    const disconnectRes = await request(app)
      .post(`/projects/${projectId}/connect/instagram`)
      .set('Authorization', `Bearer ${token}`);

    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body).toEqual(DISCONNECTED);
  });

  it('toggles youtube on, then off again', async () => {
    const youtubeRes = await request(app)
      .post(`/projects/${projectId}/connect/youtube`)
      .set('Authorization', `Bearer ${token}`);
    expect(youtubeRes.status).toBe(200);
    expect(youtubeRes.body).toEqual({ ...DISCONNECTED, youtube: true });

    // reset for the next test's assumptions
    await request(app)
      .post(`/projects/${projectId}/connect/youtube`)
      .set('Authorization', `Bearer ${token}`);
  });

  it('rejects toggling x via the mock route when not really connected', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/connect/x`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('disconnects x by clearing real OAuth tokens', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { xAccessToken: 'fake-token', xUsername: 'faketestuser' },
    });

    const getRes = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.x).toBe(true);

    const disconnectRes = await request(app)
      .post(`/projects/${projectId}/connect/x`)
      .set('Authorization', `Bearer ${token}`);
    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.x).toBe(false);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user.xAccessToken).toBeNull();
  });

  it('GET reflects the current toggled state', async () => {
    await request(app)
      .post(`/projects/${projectId}/connect/tiktok`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...DISCONNECTED, tiktok: true });
  });
});
