import { Group, Modal, Text } from "@mantine/core";
import { useState } from "react";
import type { Step } from "soyori-core";
import { tr } from "./i18n";
import { StepForm } from "./StepForm";
import { stepSummary } from "./step-model";

// Mount for each editing session so cancelled drafts and previews are discarded together.
export function StepDialog({
  mode,
  step,
  disabled,
  onClose,
  onSave,
}: {
  mode: "add" | "edit";
  step: Step;
  disabled: boolean;
  onClose: () => void;
  onSave: (step: Step) => void | Promise<void>;
}) {
  const [summary, setSummary] = useState(() => stepSummary(step));
  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Group gap="sm" wrap="nowrap" miw={0}>
          <span style={{ flexShrink: 0 }}>{tr(mode === "add" ? "添加步骤" : "编辑步骤")}</span>
          <Text
            component="code"
            size="xs"
            c="dimmed"
            style={{ minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {summary}
          </Text>
        </Group>
      }
      styles={{ title: { flex: 1, minWidth: 0, marginRight: 12 } }}
      size="lg"
      closeButtonProps={{ "aria-label": tr("关闭") }}
    >
      <fieldset disabled={disabled}>
        <StepForm step={step} onSummaryChange={setSummary} onCancel={onClose} onSave={onSave} />
      </fieldset>
    </Modal>
  );
}
