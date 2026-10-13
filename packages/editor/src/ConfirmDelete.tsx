import { Button, Modal } from "@mantine/core";
import { useState } from "react";
import { tr } from "./i18n";

export function ConfirmDelete({
  title,
  onClose,
  onConfirm,
  message = tr("确认删除此项？"),
  confirmLabel = tr("确认删除"),
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      opened
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      centered
      zIndex={400}
      closeButtonProps={{ "aria-label": tr("关闭"), disabled: busy }}
    >
      <p>{message}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="subtle" disabled={busy} onClick={onClose}>
          {tr("取消")}
        </Button>
        <Button
          color="red"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
              onClose();
            } catch (cause) {
              setError(String(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
