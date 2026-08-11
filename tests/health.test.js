const request = require('supertest');
const express = require('express');
const { getHealth, getReadiness } = require('../../src/services/monitoring/healthCheck');

jest.mock('../../src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ now: new Date().toISOString() }] }),
}));

describe('Health Check Service', () => {
  test('getHealth returns uptime and db status', async () => {
    const health = await getHealth();
    expect(health).toHaveProperty('uptime');
    expect(health).toHaveProperty('database');
    expect(health.database.status).toBe('healthy');
    expect(health.overall).toBe('healthy');
  });

  test('getReadiness returns ready status', async () => {
    const readiness = await getReadiness();
    expect(readiness).toHaveProperty('ready');
    expect(readiness.ready).toBe(true);
  });
});

describe('Health Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
    app.get('/readyz', async (_req, res) => {
      const readiness = await getReadiness();
      if (readiness.ready) {
        res.status(200).json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'not ready' });
      }
    });
  });

  test('GET /healthz returns 200', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /readyz returns 200 when db is healthy', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});
