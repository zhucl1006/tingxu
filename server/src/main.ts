import { createControlPlaneServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const { server } = createControlPlaneServer();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Tingxu Control Plane] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[Tingxu Control Plane] Append-only billing ledger active.`);
});

const handleShutdown = () => {
  console.log('[Tingxu Control Plane] Gracefully shutting down...');
  server.close(() => {
    console.log('[Tingxu Control Plane] Closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
