import {
  ActionIcon,
  Button,
  createTheme,
  Modal,
  NativeSelect,
  Select,
  Textarea,
  TextInput,
} from "@mantine/core";

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 7,
  defaultRadius: "md",
  fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
  colors: {
    brand: [
      "#edf8f4",
      "#d7eee5",
      "#acddcb",
      "#7fcab0",
      "#59ba98",
      "#3baf89",
      "#2aa57c",
      "#17685b",
      "#145e50",
      "#0c5144",
    ],
  },
  components: {
    Button: Button.extend({
      defaultProps: { size: "sm", variant: "light" },
      styles: { root: { minHeight: 44 } },
    }),
    ActionIcon: ActionIcon.extend({ defaultProps: { size: 44, radius: "50%", variant: "subtle" } }),
    TextInput: TextInput.extend({
      styles: { input: { minHeight: 44, fontWeight: 400 } },
    }),
    Textarea: Textarea.extend({
      styles: { input: { minHeight: 44, fontWeight: 400 } },
    }),
    Select: Select.extend({
      styles: { input: { minHeight: 44, fontWeight: 400 } },
    }),
    NativeSelect: NativeSelect.extend({
      styles: { input: { minHeight: 44, fontWeight: 400 } },
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        padding: "lg",
        radius: "lg",
        overlayProps: { backgroundOpacity: 0.32, blur: 0 },
      },
      styles: {
        title: { fontSize: 18, fontWeight: 600 },
        header: { paddingBottom: 20 },
        body: { paddingTop: 4 },
      },
    }),
  },
});
