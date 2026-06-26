const express = require('express');
const multer = require('multer');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { uploadImageBuffer } = require('../services/cloudinary');
const { generateGeminiContent } = require('../services/ai/geminiProvider');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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

module.exports = router;
