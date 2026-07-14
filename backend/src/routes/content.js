const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { applyChatMessage } = require('../services/ai/chatEditProvider');
const { uploadMedia, postTweet } = require('../services/x/xApi');

const router = express.Router();

router.use(requireAuth);

router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: { status },
  });
  res.json(updated);
});

router.get('/:id/messages', async (req, res) => {
  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const messages = await prisma.contentMessage.findMany({
    where: { contentItemId: item.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

router.post('/:id/messages', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
    include: { appProject: { select: { brandVoiceSummary: true } } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }
  if (item.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending content items can be edited via chat' });
  }

  const userMessage = await prisma.contentMessage.create({
    data: { contentItemId: item.id, role: 'user', text },
  });

  const priorHistory = await prisma.contentMessage.findMany({
    where: { contentItemId: item.id },
    orderBy: { createdAt: 'asc' },
  });

  try {
    const { reply, updates } = await applyChatMessage({
      contentItem: item,
      history: priorHistory.filter((m) => m.id !== userMessage.id),
      userText: text,
      voiceSummary: item.appProject.brandVoiceSummary,
    });

    const updatedItem =
      Object.keys(updates).length > 0
        ? await prisma.contentItem.update({ where: { id: item.id }, data: updates })
        : item;

    const assistantMessage = await prisma.contentMessage.create({
      data: { contentItemId: item.id, role: 'assistant', text: reply },
    });

    res.status(201).json({ message: assistantMessage, contentItem: updatedItem });
  } catch (err) {
    console.error('Chat edit failed:', err);
    res.status(502).json({ error: 'Chat edit failed, please try again' });
  }
});

router.post('/:id/post', async (req, res) => {
  const { platform } = req.body;
  if (!['instagram', 'tiktok', 'youtube', 'x'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be one of: instagram, tiktok, youtube, x' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }
  if (item.status !== 'approved') {
    return res.status(404).json({ error: 'Only approved content items can be posted' });
  }

  if (platform === 'x') {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user.xAccessToken) {
      return res.status(400).json({ error: 'Connect X first' });
    }

    try {
      const mediaId = await uploadMedia(user.xAccessToken, item.imageUrl);
      const tweet = await postTweet(user.xAccessToken, item.caption, mediaId);

      const post = await prisma.contentItemPost.create({
        data: { contentItemId: item.id, platform: 'x', externalUrl: tweet.url },
      });
      return res.status(201).json(post);
    } catch (err) {
      console.error('X posting failed:', err);
      return res.status(502).json({ error: 'Posting to X failed, please try again' });
    }
  }

  const post = await prisma.contentItemPost.create({
    data: { contentItemId: item.id, platform, externalUrl: null },
  });
  res.status(201).json(post);
});

router.get('/:id/posts', async (req, res) => {
  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const posts = await prisma.contentItemPost.findMany({
    where: { contentItemId: item.id },
    orderBy: { postedAt: 'desc' },
  });
  res.json(posts);
});

module.exports = router;
