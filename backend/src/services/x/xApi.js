const MEDIA_BASE = 'https://api.x.com/2/media/upload';

// ponytail: the v1.1 media/upload.json endpoint this used to call requires
// OAuth 1.0a and was deprecated by X in June 2025 - this is the real v2
// three-step flow (initialize -> append -> finalize), which accepts the
// OAuth 2.0 user-context bearer token this app already has. Single segment
// only, no chunking/polling - fine for the small images this app generates;
// add chunking if files larger than a few MB are ever uploaded.
async function uploadMedia(accessToken, imageUrl) {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch content image with status ${imageRes.status}`);
  }
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mediaType = imageRes.headers.get('content-type') || 'image/png';

  const initRes = await fetch(`${MEDIA_BASE}/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      media_type: mediaType,
      total_bytes: arrayBuffer.byteLength,
      media_category: 'tweet_image',
    }),
  });
  if (!initRes.ok) {
    throw new Error(`X media upload initialize failed with status ${initRes.status}`);
  }
  const { data: initData } = await initRes.json();
  const mediaId = initData.id;

  const appendRes = await fetch(`${MEDIA_BASE}/${mediaId}/append`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ media: base64, segment_index: 0 }),
  });
  if (!appendRes.ok) {
    throw new Error(`X media upload append failed with status ${appendRes.status}`);
  }

  const finalizeRes = await fetch(`${MEDIA_BASE}/${mediaId}/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!finalizeRes.ok) {
    throw new Error(`X media upload finalize failed with status ${finalizeRes.status}`);
  }

  return mediaId;
}

async function postTweet(accessToken, text, mediaId) {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      media: { media_ids: [mediaId] },
    }),
  });

  if (!res.ok) {
    throw new Error(`X tweet creation failed with status ${res.status}`);
  }

  const data = await res.json();
  const tweetId = data.data?.id;
  return { id: tweetId, url: `https://x.com/i/web/status/${tweetId}` };
}

async function fetchRecentTweets(accessToken, userId, maxResults = 10) {
  const res = await fetch(
    `https://api.x.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`X timeline fetch failed with status ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    url: `https://x.com/i/web/status/${tweet.id}`,
    createdAt: tweet.created_at,
  }));
}

module.exports = { uploadMedia, postTweet, fetchRecentTweets };
