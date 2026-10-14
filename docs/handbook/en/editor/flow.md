# Editing flows: Steps, source, and saving

Open a Library flow to see its steps in execution order. Conditions, loops, and groups contain indented blocks. Forms and YAML/JSON source edit the same flow.

## Add and edit steps

![A Call step parameter form](../../images/en/flow-calling-editor.jpg)

1. Click **Add step** and choose an operation: field update, condition, loop, template, calculation, or call.
2. Enter values or field references, and choose output destinations.
3. Confirm and review the summary. Click the step to edit it again.

For Call, choose a tool or subflow first. Required inputs and optional advanced parameters follow its actual interface. Examples start in the [overview](../flows/language.md).

## Order, nesting, and groups

![Sequential steps nested inside a loop](../../images/en/flow-control-editor.jpg)

Drag steps to reorder them. Add child steps inside branches, loop bodies, or groups. Indentation identifies the enclosing block. Collapsing only hides detail; it does not skip execution. Grouped fields keep their original reference names.

Fields and Steps can collapse independently. On phones, collapse one area to reach the other and scroll inside long forms before confirming. See the [mobile quick start](../quick-start-mobile.md).

## Edit source and save

![YAML source in the Library source editor](../../images/en/flow-control-yaml.jpg)

In Library, right-click a flow on desktop or use its mobile action menu, then choose **Source**. Scripts and configuration files also open as source. Highlighting and diagnostics help, while Core validation determines whether JSON/YAML is a valid flow.

Source edits require an explicit save; closing the dialog or full-screen mode does not save. Confirmed field and step forms save to Library. Filename, flow name, and subflow alias are separate; moves and renames do not repair all imports automatically.

Saved fields use **name: configuration** mappings. Groups use type: group and another fields mapping. Legacy field lists can be opened; Editor saves them as mappings while preserving defaults, flags, and sensitive markings.

## Run the intended version

Editor tests use the editing session; assistant flow.inspect and flow.run read saved files. Save first, then verify with the same inputs. Continue with [debugging](../debugging/guide.md).
