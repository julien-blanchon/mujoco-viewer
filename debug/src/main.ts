import { mount } from "svelte";
import App from "./App.svelte";
import "./theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
mount(App, { target: root });
