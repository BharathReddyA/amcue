jest.mock('../src/services/cloudinary', () => ({
  uploadImageBuffer: jest.fn().mockResolvedValue('https://res.cloudinary.com/fake/image.png'),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

let token;
let userId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'projects-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'projects-test@amcue.dev' } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('project routes', () => {
  it('rejects requests with no auth token', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
  });

  it('creates a project with a screenshot upload', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Test App')
      .field('description', 'An app for testing')
      .attach('screenshots', Buffer.from('fake-image-bytes'), 'screenshot.png');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test App');
    expect(res.body.screenshotUrls).toEqual(['https://res.cloudinary.com/fake/image.png']);
  });

  it('lists only the current user\'s projects', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Test App');
  });

  it('gets a single project by id', async () => {
    const list = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`);
    const projectId = list.body[0].id;

    const res = await request(app)
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
  });
});
