const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server keeps required security protections enabled', () => {
  assert.match(server, /bcrypt\.hash\(password, 12\)/);
  assert.match(server, /password\.length < 10/);
  assert.match(server, /X-Content-Type-Options/);
  assert.match(server, /app\.get\('\/health'/);
  assert.match(server, /authAttemptCleanup\.unref\(\)/);
});

test('search endpoint is authenticated and capped', () => {
  assert.match(server, /app\.get\('\/api\/search', authMiddleware/);
  assert.match(server, /LIMIT 50/);
});
