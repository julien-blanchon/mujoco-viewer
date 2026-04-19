import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

// Mirror VSCode's body.vscode-dark / vscode-light onto html.dark so
// shadcn-svelte's `dark:` utilities stay consistent with the theme bridge
// in app.css. VSCode re-applies its class on theme changes; MutationObserver
// keeps the root in sync.
function syncDarkClass(): void {
  const dark =
    document.body.classList.contains("vscode-dark") ||
    (document.body.classList.contains("vscode-high-contrast") &&
      !document.body.classList.contains("vscode-high-contrast-light"));
  document.documentElement.classList.toggle("dark", dark);
}
syncDarkClass();
new MutationObserver(syncDarkClass).observe(document.body, {
  attributes: true,
  attributeFilter: ["class"],
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

mount(App, { target: root });
