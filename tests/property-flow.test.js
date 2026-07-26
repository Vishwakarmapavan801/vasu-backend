const assert = require('assert');
const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

(async () => {
  const response = await getJson('http://localhost:5000/api/properties?top=3');
  assert.strictEqual(response.statusCode, 200, 'expected backend listings endpoint to return 200');
  assert.ok(Array.isArray(response.body.data), 'expected data array in response');
  assert.ok(response.body.data.length > 0, 'expected at least one listing from MLS');
  const first = response.body.data[0];
  assert.ok(first.ListingId || first.ListingKey, 'expected listing identifier');
  console.log('backend property flow ok', { count: response.body.data.length, firstId: first.ListingId || first.ListingKey });
})();
