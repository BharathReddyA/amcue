const express = require('express');
const multer = require('multer');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { uploadImageBuffer } = require('../services/cloudinary');
const { generateGeminiContent } = require('../services/ai/geminiProvider');
const { getMockAnalytics } = require('../services/mockAnalytics');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const CONNECT_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x'];
const DEFAULT_MOCK_CONNECTIONS = { instagram: false, tiktok: false, youtube: false, x: false };

// ponytail: existing users predate the youtube/x platforms, so their stored
// JSON may be missing those keys - merge over defaults instead of a data
// migration/backfill.
function withConnectionDefaults(mockConnections) {
  return { ...DEFAULT_MOCK_CONNECTIONS, ...mockConnections };
}

router.use(requireAuth);

router.post('/', upload.array('screenshots', 6), async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' });
  }

  try {
    const files = req.files || [];
    const screenshotUrls = await Promise.all(
      files.map((file) => uploadImageBuffer(file.buffer, 'amcue/screenshots'))
    );

    const project = await prisma.appProject.create({
      data: {
        userId: req.userId,
        name,
        description,
        screenshotUrls,
      },
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(502).json({ error: 'Failed to upload screenshots or save project' });
  }
});

router.get('/', async (req, res) => {
  const projects = await prisma.appProject.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(projects);
});

router.get('/:id', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

router.post('/:id/generate', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const { caption, imagePrompt, imageUrl } = await generateGeminiContent(project);
    const contentItem = await prisma.contentItem.create({
      data: {
        appProjectId: project.id,
        caption,
        imagePrompt,
        imageUrl,
        status: 'pending',
      },
    });
    res.status(201).json(contentItem);
  } catch (err) {
    console.error('Content generation failed:', err);
    res.status(502).json({ error: 'Content generation failed, please try again' });
  }
});

router.get('/:id/content', async (req, res) => {
  const { status } = req.query;
  if (!status || !['pending', 'approved'].includes(status)) {
    return res.status(400).json({ error: 'status query param must be "pending" or "approved"' });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const items = await prisma.contentItem.findMany({
    where: { appProjectId: project.id, status },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

router.get('/:id/connect', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json(withConnectionDefaults(user.mockConnections));
});

router.post('/:id/connect/:platform', async (req, res) => {
  const { platform } = req.params;
  if (!CONNECT_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${CONNECT_PLATFORMS.join(', ')}` });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const current = withConnectionDefaults(user.mockConnections);
  const mockConnections = {
    ...current,
    [platform]: !current[platform],
  };

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { mockConnections },
  });

  res.json(updated.mockConnections);
});

router.get('/:id/connect/:platform/analytics', async (req, res) => {
  const { platform } = req.params;
  if (!CONNECT_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${CONNECT_PLATFORMS.join(', ')}` });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const items = await prisma.contentItem.findMany({
    where: { appProjectId: project.id },
    orderBy: { createdAt: 'desc' },
  });

  const posts = items.map((item) => ({
    id: item.id,
    caption: item.caption,
    imageUrl: item.imageUrl,
    status: item.status,
    ...getMockAnalytics(item.id),
  }));

  const totals = posts.reduce(
    (acc, post) => ({
      views: acc.views + post.views,
      likes: acc.likes + post.likes,
      comments: acc.comments + post.comments,
    }),
    { views: 0, likes: 0, comments: 0 }
  );

  res.json({ totals, posts });
});

module.exports = router;
