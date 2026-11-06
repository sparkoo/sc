import React from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

function App() {
  React.useEffect(() => { void invoke("frontend_ready"); }, []);
  return <main><h1>SC Commander</h1></main>;
}

createRoot(document.getElementById("root")!).render(<App />);
