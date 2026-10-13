import { ActionIcon, PasswordInput, type PasswordInputProps } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { tr } from "./i18n";

export function useSensitiveVisibility() {
  const [visible, setVisible] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const deadline = useRef(0);
  function toggle() {
    if (visible) {
      setVisible(false);
      setRemaining(0);
    } else {
      deadline.current = Date.now() + 30_000;
      setRemaining(30);
      setVisible(true);
    }
  }
  useEffect(() => {
    if (!visible) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setVisible(false);
    };
    const interval = setInterval(update, 1000);
    const timeout = setTimeout(update, Math.max(0, deadline.current - Date.now()));
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", update);
    };
  }, [visible]);
  return { visible, remaining, toggle };
}

export function SensitiveEye({
  visible,
  remaining,
  toggle,
  label,
  disabled,
}: ReturnType<typeof useSensitiveVisibility> & { label: string; disabled?: boolean }) {
  return (
    <div className="sensitive-eye">
      {visible && (
        <span
          className="sensitive-countdown"
          role="timer"
          aria-label={tr("将在 {{seconds}} 秒后隐藏", { seconds: remaining })}
        >
          {remaining}s
        </span>
      )}
      <ActionIcon
        type="button"
        size={44}
        variant="subtle"
        color="gray"
        disabled={disabled}
        onClick={toggle}
        aria-label={tr(visible ? "隐藏 {{name}}" : "显示 {{name}}", { name: label })}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </ActionIcon>
    </div>
  );
}

export function TimedPasswordInput(props: PasswordInputProps) {
  const visibility = useSensitiveVisibility();
  return (
    <PasswordInput
      {...props}
      visible={visibility.visible}
      autoComplete={props.autoComplete ?? "off"}
      rightSectionWidth={visibility.visible ? 84 : 48}
      rightSection={
        <SensitiveEye
          {...visibility}
          label={
            typeof props.label === "string" ? props.label : (props["aria-label"] ?? tr("敏感值"))
          }
          disabled={props.disabled}
        />
      }
    />
  );
}
