export default {
  // nextron's own "is the renderer up yet" check gets (startupDelay / 500)
  // retries at 500ms apart. With no config here it defaulted to 0 retries,
  // so `npm run dev` almost always lost the race against Next.js's own
  // ~1-1.5s startup and gave up — leaving an orphaned `next dev` process on
  // port 8888 with no Electron window ever attached to it.
  startupDelay: 8000,
};
