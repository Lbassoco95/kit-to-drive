import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import App from "./App.tsx";
import "./index.css";

// Restaurar preferencia "Reducir efectos" antes del primer paint de cristal.
try {
  if (localStorage.getItem("dazon_efectos") === "reducir") {
    document.documentElement.classList.add("sin-cristal");
  }
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);
