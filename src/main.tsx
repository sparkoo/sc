import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import { App } from "./App";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <Theme
    appearance="dark"
    accentColor="amber"
    grayColor="slate"
    radius="none"
  >
    <App />
  </Theme>,
);
