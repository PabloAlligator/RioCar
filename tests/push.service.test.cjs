const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function service({ enabled = true, subscriptions = [], onSend = async () => {} } = {}) {
  const calls = { notifications: [], removed: [], findMany: [] };
  const webpush = {
    setVapidDetails(subject, publicKey, privateKey) {
      calls.vapid = [subject, publicKey, privateKey];
    },
    async sendNotification(subscription, payload, options) {
      calls.notifications.push({ subscription, payload: JSON.parse(payload), options });
      await onSend(subscription);
    },
  };
  const prisma = {
    pushSubscription: {
      async findMany(args) {
        calls.findMany.push(args);
        return subscriptions.filter((item) => !args.where?.adminId || item.adminId === args.where.adminId);
      },
      async deleteMany(args) {
        calls.removed.push(args.where);
      },
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/push.service.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '') + '\nthis.exports = { pushConfigured, sendNewLeadNotification, sendTestNotification };';
  const context = { webpush, prisma, process: { env: enabled ? {
    VAPID_SUBJECT: 'mailto:test@example.com',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
  } : {} }, console, JSON, Promise, Date };
  vm.runInNewContext(source, context, { filename: 'push.service.js' });
  return { ...context.exports, calls };
}

const subscription = (id, adminId = 1) => ({ id, adminId, endpoint: `https://push.example/${id}`, p256dh: 'key', auth: 'auth' });

test('без VAPID сервис пропускает отправку, а не ломает заявки', async () => {
  const push = service({ enabled: false, subscriptions: [subscription(1)] });
  const result = await push.sendNewLeadNotification({ id: 100, name: 'Тест', car: 'Rio', phone: '89999999999' });
  assert.equal(result.sent, 0);
  assert.equal(result.disabled, true);
  assert.equal(push.calls.notifications.length, 0);
});

test('новая заявка отправляется всем подписанным устройствам с ссылкой на конкретную заявку', async () => {
  const push = service({ subscriptions: [subscription(1), subscription(2)] });
  const result = await push.sendNewLeadNotification({ id: 42, name: 'Гость', car: 'Kia Rio', phone: '+7 999 000 00 00' });
  assert.equal(result.sent, 2);
  assert.equal(push.calls.notifications.length, 2);
  for (const sent of push.calls.notifications) {
    assert.equal(sent.payload.url, '/admin/requests?lead=42');
    assert.equal(sent.payload.tag, 'riocar-lead-42');
    assert.ok(sent.payload.title.includes('42'));
    assert.ok(sent.payload.body.includes('Kia Rio'));
    assert.ok(sent.options.TTL >= 60);
  }
});

test('истёкшие подписки удаляются, а ошибки push не прерывают отправку остальным', async () => {
  const push = service({ subscriptions: [subscription(1), subscription(2)], onSend: async (s) => {
    if (s.endpoint.endsWith('/1')) throw { statusCode: 410 };
  } });
  const result = await push.sendNewLeadNotification({ id: 7, name: 'Test', car: 'A', phone: '1' });
  assert.equal(result.sent, 1);
  assert.equal(push.calls.removed.length, 1);
  assert.equal(push.calls.removed[0].id, 1);
});

test('тестовое уведомление идёт только на устройства выбранного администратора', async () => {
  const push = service({ subscriptions: [subscription(1, 1), subscription(2, 2)] });
  const result = await push.sendTestNotification(2);
  assert.equal(result.sent, 1);
  assert.ok(push.calls.notifications[0].subscription.endpoint.endsWith('/2'));
});
