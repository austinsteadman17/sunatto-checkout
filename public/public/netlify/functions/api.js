// Wraps the Express app (server.js) as a single Netlify Function so none of
// the route logic has to be duplicated or rewritten for Netlify specifically.
// netlify.toml redirects all /api/* traffic on the deployed site to this
// function.
const serverless = require('serverless-http');
const app = require('../../server');

module.exports.handler = serverless(app);
