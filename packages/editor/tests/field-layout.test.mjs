import assert from "node:assert/strict";
import test from "node:test";
import { fieldDefinitions, parseFlow } from "soyori-core";
import { parse, stringify } from "yaml";
import {
  callParameterEntries,
  callParameterNames,
  callParameterPlaceholder,
  tools,
} from "../src/call-tools.ts";
import { enableChat } from "../src/chat-contract.ts";
import { threadFlow } from "../src/chat-threads.ts";
import {
  changeFieldList,
  fieldGroupOptions,
  moveFieldEntry,
  putField,
} from "../src/field-layout.ts";
import { bindLibraryCalls } from "../src/library-calls.ts";
import { removeStep, replaceStep } from "../src/step-model.ts";

test("move and rename fields across groups without changing values or losing destination", () => {
  const fields = [
    { name: "value", initial: 7 },
    { type: "group", name: "Settings", collapsed: true, fields: [{ name: "other" }] },
  ];
  const moved = putField(fields, "value", { name: "renamed", initial: 7 }, [1]);
  assert.deepEqual(
    moved[0].fields.map((f) => f.name),
    ["other", "renamed"],
  );
  assert.equal(moved[0].collapsed, true);
  const outside = putField(moved, "renamed", { name: "renamed", initial: 7 }, []);
  assert.equal(outside[1].initial, 7);
  assert.equal(fields[0].name, "value");
  assert.deepEqual(fieldGroupOptions(outside), [{ value: "[0]", label: "Settings" }]);
  assert.deepEqual(
    fieldDefinitions(
      changeFieldList(outside, [], (items) =>
        items.flatMap((f) => (f.type === "group" ? f.fields : [f])),
      ),
    ),
    { other: {}, renamed: { initial: 7 } },
  );
});

test("JSON and YAML distribution preserves groups and chat helpers retain layout", () => {
  const flow = {
    schemaVersion: 1,
    name: "Groups",
    fields: [
      {
        type: "group",
        name: "Chat",
        collapsed: true,
        description: "Public",
        fields: [{ name: "chatIn", input: true }],
      },
    ],
    steps: [],
  };
  const enabled = enableChat(flow);
  assert.equal(enabled.fields[0].name, "Chat");
  assert.deepEqual(parseFlow(parse(stringify(enabled))), enabled);
  assert.deepEqual(parseFlow(JSON.parse(JSON.stringify(enabled))), enabled);
  assert.equal(threadFlow(enabled, { id: "thread" }).fields[0].collapsed, true);
});

test("tool and child interfaces preserve groups; defaults remain placeholders", () => {
  const entries = callParameterEntries("llm.openai", "inputs");
  assert.ok(entries.some((f) => f.type === "group" && f.collapsed));
  assert.ok(callParameterNames("llm.openai").includes("jsonSchema"));
  assert.deepEqual(tools["llm.openai"], { input: "$chatIn" });
  assert.equal(callParameterPlaceholder("llm.openai", "maxTokens"), "4096");
  const flow = {
    fields: [
      {
        type: "group",
        name: "Public",
        collapsed: true,
        fields: [{ name: "a", input: true, initial: 2 }, { name: "private" }],
      },
    ],
  };
  assert.deepEqual(callParameterNames("child", flow), ["a"]);
  assert.equal(callParameterPlaceholder("child", "a", flow), "2");
  assert.equal(callParameterEntries("child", "inputs", flow)[0].collapsed, true);
});

test("editing and library call binding reach steps within groups", () => {
  const steps = [{ type: "group", name: "Group", steps: [{ type: "call", target: "child" }] }];
  const replacement = { type: "set", field: "$result", value: 4 };
  assert.deepEqual(replaceStep(steps, "steps[0].steps[0]", replacement)[0].steps, [replacement]);
  assert.deepEqual(removeStep(steps, "steps[0].steps[0]")[0].steps, []);
  assert.deepEqual(
    bindLibraryCalls({ steps }, [{ alias: "child", source: "library:child" }]).imports,
    { child: "library:child" },
  );
});

test("drag moves fields between lists, reorders siblings, and refuses descendant cycles", () => {
  const fields = [
    { name: "a", initial: { kept: true } },
    {
      type: "group",
      name: "G",
      collapsed: true,
      description: "Keep",
      fields: [{ name: "b" }, { type: "group", name: "Nested", fields: [] }],
    },
  ];
  const moved = moveFieldEntry(fields, [0], [1], Number.MAX_SAFE_INTEGER);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].fields[2].name, "a");
  assert.deepEqual(moved[0].fields[2].initial, { kept: true });
  assert.equal(moved[0].description, "Keep");
  const outside = moveFieldEntry(moved, [0, 2], [], 0);
  assert.equal(outside[0].name, "a");
  assert.deepEqual(moveFieldEntry(fields, [1], [1, 1], 0), fields);
  assert.deepEqual(moveFieldEntry(fields, [0], [99], 0), fields);
  assert.deepEqual(
    moveFieldEntry([{ name: "a" }, { name: "b" }, { name: "c" }], [0], [], 3).map((f) => f.name),
    ["b", "c", "a"],
  );
  assert.equal(fields[0].name, "a");
});
