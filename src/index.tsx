// @ts-nocheck
import "./ui-ux-pro-max/tokens.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerServiceWorker } from "./pwa/registerServiceWorker";

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

registerServiceWorker({
  env: process.env.NODE_ENV,
  onUpdate: (registration) => window.dispatchEvent(new CustomEvent("tbm:pwa-update", { detail: registration })),
  onOfflineReady: () => window.dispatchEvent(new Event("tbm:pwa-ready")),
});
