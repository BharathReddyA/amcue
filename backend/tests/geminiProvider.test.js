const { generateImageBuffer } = require('../src/services/ai/geminiProvider');

const noImageResponse = {
  candidates: [{ content: { parts: [{ text: 'Here is a description with no image.' }] } }],
};

const withImageResponse = {
  candidates: [
    {
      content: {
        parts: [
          { text: 'Here you go' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: Buffer.from('fake-image-bytes').toString('base64'),
            },
          },
        ],
      },
    },
  ],
};

function mockFetchSequence(responses) {
  let call = 0;
  global.fetch = jest.fn(() => {
    const body = responses[call];
    call += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  });
}

describe('generateImageBuffer retry behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('succeeds immediately if the first attempt returns an image', async () => {
    mockFetchSequence([withImageResponse]);

    const buffer = await generateImageBuffer('a test prompt');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(buffer.toString()).toBe('fake-image-bytes');
  });

  it('retries once and succeeds if the first attempt returns no image', async () => {
    mockFetchSequence([noImageResponse, withImageResponse]);

    const buffer = await generateImageBuffer('a test prompt');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(buffer.toString()).toBe('fake-image-bytes');
  });

  it('throws after both attempts return no image', async () => {
    mockFetchSequence([noImageResponse, noImageResponse]);

    await expect(generateImageBuffer('a test prompt')).rejects.toThrow(
      'Gemini image generation returned no image data after retry'
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
