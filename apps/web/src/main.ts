import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { WorkbenchApp } from "./app.ts";
import { WorkbenchController } from "./controller.ts";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("The workbench root is missing.");
const nonce = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); };
const controller = new WorkbenchController({ origin: location.origin, id: () => crypto.randomUUID(), nonce,
  clearFragment: () => history.replaceState(null, "", location.pathname) });
createRoot(root).render(createElement(WorkbenchApp, { controller }));
window.addEventListener("pagehide", () => controller.close(), { once: true });
