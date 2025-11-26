import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

export async function getClockOffset(serverUrl, samples = 7) {
  const offsets = [];
  for (let i = 0; i < samples; i++) {
    const t0Perf = performance.now();
    const t0Date = Date.now();
    const resp = await fetch(serverUrl, { cache: 'no-store' });
    const serverMs = await resp.json(); // e.g. { "now": 1732461234567 }
    const t1Perf = performance.now();
    const rtt = t1Perf - t0Perf;
    const clientMidDate = t0Date + rtt / 2;
    const offset = serverMs.now - clientMidDate;
    offsets.push(offset);
  }
  offsets.sort((a,b)=>a-b);
  return offsets[Math.floor(offsets.length/2)];
}

export function scheduleAligned(startServerMs, offset) {
  const targetPerf = performance.now() + (startServerMs - (Date.now() + offset));
  function busyWait(deadline) {
    while (performance.now() < deadline) {}
    // Start action
    console.log('Aligned start at', performance.now());
  }
  function rafPhase() {
    const remaining = targetPerf - performance.now();
    if (remaining <= 2) {
      busyWait(targetPerf);
    } else {
      requestAnimationFrame(rafPhase);
    }
  }
  const initialDelay = targetPerf - performance.now() - 30;
  if (initialDelay > 0) {
    setTimeout(() => requestAnimationFrame(rafPhase), initialDelay);
  } else {
    requestAnimationFrame(rafPhase);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
