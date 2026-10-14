import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the live match center", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Alpha Prediction/i);
  assert.match(html, /Live cricket intelligence/i);
  assert.match(html, /Matches, scores and probabilities/i);
  assert.match(html, /Every active match keeps its own live prediction card/i);
  assert.match(html, /winner probability and future score ranges/i);
  assert.match(html, /Live formats/i);
  assert.match(html, /Feed health/i);
  assert.match(html, /Filtered unsupported/i);
  assert.match(html, /Last successful update/i);
  assert.match(html, /One-Day/i);
  assert.match(html, /Test/i);
  assert.doesNotMatch(html, /Starter Project/i);
  assert.doesNotMatch(html, /signin-with-chatgpt/i);
  assert.doesNotMatch(html, /betting/i);
  assert.doesNotMatch(html, /odds/i);
  assert.doesNotMatch(html, /bankroll/i);
});
