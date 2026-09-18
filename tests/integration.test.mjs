import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const port = 3199;
const db = path.resolve('data/integration-test.db');
await rm(db, { force: true });
const server = spawn(process.execPath, ['server.mjs'], {
  env: { ...process.env, PORT: String(port), DATABASE_PATH: db, ADMIN_REGISTRATION_CODE: 'integration-only-secret' },
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', data => data.toString().includes('running') && resolve());
  server.on('error', reject);
});
test.after(async () => { server.kill(); await rm(db, { force: true }); });
const request = async (url, { cookie, ...options } = {}) => {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
  });
  return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

let adminCookie, customerCookie, productId, couponId, orderId;

test('admin bootstrap is one-time and has an authenticated dashboard', async () => {
  assert.equal((await request('/api/admin/bootstrap/status')).body.needed, true);
  const first = await request('/api/admin/bootstrap', { method: 'POST', body: JSON.stringify({ name: 'Admin', email: 'admin@test.local', password: 'a-secure-password', code: 'integration-only-secret' }) });
  assert.equal(first.response.status, 201); adminCookie = first.cookie;
  assert.equal((await request('/api/admin/dashboard', { cookie: adminCookie })).response.status, 200);
  const second = await request('/api/admin/bootstrap', { method: 'POST', body: JSON.stringify({ name: 'Other', email: 'other@test.local', password: 'a-secure-password', code: 'integration-only-secret' }) });
  assert.equal(second.response.status, 409);
});

test('admin can create, update, and delete a product and coupon', async () => {
  const cats = await request('/api/admin/categories', { cookie: adminCookie });
  const product = await request('/api/admin/products', { cookie: adminCookie, method: 'POST', body: JSON.stringify({ name: 'Test Pizza', description: 'Integration product', categoryId: cats.body[0].id, price: 100, oldPrice: 120, discount: 10, sizes: ['Large'], addons: ['Cheese'] }) });
  assert.equal(product.response.status, 201); productId = product.body.id;
  assert.equal((await request(`/api/admin/products/${productId}`, { cookie: adminCookie, method: 'PUT', body: JSON.stringify({ name: 'Updated Pizza', description: 'Updated', categoryId: cats.body[0].id, price: 125, oldPrice: null, discount: 0, sizes: [], addons: [], available: true }) })).response.status, 200);
  const coupon = await request('/api/admin/coupons', { cookie: adminCookie, method: 'POST', body: JSON.stringify({ code: 'TEST20', discountType: 'percentage', discountValue: 20, minimumOrder: 100 }) });
  assert.equal(coupon.response.status, 201); couponId = coupon.body.id;
  assert.equal((await request(`/api/admin/coupons/${couponId}`, { cookie: adminCookie, method: 'PUT', body: JSON.stringify({ code: 'TEST15', discountType: 'percentage', discountValue: 15, minimumOrder: 100, active: true }) })).response.status, 200);
});

test('customer checkout uses server prices and customer cannot access admin', async () => {
  const customer = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Customer', email: 'customer@test.local', phone: '01000000000', password: 'a-secure-password' }) });
  assert.equal(customer.response.status, 201); customerCookie = customer.cookie;
  assert.equal((await request('/api/admin/dashboard', { cookie: customerCookie })).response.status, 403);
  const fake = await request('/api/orders', { cookie: customerCookie, method: 'POST', body: JSON.stringify({ fullName: 'Customer', phone: '01000000000', address: '1 Test Street', city: 'Cairo', coupon: 'TEST15', items: [{ productId, quantity: 1, price: 1 }] }) });
  assert.equal(fake.response.status, 201);
  assert.equal(fake.body.total, 131.25); // 125 - 15% + 25 delivery; client price is deliberately ignored.
  const orders = await request('/api/orders', { cookie: customerCookie }); assert.equal(orders.body.length, 1); orderId = orders.body[0].id;
});

test('admin can change order status and customer account status', async () => {
  assert.equal((await request(`/api/admin/orders/${orderId}/status`, { cookie: adminCookie, method: 'PATCH', body: JSON.stringify({ status: 'Preparing' }) })).response.status, 200);
  const customers = await request('/api/admin/customers', { cookie: adminCookie });
  assert.equal((await request(`/api/admin/customers/${customers.body[0].id}/status`, { cookie: adminCookie, method: 'PATCH', body: JSON.stringify({ status: 'disabled' }) })).response.status, 200);
  assert.equal((await request('/api/orders', { cookie: customerCookie })).response.status, 403);
});

test('admin can delete test records', async () => {
  assert.equal((await request(`/api/admin/coupons/${couponId}`, { cookie: adminCookie, method: 'DELETE' })).response.status, 200);
  assert.equal((await request(`/api/admin/products/${productId}`, { cookie: adminCookie, method: 'DELETE' })).response.status, 200);
});
