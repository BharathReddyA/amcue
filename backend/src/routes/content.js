const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { applyChatMessage } = require('../services/ai/chatEditProvider');

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

module.exports = router;
