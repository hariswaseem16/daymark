import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";
import "./index.css";
import { registerPwaServiceWorker } from "./services/pwa.js";

registerPwaServiceWorker().catch((error) => {
  console.error("Daymark could not enable offline app support.", error);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
