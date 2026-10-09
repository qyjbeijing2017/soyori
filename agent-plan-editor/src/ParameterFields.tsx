import type { ParameterEntry, ToolParameter } from "agent-plan-core";
import type { ReactNode } from "react";
import { GroupBlock } from "./GroupBlock";
import { tr } from "./i18n";

export function ParameterFields({
  entries,
  renderField,
  translate = false,
}: {
  entries: ParameterEntry[];
  renderField: (field: ToolParameter) => ReactNode;
  translate?: boolean;
}) {
  return (
    <div className="parameter-fields">
      {entries.map((entry, index) =>
        entry.type === "group" ? (
          <GroupBlock
            key={`group-${String(index)}`}
            name={translate ? tr(entry.name) : entry.name}
            description={
              entry.description && (translate ? tr(entry.description) : entry.description)
            }
            collapsed={entry.collapsed}
            count={entry.fields.length}
          >
            <ParameterFields
              entries={entry.fields}
              renderField={renderField}
              translate={translate}
            />
          </GroupBlock>
        ) : (
          <div key={entry.name}>
            {renderField(entry)}
            {entry.description && (
              <p className="parameter-help muted">
                {translate ? tr(entry.description) : entry.description}
              </p>
            )}
          </div>
        ),
      )}
    </div>
  );
}
