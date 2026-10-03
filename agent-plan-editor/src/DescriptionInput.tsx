import { Button, Textarea, type TextareaProps } from "@mantine/core";
import { useState } from "react";
import { tr } from "./i18n";
import { MarkdownText } from "./MarkdownText";

export function DescriptionInput({ value, defaultValue, onChange, ...props }: TextareaProps) {
  const [draft, setDraft] = useState(String(defaultValue ?? ""));
  const [preview, setPreview] = useState(false);
  const source = String(value ?? draft);
  return (
    <div className="description-editor">
      <div hidden={preview}>
        <Textarea
          {...props}
          value={source}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            onChange?.(event);
          }}
        />
      </div>
      {preview && (
        <section className="description-preview" aria-label={tr("说明预览")}>
          <span className="description-label">{props.label}</span>
          <MarkdownText source={source || tr("暂无说明")} />
        </section>
      )}
      <Button
        type="button"
        variant="subtle"
        size="compact-sm"
        aria-pressed={preview}
        onClick={() => setPreview(!preview)}
      >
        {tr(preview ? "编辑说明" : "预览说明")}
      </Button>
    </div>
  );
}
