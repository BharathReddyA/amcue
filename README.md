# AMcue

Practice project: automate marketing content for indie app developers. See
`docs/superpowers/specs/2026-06-25-amcue-design.md` for the full design.

## Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL (Neon), JWT_SECRET, Cloudinary keys
npx prisma migrate dev
npm run dev             # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev              # http://localhost:3000
```

### Tests

```bash
cd backend
npm test
```

## Project layout

- `backend/` — Express API, Prisma/Postgres, Cloudinary uploads
- `frontend/` — Next.js app
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans
