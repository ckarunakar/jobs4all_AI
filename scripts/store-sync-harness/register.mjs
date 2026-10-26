// Loaded with `node --import`; installs loader.mjs before the harness runs.
import { register } from "node:module";

register("./loader.mjs", import.meta.url);
