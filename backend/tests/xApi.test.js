// Contract test for backend/src/services/x/xApi.js — mocks global.fetch and
// asserts the actual URLs/methods/headers sent, since the route-level tests
// mock this module entirely and would never catch a wrong endpoint or wrong
// auth scheme (which is exactly how a real bug shipped here once already).
const { uploadMedia, postTweet } = require('../src/services/x/xApi');

function jsonResponse(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
    headers: { get: () => 'image/png' },
    arrayBuffer: () => Promise.resolve(Buffer.from('fake-image-bytes')),
  });
}

describe('xApi request contracts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uploadMedia calls the v2 initialize/append/finalize endpoints with a bearer token', async () => {
    const calls = [];
    global.fetch = jest.fn((url, options) => {
      calls.push({ url, options });
      if (url === 'https://res.cloudinary.com/fake/image.png') {
        return jsonResponse({});
      }
      if (url === 'https://api.x.com/2/media/upload/initialize') {
        return jsonResponse({ data: { id: 'media-789' } });
      }
      if (url === 'https://api.x.com/2/media/upload/media-789/append') {
        return jsonResponse({ data: {} });
      }
      if (url === 'https://api.x.com/2/media/upload/media-789/finalize') {
        return jsonResponse({ data: { id: 'media-789' } });
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const mediaId = await uploadMedia('fake-token', 'https://res.cloudinary.com/fake/image.png');

    expect(mediaId).toBe('media-789');

    const initCall = calls.find((c) => c.url === 'https://api.x.com/2/media/upload/initialize');
    expect(initCall.options.method).toBe('POST');
    expect(initCall.options.headers.Authorization).toBe('Bearer fake-token');

    const appendCall = calls.find((c) => c.url === 'https://api.x.com/2/media/upload/media-789/append');
    expect(appendCall.options.method).toBe('POST');
    expect(appendCall.options.headers.Authorization).toBe('Bearer fake-token');
    expect(JSON.parse(appendCall.options.body)).toEqual({
      media: Buffer.from('fake-image-bytes').toString('base64'),
      segment_index: 0,
    });

    const finalizeCall = calls.find(
      (c) => c.url === 'https://api.x.com/2/media/upload/media-789/finalize'
    );
    expect(finalizeCall.options.method).toBe('POST');
    expect(finalizeCall.options.headers.Authorization).toBe('Bearer fake-token');
  });

  it('postTweet calls the real v2 tweets endpoint with the media id attached', async () => {
    let capturedCall;
    global.fetch = jest.fn((url, options) => {
      capturedCall = { url, options };
      return jsonResponse({ data: { id: 'tweet-999' } });
    });

    const result = await postTweet('fake-token', 'hello world', 'media-789');

    expect(capturedCall.url).toBe('https://api.x.com/2/tweets');
    expect(capturedCall.options.method).toBe('POST');
    expect(capturedCall.options.headers.Authorization).toBe('Bearer fake-token');
    expect(JSON.parse(capturedCall.options.body)).toEqual({
      text: 'hello world',
      media: { media_ids: ['media-789'] },
    });
    expect(result).toEqual({ id: 'tweet-999', url: 'https://x.com/i/web/status/tweet-999' });
  });
});
