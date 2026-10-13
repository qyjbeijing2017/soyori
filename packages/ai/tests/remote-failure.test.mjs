import assert from "node:assert/strict";
import test from "node:test";
import { remoteFailure } from "../dist/remote-failure.js";

test("remote errors distinguish HTTP, network and SDK without exposing provider messages", () => {
  assert.match(remoteFailure("openai", { status: 401, message: "secret-key" }), /HTTP 401/);
  assert.match(
    remoteFailure(
      "openai",
      new Error("Connection error", { cause: new TypeError("Failed to fetch") }),
    ),
    /network request failed/,
  );
  const sdk = remoteFailure("openai", new Error("secret-key and private prompt"));
  assert.match(sdk, /SDK request or response processing error/);
  assert.doesNotMatch(sdk, /secret-key|private prompt|CORS/);
  const cyclic = new Error("unknown");
  cyclic.cause = cyclic;
  assert.match(remoteFailure("anthropic", cyclic), /SDK/);
});
