'use strict';

/* ============ 基础工具 ============ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const RECORD_TYPE_LABEL = { feeding: '喂食', health: '健康', vaccine: '疫苗', weight: '体重' };

const state = {
  pets: [],
  weightCache: [],
  activeTab: 'pets',
  editingPetId: null,
  filters: { feeding: '', health: '', vaccine: '', weight: '' },
};

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* 空响应体 */ }
  if (!res.ok) throw new Error(data.error || `请求失败（HTTP ${res.status}）`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function petById(id) { return state.pets.find((p) => p.id === id); }
function petName(id) { const p = petById(id); return p ? p.name : '未知宠物'; }

function petEmoji(pet) {
  const map = { 猫: '🐱', 狗: '🐶', 兔: '🐰', 仓鼠: '🐹', 鸟: '🐦' };
  return map[pet && pet.species] || '🐾';
}

function petAgeText(pet) {
  if (!pet || !pet.birthDate) return '年龄未知';
  const b = new Date(`${pet.birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return '年龄未知';
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  if (months <= 0) return '不满 1 个月';
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} 个月`;
  return m === 0 ? `${y} 岁` : `${y} 岁 ${m} 个月`;
}

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toast-box').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

function latestWeightOf(petId) {
  const recs = state.weightCache
    .filter((r) => r.petId === petId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return recs.length ? recs[recs.length - 1].weight : null;
}

/* ============ 宠物下拉 / 筛选器 ============ */
function refreshPetSelects() {
  const options = state.pets
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}（${escapeHtml(p.species)}）</option>`)
    .join('');

  $$('.pet-select').forEach((sel) => {
    const cur = sel.value;
    sel.innerHTML = options || '<option value="">请先新增宠物</option>';
    if (cur && state.pets.some((p) => p.id === cur)) sel.value = cur;
  });

  $$('.pet-filter').forEach((sel) => {
    const tab = sel.dataset.tab;
    const cur = state.filters[tab] || '';
    if (cur && !state.pets.some((p) => p.id === cur)) state.filters[tab] = '';
    sel.innerHTML = `<option value="">全部宠物</option>${options}`;
    sel.value = state.filters[tab] || '';
  });
}

/* ============ 宠物档案 ============ */
function renderPets() {
  const grid = $('#pet-grid');
  if (!state.pets.length) {
    grid.innerHTML = '<p class="empty">还没有宠物档案，先在上方新增一只吧 🐾</p>';
    return;
  }
  grid.innerHTML = state.pets.map((p) => {
    const latest = latestWeightOf(p.id);
    return `
      <div class="pet-card" data-id="${p.id}">
        <div class="pet-avatar">${petEmoji(p)}</div>
        <div class="pet-info">
          <h3>${escapeHtml(p.name)}</h3>
          <p>${[p.species, p.breed, p.gender].filter(Boolean).map(escapeHtml).join(' · ')}</p>
          <p>${petAgeText(p)}${latest != null ? ` · 最新体重 ${latest} kg` : ''}</p>
          ${p.notes ? `<p class="pet-notes">${escapeHtml(p.notes)}</p>` : ''}
        </div>
        <div class="pet-actions">
          <button class="btn small" data-act="edit">编辑</button>
          <button class="btn small danger" data-act="delete">删除</button>
        </div>
      </div>`;
  }).join('');
}

async function loadPets() {
  const [petsRes, weightRes] = await Promise.all([api('/pets'), api('/records?type=weight')]);
  state.pets = petsRes.pets;
  state.weightCache = weightRes.records;
  renderPets();
  refreshPetSelects();
}

function startPetEdit(id) {
  const pet = petById(id);
  if (!pet) return;
  state.editingPetId = id;
  const el = $('#pet-form').elements;
  el.name.value = pet.name;
  el.species.value = pet.species;
  el.breed.value = pet.breed || '';
  el.gender.value = pet.gender || '';
  el.birthDate.value = pet.birthDate || '';
  el.notes.value = pet.notes || '';
  $('#pet-form-title').textContent = `✏️ 编辑：${pet.name}`;
  $('#pet-cancel-edit').classList.remove('hidden');
  $('#pet-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelPetEdit() {
  state.editingPetId = null;
  $('#pet-form').reset();
  $('#pet-form-title').textContent = '➕ 新增宠物';
  $('#pet-cancel-edit').classList.add('hidden');
}

function bindPetEvents() {
  $('#pet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      if (state.editingPetId) {
        await api(`/pets/${state.editingPetId}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('宠物档案已更新');
      } else {
        await api('/pets', { method: 'POST', body: JSON.stringify(payload) });
        toast(`已新增宠物「${payload.name}」🎉`);
      }
      cancelPetEdit();
      await loadPets();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#pet-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.pet-card').dataset.id;
    if (btn.dataset.act === 'edit') return startPetEdit(id);
    const pet = petById(id);
    if (!confirm(`确定删除「${pet.name}」吗？\n它的所有喂食/健康/疫苗/体重记录也会一并删除。`)) return;
    try {
      await api(`/pets/${id}`, { method: 'DELETE' });
      toast('宠物档案已删除');
      if (state.editingPetId === id) cancelPetEdit();
      await loadPets();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('#pet-cancel-edit').addEventListener('click', cancelPetEdit);
}

/* ============ 记录表单（喂食/健康/疫苗/体重） ============ */
const RECORD_FORMS = [
  ['feeding-form', 'feeding'],
  ['health-form', 'health'],
  ['vaccine-form', 'vaccine'],
  ['weight-form', 'weight'],
];

function bindRecordForms() {
  RECORD_FORMS.forEach(([formId, type]) => {
    $(`#${formId}`).addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.type = type;
      if (!payload.petId) return toast('请先在「宠物档案」里新增一只宠物', 'error');
      if (type === 'weight') payload.weight = Number(payload.weight);
      try {
        await api('/records', { method: 'POST', body: JSON.stringify(payload) });
        toast(`已保存${RECORD_TYPE_LABEL[type]}记录 ✅`);
        form.reset();
        initFormDefaults();
        await loadTabData(type);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function initFormDefaults() {
  $$('.record-form input[name="date"]').forEach((el) => { el.value = todayStr(); });
}

/* ============ 记录列表 ============ */
function recordTable(type, records) {
  if (!records.length) return '<p class="empty">暂无记录，在上方添加一条吧 ✏️</p>';
  const head = {
    feeding: ['日期', '宠物', '食物', '分量', '备注'],
    health: ['日期', '宠物', '症状', '处理方式', '备注'],
    vaccine: ['接种日期', '宠物', '疫苗', '下次到期', '备注'],
    weight: ['日期', '宠物', '体重（kg）'],
  }[type];
  const rows = records.map((r) => {
    const cells = {
      feeding: [r.date, petName(r.petId), r.food, r.amount, r.note],
      health: [r.date, petName(r.petId), r.symptom, r.treatment, r.note],
      vaccine: [r.date, petName(r.petId), r.vaccineName, r.nextDueDate, r.note],
      weight: [r.date, petName(r.petId), r.weight],
    }[type];
    return `<tr>${cells.map((c) => `<td>${escapeHtml(c ?? '')}</td>`).join('')}
      <td class="cell-action"><button class="btn small danger" data-del="${r.id}">删除</button></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}<th>操作</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

async function loadRecords(type) {
  const filter = state.filters[type] || '';
  const query = filter ? `&petId=${encodeURIComponent(filter)}` : '';
  const { records } = await api(`/records?type=${type}${query}`);
  $(`#${type}-list`).innerHTML = recordTable(type, records);
}

function bindRecordDelete() {
  $$('.record-list').forEach((el) => {
    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-del]');
      if (!btn) return;
      if (!confirm('确定删除这条记录吗？')) return;
      try {
        await api(`/records/${btn.dataset.del}`, { method: 'DELETE' });
        toast('记录已删除');
        await loadTabData(el.dataset.tab);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

/* ============ 疫苗提醒 ============ */
async function loadVaccine() {
  const [remRes] = await Promise.all([api('/vaccines/reminders'), loadRecords('vaccine')]);
  renderReminders(remRes.reminders);
}

function renderReminders(reminders) {
  const box = $('#reminder-list');
  const attention = reminders.filter((r) => r.status !== 'ok');
  $('#reminder-count').textContent = reminders.length
    ? (attention.length ? `${attention.length} 条需要关注` : '所有疫苗均在有效期内 🎉')
    : '';
  if (!reminders.length) {
    box.innerHTML = '<p class="empty">还没有疫苗记录，在下方添加一条吧 💉</p>';
    return;
  }
  const badge = {
    overdue: (r) => `<span class="badge overdue">已逾期 ${-r.daysLeft} 天</span>`,
    'due-soon': (r) => `<span class="badge due-soon">${r.daysLeft} 天后到期</span>`,
    ok: (r) => `<span class="badge ok">距到期 ${r.daysLeft} 天</span>`,
  };
  box.innerHTML = reminders.map((r) => `
    <div class="reminder ${r.status}">
      <div>
        <strong>${escapeHtml(r.petName)}</strong> · ${escapeHtml(r.vaccineName)}
        <span class="muted">｜下次到期 ${escapeHtml(r.nextDueDate)}</span>
      </div>
      ${(badge[r.status] || badge.ok)(r)}
    </div>`).join('');
}

/* ============ 体重曲线（Canvas 折线图） ============ */
async function loadWeight() {
  const { records } = await api('/records?type=weight');
  state.weightCache = records;
  const filter = state.filters.weight || '';
  const shown = filter ? records.filter((r) => r.petId === filter) : records;
  $('#weight-list').innerHTML = recordTable('weight', shown);
  drawWeightChart(records, filter);
}

function drawWeightChart(allRecords, filter) {
  const canvas = $('#weight-chart');
  const legend = $('#weight-legend');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(canvas.clientWidth || 0, 320);
  const h = 300;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 分组：选了宠物画一条线，"全部"则每只宠物一条线
  const groups = [];
  if (filter) {
    const recs = allRecords.filter((r) => r.petId === filter);
    if (recs.length) groups.push({ petId: filter, recs });
  } else {
    const byPet = new Map();
    for (const r of allRecords) {
      if (!byPet.has(r.petId)) byPet.set(r.petId, []);
      byPet.get(r.petId).push(r);
    }
    for (const [petId, recs] of byPet) groups.push({ petId, recs });
    groups.sort((a, b) => b.recs.length - a.recs.length);
  }

  if (!groups.length) {
    legend.innerHTML = '';
    ctx.fillStyle = '#9a8f86';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无体重数据，先在上方记录一次体重吧', w / 2, h / 2);
    return;
  }

  groups.forEach((g) => g.recs.sort((a, b) => String(a.date).localeCompare(String(b.date))));

  const values = groups.flatMap((g) => g.recs.map((r) => r.weight));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const spanPad = (max - min) * 0.15;
  min -= spanPad;
  max += spanPad;

  const padL = 52, padR = 20, padT = 20, padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (i, n) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => padT + plotH * (1 - (v - min) / (max - min));

  // 横向网格与纵轴刻度
  ctx.font = '12px sans-serif';
  ctx.lineWidth = 1;
  const tickPrecision = (max - min) / 4 < 0.5 ? 2 : 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    const yy = yAt(v);
    ctx.strokeStyle = '#eee2d8';
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(w - padR, yy);
    ctx.stroke();
    ctx.fillStyle = '#9a8f86';
    ctx.textAlign = 'right';
    ctx.fillText(v.toFixed(tickPrecision), padL - 8, yy + 4);
  }

  // 横轴日期标签
  const labeled = groups.reduce((a, b) => (b.recs.length > a.recs.length ? b : a));
  const step = Math.ceil(labeled.recs.length / 6);
  ctx.textAlign = 'center';
  labeled.recs.forEach((r, i) => {
    if (i % step !== 0 && i !== labeled.recs.length - 1) return;
    ctx.fillText(String(r.date).slice(5), xAt(i, labeled.recs.length), h - 12);
  });

  const colors = ['#e8734a', '#2f9e8f', '#5b8def', '#b58ad8', '#d8a13a'];
  legend.innerHTML = groups.map((g, i) =>
    `<span class="legend-item"><i style="background:${colors[i % colors.length]}"></i>${escapeHtml(petName(g.petId))}</span>`
  ).join('');

  groups.forEach((g, gi) => {
    const color = colors[gi % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    g.recs.forEach((r, i) => {
      const xx = xAt(i, g.recs.length);
      const yy = yAt(r.weight);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
    g.recs.forEach((r, i) => {
      const xx = xAt(i, g.recs.length);
      const yy = yAt(r.weight);
      ctx.beginPath();
      ctx.arc(xx, yy, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xx, yy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });
  });
}

/* ============ 标签页调度 ============ */
async function loadTabData(tab) {
  if (tab === 'pets') return loadPets();
  if (tab === 'feeding') return loadRecords('feeding');
  if (tab === 'health') return loadRecords('health');
  if (tab === 'vaccine') return loadVaccine();
  if (tab === 'weight') return loadWeight();
}

function switchTab(tab) {
  state.activeTab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
  loadTabData(tab).catch((err) => toast(err.message, 'error'));
}

/* ============ 初始化 ============ */
function bindEvents() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchTab(btn.dataset.tab);
  });
  bindPetEvents();
  bindRecordForms();
  bindRecordDelete();
  $$('.pet-filter').forEach((sel) => {
    sel.addEventListener('change', () => {
      state.filters[sel.dataset.tab] = sel.value;
      loadTabData(sel.dataset.tab).catch((err) => toast(err.message, 'error'));
    });
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.activeTab === 'weight') loadWeight().catch(() => {});
    }, 200);
  });
}

async function init() {
  bindEvents();
  initFormDefaults();
  try {
    await loadPets();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
