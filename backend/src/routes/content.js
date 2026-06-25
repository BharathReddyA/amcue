const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');

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

module.exports = router;
