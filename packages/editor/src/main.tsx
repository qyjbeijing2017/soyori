import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { theme } from "./theme";
import "./i18n";
import "@mantine/core/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing editor root");
createRoot(root).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>,
);
