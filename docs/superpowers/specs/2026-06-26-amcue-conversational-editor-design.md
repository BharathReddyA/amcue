# AMcue — Conversational Post Editor

Date: 2026-06-26
Status: Approved

## Purpose

Let the user click a pending queue item and chat with an assistant to revise its
caption and/or image before approving it — "make the caption punchier," "change the
background to blue," etc. — instead of only being able to approve or reject content
as-is.

## Scope boundaries

- Only available for `pending` content items. Approved/feed items are not editable
  through this flow (already decided in brainstorming).
- Real Gemini calls: one text call per message to decide what to do and draft a reply,
  and a real image-edit call (image + instruction in, edited image out) when the
  assistant decides the image should change. Confirmed live that
  `gemini-2.5-flash-image` supports true editing (existing image bytes + a text
  instruction → a modified image), not just text-to-image generation.
- Chat history persists in the database per content item.
- No streaming responses — each message is a normal request/response round trip.
- No "undo" / version history beyond what's naturally visible in the chat thread (the
  old caption/image isn't recoverable once overwritten — this is a practice project,
  not a production content system).
- No multi-item batch editing, no editing via the Feed page.

## Data model

New table:

```prisma
model ContentMessage {
  id            String      @id @default(uuid())
  contentItemId String
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id])
  role          String      // "user" | "assistant"
  text          String
  createdAt     DateTime    @default(now())
}
```

`ContentItem` gains the inverse relation (`messages ContentMessage[]`). No other schema
changes — `caption`/`imagePrompt`/`imageUrl` are simply updated in place when the
assistant decides to change them, same fields already used by the generate flow.

## Chat decision logic

One Gemini text call per user message (`gemini-2.5-flash`, same model already used for
generation), given: the full prior chat history for this item, the current `caption`
and `imagePrompt`, and the new user message. Prompted to return strict JSON:

```json
{
  "reply": "a conversational response to show the user",
  "updateCaption": false,
  "newCaption": null,
  "updateImage": false,
  "imageEditInstruction": null
}
```

- If `updateCaption` is true, `newCaption` replaces `ContentItem.caption`.
- If `updateImage` is true, `imageEditInstruction` is sent to the image model **along
  with the current image's bytes** (fetched from the existing `imageUrl`) for a true
  edit; the result is uploaded via the existing `uploadImageBuffer` Cloudinary service
  (folder `amcue/generated`, same as initial generation) and replaces
  `ContentItem.imageUrl`. `imagePrompt` is updated to reflect the edit instruction
  applied, so future edits have an accurate running description.
- If a message doesn't warrant any change (e.g. "thanks," "looks great"), both flags
  are false and only `reply` is used — no Cloudinary call, no DB field changes beyond
  saving the two chat messages.

## API routes

Both nest under `/content/:id`, added to the existing `backend/src/routes/content.js`
router (which already handles `PATCH /content/:id`). They require `requireAuth`, and check ownership via
`ContentItem → AppProject → userId` (matching the pattern already used by `PATCH
/content/:id`). Both reject with 400 if the content item's `status` isn't `pending`.

- `GET /content/:id/messages` — returns the full ordered message history for the item.
- `POST /content/:id/messages` — body `{ text }`. Saves the user message, runs the
  decision logic above, applies any caption/image change, saves the assistant's reply,
  returns `{ message: <assistant ContentMessage>, contentItem: <updated ContentItem> }`.

## Frontend

- `frontend/app/projects/[id]/queue/page.js`: each item becomes clickable (in addition
  to the existing Approve/Reject buttons) to open a modal — implemented as a new
  `ChatModal` component, not a separate route.
- `ChatModal` (new component): shows the item's current image + caption at the top,
  a scrollable message thread below, and a text input + send button. On send: posts to
  `POST /content/:id/messages`, optimistically appends the user's message, then appends
  the assistant's reply and refreshes the displayed image/caption from the response.
  Closing the modal returns to the queue list, which refetches so any change is
  reflected in the list view too.
- Loads existing history via `GET /content/:id/messages` when opened.

## Testing

`backend/tests/chatEdit.test.js`, same real-DB pattern as the rest of the suite, with
the chat-decision Gemini call mocked (same approach as `geminiProvider` is mocked in
`content.test.js`) so the test suite stays fast/free/deterministic:
- Posting a message that triggers a caption update persists the new caption and both
  messages.
- Posting a message that triggers an image update calls the (mocked) image-edit path
  and persists the new `imageUrl`.
- Posting a message that triggers neither just saves both messages, no field changes.
- `GET /content/:id/messages` returns saved history in order.
- 400 when the content item is not `pending`.
- 404 for a content item not owned by the requesting user.

## Out of scope

- Editing approved/feed items
- Streaming chat responses
- Undo/version history
- Real social platform posting (still untouched, unrelated to this feature)
