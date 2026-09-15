#!/usr/bin/env node
import { runWorkerMain } from "./cli/worker.js";

const code = await runWorkerMain(process.argv.slice(2));
process.exit(code);
