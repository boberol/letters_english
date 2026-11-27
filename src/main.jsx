import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
// Before the first render: the browser offers installing only once, early.
import "./utils/install";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);