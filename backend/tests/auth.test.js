const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'test@amcue.dev' } });
  await prisma.$disconnect();
});

describe('auth routes', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@amcue.dev', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@amcue.dev', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@amcue.dev', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});
