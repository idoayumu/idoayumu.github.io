const express = require('express');
const path = require('path');
const routes = require('./routes.cjs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.static(path.join(__dirname, 'public')));
app.use(routes);

const server = app.listen(PORT, HOST, () => {
  console.log(`Image register tool running at http://${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the old image-register server or run with PORT=3001.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
