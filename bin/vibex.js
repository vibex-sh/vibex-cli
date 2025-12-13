#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, '..', 'index.js');

// Directly import and run the main function
import(cliPath).then((module) => {
  // The main function is already called in index.js
}).catch((error) => {
  console.error('Error loading CLI:', error);
  process.exit(1);
});



