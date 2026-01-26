import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const rootElement = document.documentElement;
if (!rootElement.classList.contains("dark")) {
  rootElement.classList.add("dark");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
