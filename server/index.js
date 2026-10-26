'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3013;
const DATA_FILE = path.join(__dirname, 'data.json');
const RECORD_TYPES = ['feeding', 'health', 'vaccine', 'weight'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------- 数据持久化（server/data.json） ---------------- */

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(data.pets) || !Array.isArray(data.records)) throw new Error('数据结构不正确');
    return data;
  } catch (err) {
    // data.json 缺失或损坏时以空数据重建
    const data = { pets: [], records: [] };
    saveData(data);
    return data;
  }
}

const db = loadData();

function nextId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------------- 中间件与静态资源 ---------------- */

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

/* ---------------- 宠物档案 CRUD ---------------- */

app.get('/api/pets', (req, res) => {
  res.json({ pets: db.pets });
});

app.post('/api/pets', (req, res) => {
  const { name, species, breed, gender, birthDate, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: '宠物名字必填' });
  if (!species || !String(species).trim()) return res.status(400).json({ error: '物种必填' });
  const pet = {
    id: nextId('pet'),
    name: String(name).trim(),
    species: String(species).trim(),
    breed: String(breed || '').trim(),
    gender: String(gender || '').trim(),
    birthDate: String(birthDate || '').trim(),
    notes: String(notes || '').trim(),
    createdAt: new Date().toISOString(),
  };
  db.pets.push(pet);
  saveData(db);
  res.status(201).json({ pet });
});

app.put('/api/pets/:id', (req, res) => {
  const pet = db.pets.find((p) => p.id === req.params.id);
  if (!pet) return res.status(404).json({ error: '宠物不存在' });
  const { name, species, breed, gender, birthDate, notes } = req.body || {};
  if (name != null) {
    if (!String(name).trim()) return res.status(400).json({ error: '宠物名字不能为空' });
    pet.name = String(name).trim();
  }
  if (species != null) {
    if (!String(species).trim()) return res.status(400).json({ error: '物种不能为空' });
    pet.species = String(species).trim();
  }
  if (breed != null) pet.breed = String(breed).trim();
  if (gender != null) pet.gender = String(gender).trim();
  if (birthDate != null) pet.birthDate = String(birthDate).trim();
  if (notes != null) pet.notes = String(notes).trim();
  saveData(db);
  res.json({ pet });
});

app.delete('/api/pets/:id', (req, res) => {
  const idx = db.pets.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '宠物不存在' });
  const [removed] = db.pets.splice(idx, 1);
  db.records = db.records.filter((r) => r.petId !== removed.id);
  saveData(db);
  res.json({ deleted: removed.id });
});

/* ---------------- 记录 CRUD（feeding / health / vaccine / weight） ---------------- */

app.get('/api/records', (req, res) => {
  const { petId, type } = req.query;
  if (type && !RECORD_TYPES.includes(type)) {
    return res.status(400).json({ error: `type 必须是 ${RECORD_TYPES.join('/')}` });
  }
  let records = db.records;
  if (type) records = records.filter((r) => r.type === type);
  if (petId) records = records.filter((r) => r.petId === petId);
  const sorted = [...records].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  res.json({ records: sorted });
});

app.post('/api/records', (req, res) => {
  const body = req.body || {};
  const { petId, type, date } = body;
  if (!petId || !db.pets.some((p) => p.id === petId)) {
    return res.status(400).json({ error: 'petId 无效：宠物不存在' });
  }
  if (!RECORD_TYPES.includes(type)) {
    return res.status(400).json({ error: `type 必须是 ${RECORD_TYPES.join('/')}` });
  }
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });

  const record = { id: nextId('rec'), petId, type, date };
  if (type === 'feeding') {
    if (!body.food || !String(body.food).trim()) return res.status(400).json({ error: '食物不能为空' });
    record.food = String(body.food).trim();
    record.amount = String(body.amount || '').trim();
    record.note = String(body.note || '').trim();
  } else if (type === 'health') {
    if (!body.symptom || !String(body.symptom).trim()) return res.status(400).json({ error: '症状不能为空' });
    record.symptom = String(body.symptom).trim();
    record.treatment = String(body.treatment || '').trim();
    record.note = String(body.note || '').trim();
  } else if (type === 'vaccine') {
    if (!body.vaccineName || !String(body.vaccineName).trim()) return res.status(400).json({ error: '疫苗名称不能为空' });
    record.vaccineName = String(body.vaccineName).trim();
    if (body.nextDueDate) {
      if (!DATE_RE.test(body.nextDueDate)) return res.status(400).json({ error: 'nextDueDate 格式应为 YYYY-MM-DD' });
      record.nextDueDate = body.nextDueDate;
    }
    record.note = String(body.note || '').trim();
  } else if (type === 'weight') {
    const w = Number(body.weight);
    if (!Number.isFinite(w) || w <= 0) return res.status(400).json({ error: 'weight 必须是正数（kg）' });
    record.weight = Math.round(w * 100) / 100;
  }

  db.records.push(record);
  saveData(db);
  res.status(201).json({ record });
});

app.put('/api/records/:id', (req, res) => {
  const record = db.records.find((r) => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  const body = req.body || {};

  if (body.petId && body.petId !== record.petId) {
    if (!db.pets.some((p) => p.id === body.petId)) return res.status(400).json({ error: 'petId 无效：宠物不存在' });
    record.petId = body.petId;
  }
  if (body.date != null) {
    if (!DATE_RE.test(body.date)) return res.status(400).json({ error: 'date 格式应为 YYYY-MM-DD' });
    record.date = body.date;
  }
  ['food', 'amount', 'note', 'symptom', 'treatment', 'vaccineName', 'nextDueDate'].forEach((f) => {
    if (body[f] != null) record[f] = String(body[f]).trim();
  });
  if (body.weight != null) {
    const w = Number(body.weight);
    if (!Number.isFinite(w) || w <= 0) return res.status(400).json({ error: 'weight 必须是正数（kg）' });
    record.weight = Math.round(w * 100) / 100;
  }
  saveData(db);
  res.json({ record });
});

app.delete('/api/records/:id', (req, res) => {
  const idx = db.records.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '记录不存在' });
  const [removed] = db.records.splice(idx, 1);
  saveData(db);
  res.json({ deleted: removed.id });
});

/* ---------------- 疫苗到期提醒 ---------------- */

app.get('/api/vaccines/reminders', (req, res) => {
  const aheadDays = Math.min(Math.max(Number(req.query.aheadDays) || 30, 1), 365);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reminders = [];
  for (const r of db.records) {
    if (r.type !== 'vaccine' || !r.nextDueDate) continue;
    const pet = db.pets.find((p) => p.id === r.petId);
    const due = new Date(`${r.nextDueDate}T00:00:00`);
    const daysLeft = Math.round((due - today) / 86400000);
    const status = daysLeft < 0 ? 'overdue' : daysLeft <= aheadDays ? 'due-soon' : 'ok';
    reminders.push({
      recordId: r.id,
      petId: r.petId,
      petName: pet ? pet.name : '未知宠物',
      vaccineName: r.vaccineName || '疫苗',
      date: r.date,
      nextDueDate: r.nextDueDate,
      daysLeft,
      status,
    });
  }
  reminders.sort((a, b) => a.daysLeft - b.daysLeft);
  res.json({ checkedAt: new Date().toISOString(), aheadDays, reminders });
});

/* ---------------- 健康检查与兜底 ---------------- */

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'pet-care', time: new Date().toISOString() }));

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '请求体不是合法 JSON' });
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`🐾 pet-care 服务已启动: http://localhost:${PORT}`);
  console.log(`   数据文件: ${DATA_FILE}`);
});
