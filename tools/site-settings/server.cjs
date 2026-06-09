const express = require('express');
const path = require('path');
const routes = require('./routes.cjs');

const app = express();
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '127.0.0.1';

const ROOT = path.resolve(__dirname, '..', '..');

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(ROOT, 'public', 'images')));
app.use(express.json({ limit: '2mb' }));
app.use(routes);

const server = app.listen(PORT, HOST, () => {
  console.log(`Site settings tool running at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the old site-settings server or run with PORT=3003.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
