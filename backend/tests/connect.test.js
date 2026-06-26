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

describe('mock social-connect routes', () => {
  it('starts disconnected for both platforms', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ instagram: false, tiktok: false });
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
    expect(connectRes.body).toEqual({ instagram: true, tiktok: false });

    const disconnectRes = await request(app)
      .post(`/projects/${projectId}/connect/instagram`)
      .set('Authorization', `Bearer ${token}`);

    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body).toEqual({ instagram: false, tiktok: false });
  });

  it('GET reflects the current toggled state', async () => {
    await request(app)
      .post(`/projects/${projectId}/connect/tiktok`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ instagram: false, tiktok: true });
  });
});
