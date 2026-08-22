import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { DemoProvider } from "./state";
import App from "./App";
import "@fontsource-variable/lexend";
import "@fontsource-variable/source-sans-3";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><DemoProvider><App/></DemoProvider></BrowserRouter></React.StrictMode>);
