import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./preview.css";
import { PreviewApp } from "./preview-app";

const root = document.getElementById("root");
if (!root) throw new Error("Falta #root en preview/index.html");

createRoot(root).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
