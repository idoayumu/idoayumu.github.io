const express = require('express');
const path = require('path');
const routes = require('./routes.cjs');

const app = express();
const PORT = 3001;
const HOST = '127.0.0.1';

app.use(express.static(path.join(__dirname, 'public')));
app.use(routes);

app.listen(PORT, HOST, () => {
  console.log(`Model register tool running at http://${HOST}:${PORT}`);
});
