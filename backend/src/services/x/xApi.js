async function uploadMedia(accessToken, imageUrl) {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch content image with status ${imageRes.status}`);
  }
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ media_data: base64 }),
  });

  if (!res.ok) {
    throw new Error(`X media upload failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.media_id_string;
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

module.exports = { uploadMedia, postTweet };
