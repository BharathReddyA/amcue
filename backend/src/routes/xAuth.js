const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const {
  createState,
  consumeState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXUsername,
} = require('../services/x/xAuth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
    return res.status(500).json({ error: 'X integration is not configured yet' });
  }

  const { token, projectId } = req.query;
  let userId;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId = payload.userId;
  } catch (err) {
    return res.status(401).send('Your session expired. Please log in again and retry connecting X.');
  }

  const { state, challenge } = createState(userId, projectId);
  const url = buildAuthorizeUrl(state, challenge);
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const entry = consumeState(state);
  if (!entry) {
    return res.status(400).send('Invalid or expired X login attempt. Please try connecting again.');
  }

  try {
    const tokens = await exchangeCodeForTokens(code, entry.verifier);
    const username = await fetchXUsername(tokens.access_token);

    await prisma.user.update({
      where: { id: entry.userId },
      data: {
        xAccessToken: tokens.access_token,
        xRefreshToken: tokens.refresh_token || null,
        xTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        xUsername: username,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/projects/${entry.projectId}/connect`);
  } catch (err) {
    console.error('X OAuth callback failed:', err);
    res.status(502).send('Connecting to X failed. Please try again.');
  }
});

module.exports = router;
