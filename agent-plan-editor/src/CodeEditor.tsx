import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { Button, Group, Modal, Text } from "@mantine/core";
import { parse } from "acorn";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { relativeModulePath } from "./code-paths";
import { tr } from "./i18n";
import { listFiles } from "./workspace-files";

export const CodeFilePath = createContext("flow.yaml");

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  path?: string;
  script?: boolean;
  disabled?: boolean;
};
export function CodeEditor(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const inheritedPath = useContext(CodeFilePath);
  const path = props.path ?? inheritedPath;
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    void listFiles()
      .then((files) => setPaths(files.filter((f) => f.kind === "file").map((f) => f.path)))
      .catch(() => setPaths([]));
  }, []);
  const surface = (full: boolean) => (
    <EditorSurface {...props} path={path} paths={paths} full={full} />
  );
  return (
    <div className="code-editor">
      <Group justify="space-between" className="code-editor-toolbar">
        <Text size="xs" c="dimmed">
          {props.script ? "JavaScript" : path.split(".").at(-1)?.toUpperCase()}
        </Text>
        <Button type="button" size="compact-xs" variant="subtle" onClick={() => setExpanded(true)}>
          {tr("展开编辑")}
        </Button>
      </Group>
      {!expanded && surface(false)}
      <Modal opened={expanded} onClose={() => setExpanded(false)} fullScreen title={props.label}>
        {expanded && surface(true)}
        <Group justify="flex-end" mt="md">
          <Button onClick={() => setExpanded(false)}>{tr("完成编辑")}</Button>
        </Group>
      </Modal>
    </div>
  );
}
function EditorSurface({
  value,
  onChange,
  label,
  path = "flow.yaml",
  script,
  disabled,
  paths,
  full,
}: Props & { paths: string[]; full: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ value, onChange, paths });
  latest.current = { value, onChange, paths };
  useEffect(() => {
    const js = script || /\.(m?js|cjs|ts)$/i.test(path);
    const instance = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          lineNumbers(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.lineWrapping,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          ...(js
            ? [javascript({ typescript: !script && path.endsWith(".ts") })]
            : path.endsWith(".json")
              ? [json()]
              : /\.ya?ml$/i.test(path)
                ? [yaml()]
                : []),
          EditorState.readOnly.of(Boolean(disabled)),
          EditorView.editable.of(!disabled),
          EditorView.contentAttributes.of({
            "aria-label": label,
            "aria-multiline": "true",
            role: "textbox",
          }),
          placeholder(script ? "result(input);" : ""),
          autocompletion({
            override: js
              ? [
                  (context) => {
                    const before = context.state.sliceDoc(0, context.pos);
                    const match = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"'\n]*)$/.exec(before);
                    if (match)
                      return {
                        from: context.pos - match[1].length,
                        options: latest.current.paths
                          .filter((p) => p !== path && /\.(m?js|cjs|json)$/i.test(p))
                          .map((p) => ({ label: relativeModulePath(path, p), type: "text" })),
                        validFor: /^[^"'\n]*$/,
                      };
                    const word = context.matchBefore(/\w*/);
                    if (!word || (!context.explicit && word.from === word.to)) return null;
                    return {
                      from: word.from,
                      options: [
                        { label: "input", type: "variable", info: tr("脚本输入参数") },
                        {
                          label: "result",
                          type: "function",
                          detail: "(value)",
                          info: tr("设置输出，继续执行；最后一次调用生效。"),
                        },
                        { label: "console", type: "variable" },
                        { label: "await", type: "keyword" },
                        { label: "import", type: "keyword" },
                      ],
                      validFor: /^\w*$/,
                    };
                  },
                ]
              : undefined,
          }),
          ...(js && !path.endsWith(".ts")
            ? [
                lintGutter(),
                linter((editor) => {
                  try {
                    parse(editor.state.doc.toString(), {
                      ecmaVersion: "latest",
                      sourceType: "module",
                    });
                    return [];
                  } catch (error) {
                    const e = error as Error & { pos?: number };
                    const from = Math.min(e.pos ?? 0, editor.state.doc.length);
                    return [
                      {
                        from,
                        to: Math.min(from + 1, editor.state.doc.length),
                        severity: "error" as const,
                        message: e.message,
                      },
                    ];
                  }
                }),
              ]
            : []),
          EditorView.theme({
            "&": { minHeight: full ? "70dvh" : "180px", fontSize: "14px" },
            ".cm-scroller": {
              overflow: "auto",
              maxHeight: full ? "75dvh" : "420px",
              fontFamily: "ui-monospace, Consolas, monospace",
            },
            ".cm-content": { padding: "12px 0" },
            ".cm-gutters": { backgroundColor: "#f5f8f6", color: "#7b8e88", border: "none" },
            "&.cm-focused": { outline: "none" },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
  }, [label, path, script, disabled, full]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={parent} className="code-editor-surface" />;
}
