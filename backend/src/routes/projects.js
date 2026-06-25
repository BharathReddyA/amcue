const express = require('express');
const multer = require('multer');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { uploadImageBuffer } = require('../services/cloudinary');

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

module.exports = router;
