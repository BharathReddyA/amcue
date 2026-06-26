// ponytail: deterministic mock metrics seeded from the content item id, same
// pattern as the picsum.photos seed already used for stub/Gemini images - no
// real analytics, no persistence, just a stable-looking number per item.
function seedFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000000;
  }
  return hash;
}

function getMockAnalytics(contentItemId) {
  const seed = seedFromId(contentItemId);
  return {
    views: 100 + (seed % 5000),
    likes: 10 + (seed % 500),
    comments: seed % 50,
  };
}

module.exports = { getMockAnalytics };
