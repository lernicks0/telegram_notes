const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  STUDENT_NAMES,
  STUDENT_IDS,
  TEACHER_IDS,
  ADMIN_IDS: PRIVATE_ADMIN_IDS,
  ROLE_BY_ID,
  ACCOUNT_BY_ID
} = require('./participants');

const ACCOUNTS_FILE = process.env.CLASS_ACCOUNTS_FILE || path.join(__dirname, 'accounts.json');
const SESSIONS_FILE = process.env.CLASS_SESSIONS_FILE || path.join(__dirname, 'sessions.json');
const SESSION_LIFE = 30 * 24 * 60 * 60 * 1000;

const NAMES = STUDENT_IDS.concat(TEACHER_IDS);
const NAME_SET = new Set(NAMES);
const STUDENT_NAME_SET = new Set(STUDENT_NAMES);
const STUDENT_ID_SET = new Set(STUDENT_IDS);
const ADMIN_IDS = new Set(PRIVATE_ADMIN_IDS);

function normalizeId(value) {
  const clean = String(value || '').trim().toLowerCase();
  if (/^\d+$/.test(clean)) return String(Number(clean));
  return clean;
}

function roleFor(id) {
  return ROLE_BY_ID.get(normalizeId(id)) || null;
}

function baseAccounts() {
  return {
    version: 1,
    accounts: Object.fromEntries(NAMES.map(id => [id, {
      password: null,
      passwordUpdatedAt: null
    }]))
  };
}

function readAccounts() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (_) {}
  const result = baseAccounts();
  for (const id of NAMES) {
    const account = saved && saved.accounts && saved.accounts[id];
    if (!account || !account.password) continue;
    const salt = String(account.password.salt || '');
    const hash = String(account.password.hash || '');
    if (/^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{128}$/.test(hash)) {
      result.accounts[id].password = { salt, hash };
      result.accounts[id].passwordUpdatedAt = typeof account.passwordUpdatedAt === 'string'
        ? account.passwordUpdatedAt : null;
    }
  }
  return result;
}

async function atomicWrite(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(temp, file);
  } catch (error) {
    await fs.promises.unlink(temp).catch(() => {});
    throw error;
  }
}

let accountChain = Promise.resolve();
function updateAccounts(mutator) {
  const job = accountChain.then(async () => {
    const data = readAccounts();
    const result = await mutator(data);
    await atomicWrite(ACCOUNTS_FILE, data);
    return result;
  });
  accountChain = job.catch(() => {});
  return job;
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(salt, 'hex'), 64, (error, key) => {
      if (error) reject(error);
      else resolve(key.toString('hex'));
    });
  });
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 6 || value.length > 72) {
    throw Object.assign(new Error('密码长度需要在 6～72 个字符之间'), { status: 400 });
  }
  return value;
}

async function setPassword(id, password) {
  id = normalizeId(id);
  if (!NAME_SET.has(id)) throw Object.assign(new Error('没有这个班级账号'), { status: 404 });
  const clean = validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(clean, salt);
  await updateAccounts(data => {
    data.accounts[id].password = { salt, hash };
    data.accounts[id].passwordUpdatedAt = new Date().toISOString();
  });
  await deleteSessionsForId(id);
}

async function verifyPassword(id, password) {
  id = normalizeId(id);
  if (!NAME_SET.has(id)) return false;
  const account = readAccounts().accounts[id];
  if (!account.password) return false;
  const actual = await scrypt(String(password || ''), account.password.salt);
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(account.password.hash, 'hex'));
}

function publicAccount(id) {
  id = normalizeId(id);
  if (!NAME_SET.has(id)) return null;
  const account = readAccounts().accounts[id];
  const rosterAccount = ACCOUNT_BY_ID.get(id);
  return {
    id,
    name: rosterAccount.name,
    role: roleFor(id),
    isAdmin: ADMIN_IDS.has(id),
    countsAsStudent: STUDENT_ID_SET.has(id),
    hasPassword: !!account.password,
    passwordUpdatedAt: account.passwordUpdatedAt
  };
}

function listAccounts() {
  const data = readAccounts();
  return NAMES.map(id => ({
    id,
    name: ACCOUNT_BY_ID.get(id).name,
    role: roleFor(id),
    isAdmin: ADMIN_IDS.has(id),
    countsAsStudent: STUDENT_ID_SET.has(id),
    hasPassword: !!data.accounts[id].password,
    passwordUpdatedAt: data.accounts[id].passwordUpdatedAt
  }));
}

function readSessions() {
  try {
    const saved = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    return saved && saved.sessions && typeof saved.sessions === 'object'
      ? { version: 1, sessions: saved.sessions } : { version: 1, sessions: {} };
  } catch (_) {
    return { version: 1, sessions: {} };
  }
}

let sessionChain = Promise.resolve();
function updateSessions(mutator) {
  const job = sessionChain.then(async () => {
    const data = readSessions();
    const now = Date.now();
    for (const [key, item] of Object.entries(data.sessions)) {
      if (!item || !NAME_SET.has(item.id) || Number(item.expiresAt) <= now) delete data.sessions[key];
    }
    const result = await mutator(data);
    await atomicWrite(SESSIONS_FILE, data);
    return result;
  });
  sessionChain = job.catch(() => {});
  return job;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function createSession(id) {
  id = normalizeId(id);
  if (!NAME_SET.has(id)) throw Object.assign(new Error('没有这个班级账号'), { status: 404 });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_LIFE;
  await updateSessions(data => {
    data.sessions[tokenHash(token)] = { id, expiresAt, createdAt: new Date().toISOString() };
  });
  return { token, expiresAt };
}

function sessionAccount(token) {
  if (!token) return null;
  const item = readSessions().sessions[tokenHash(token)];
  if (!item || Number(item.expiresAt) <= Date.now()) return null;
  return publicAccount(item.id);
}

async function deleteSession(token) {
  if (!token) return;
  await updateSessions(data => { delete data.sessions[tokenHash(token)]; });
}

async function deleteSessionsForId(id) {
  id = normalizeId(id);
  await updateSessions(data => {
    for (const [key, item] of Object.entries(data.sessions)) {
      if (item && item.id === id) delete data.sessions[key];
    }
  });
}

async function ensureFiles() {
  if (!fs.existsSync(ACCOUNTS_FILE)) await atomicWrite(ACCOUNTS_FILE, baseAccounts());
  if (!fs.existsSync(SESSIONS_FILE)) await atomicWrite(SESSIONS_FILE, { version: 1, sessions: {} });
}

module.exports = {
  STUDENT_NAMES,
  STUDENT_NAME_SET,
  STUDENT_IDS,
  STUDENT_ID_SET,
  TEACHER_IDS,
  NAMES,
  NAME_SET,
  ADMIN_IDS,
  SESSION_LIFE,
  normalizeId,
  ensureFiles,
  setPassword,
  verifyPassword,
  publicAccount,
  listAccounts,
  createSession,
  sessionAccount,
  deleteSession
};
