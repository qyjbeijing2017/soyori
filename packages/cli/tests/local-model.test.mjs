import assert from "node:assert/strict";
import test from "node:test";
import { createCliLocalModel } from "../dist/local-model.js";

function fixture(failures = {}, controller) {
  const events = [];
  const model = createCliLocalModel({}, ({ device }) => ({
    async initialize() {
      events.push(`initialize:${device}`);
      if (controller) controller.abort();
      if (failures[device]) throw Error(failures[device]);
    },
    async generate() {
      events.push(`generate:${device}`);
      if (failures.generate) throw Error(failures.generate);
      return { result: device };
    },
    async dispose() {
      events.push(`dispose:${device}`);
    },
  }));
  return { model, events };
}

test("CLI prefers GPU and reuses its initialized model across calls", async () => {
  const { model, events } = fixture();
  assert.equal((await model.generate({})).result, "webgpu");
  await model.generate({});
  assert.deepEqual(events, ["initialize:webgpu", "generate:webgpu", "generate:webgpu"]);
});

test("CLI cleans failed GPU initialization then retains CPU fallback", async () => {
  const { model, events } = fixture({ webgpu: "unsupported" });
  assert.equal((await model.generate({})).result, "cpu");
  await model.generate({});
  assert.deepEqual(events, [
    "initialize:webgpu",
    "dispose:webgpu",
    "initialize:cpu",
    "generate:cpu",
    "generate:cpu",
  ]);
});

test("CPU initialization failure is reported and cleaned up", async () => {
  const { model, events } = fixture({ webgpu: "unsupported", cpu: "CPU failed" });
  await assert.rejects(model.generate({}), /CPU failed/);
  assert.equal(events.at(-1), "dispose:cpu");
});

test("cancellation cleans GPU without starting CPU or generating", async () => {
  const controller = new AbortController();
  const { model, events } = fixture({}, controller);
  await assert.rejects(model.generate({}, controller.signal), { name: "AbortError" });
  assert.deepEqual(events, ["initialize:webgpu", "dispose:webgpu"]);
});

test("generation errors do not retry on CPU", async () => {
  const { model, events } = fixture({ generate: "generation failed" });
  await assert.rejects(model.generate({}), /generation failed/);
  assert.deepEqual(events, ["initialize:webgpu", "generate:webgpu"]);
});
