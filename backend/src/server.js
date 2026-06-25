require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const projectRoutes = require('./routes/projects');
app.use('/projects', projectRoutes);

const contentRoutes = require('./routes/content');
app.use('/content', contentRoutes);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`AMcue backend listening on ${PORT}`));
}

module.exports = app;
