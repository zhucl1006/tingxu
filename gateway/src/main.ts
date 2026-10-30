import { createGatewayServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const { server } = createGatewayServer();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Tingxu AI Gateway] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[Tingxu AI Gateway] Zero-Content policy active. Sensitive logs redacted.`);
});

// 优雅停机
const handleShutdown = () => {
  console.log('[Tingxu AI Gateway] Gracefully shutting down...');
  server.close(() => {
    console.log('[Tingxu AI Gateway] Closed all connections.');
    process.exit(0);
  });
};

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
