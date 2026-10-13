import { TextInput } from "@mantine/core";
import type { ComponentProps } from "react";
import { SensitiveEye, useSensitiveVisibility } from "./TimedPasswordInput";
import { AutoValueInput } from "./ValueEditor";

export function SensitiveValueInput({
  sensitive,
  ...props
}: ComponentProps<typeof AutoValueInput> & { sensitive?: boolean }) {
  const visibility = useSensitiveVisibility();
  if (!sensitive) return <AutoValueInput {...props} />;
  const eye = <SensitiveEye {...visibility} label={props.label} disabled={props.disabled} />;
  return (
    <div className="sensitive-value">
      <div hidden={!visibility.visible}>
        <AutoValueInput {...props} rightSection={eye} rightSectionWidth={84} />
      </div>
      {!visibility.visible && (
        <TextInput
          aria-label={props.label}
          value="••••••••"
          readOnly
          rightSection={eye}
          rightSectionWidth={48}
          rightSectionPointerEvents="all"
        />
      )}
    </div>
  );
}
