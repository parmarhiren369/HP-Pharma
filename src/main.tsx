import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("Application starting...");

const rootElement = document.getElementById("root");
console.log("Root element:", rootElement);

if (!rootElement) {
  console.error("Root element not found!");
  document.body.innerHTML = '<div style="color: white; padding: 20px;">Error: Root element not found</div>';
} else {
  try {
    createRoot(rootElement).render(<App />);
    console.log("App rendered successfully");
  } catch (error) {
    console.error("Error rendering app:", error);
    document.body.innerHTML = `<div style="color: white; padding: 20px;">Error: ${error}</div>`;
  }
}
