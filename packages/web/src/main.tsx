import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initErrorReporter } from './lib/errorReporter.js';

// Initialize global error reporter before rendering so all uncaught errors
// and unhandled promise rejections are captured and sent to CloudWatch.
// Requirements: 6.7
initErrorReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
