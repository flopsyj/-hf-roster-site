import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient.js';

const CLASSES = [
  { name: 'Barbarian', color: '#B8492E' },
  { name: 'Necromancer', color: '#4A7A3C' },
  { name: 'Wizard', color: '#3C6EA5' },
  { name: 'Demon Hunter', color: '#7A2B3D' },
  { name: 'Crusader', color: '#9C7A3C' },
  { name: 'Monk', color: '#C9A227' },
  { name: 'Blood Knight', color: '#8B1E2E' },
  { name: 'Tempest', color: '#2B7A8B' },
  { name: 'Gambit', color: '#5A6B8C' },
  { name: 'Warlock', color: '#6A2BA8' },
];

const ROLES = ['Officer', 'Veteran', 'Member', 'Trial', 'Inactive'];
const TEAMS = ['Team 1', 'Team 2', 'Team 3', 'Unassigned'];
const WAR_DAYS = ['Thursday', 'Saturday'];
const CLAN_NAME = 'High Functioning';

const PRIMARY_STATS = [
  { key: 'strength', label: 'Strength' },
  { key: 'fortitude', label: 'Fortitude' },
  { key: 'willpower', label: 'Willpower' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'vitality', label: 'Vitality' },
];

const SECONDARY_STATS = [
  { key: 'crit_chance', label: 'Crit Hit Chance', suffix: '%' },
  { key: 'crit_damage', label: 'Crit Hit Damage', suffix: '%' },
  { key: 'armor', label: 'Armor' },
  { key: 'potency', label: 'Potency', suffix: '%' },
  { key: 'resistance', label: 'Resistance', suffix: '%' },
];

const ALL_STAT_FIELDS = [...PRIMARY_STATS, ...SECONDARY_STATS];

function emptyStatFields() {
  const obj = {};
  ALL_STAT_FIELDS.forEach((s) => { obj[s.key] = ''; });
  return obj;
}

const emptySelfForm = {
  passcode: '',
  class_name: 'Barbarian',
  combat_power: '',
  resonance: '',
  notes: '',
  ...emptyStatFields(),
};

const emptyOwnerForm = {
  name: '',
  passcode: '',
  class_name: 'Barbarian',
  role: 'Member',
  combat_power: '',
  resonance: '',
  team: 'Unassigned',
  shadow_war_active: true,
  notes: '',
  ...emptyStatFields(),
};

function classColor(name) {
  return CLASSES.find((c) => c.name === name)?.color || '#6b6b6b';
}

function currentWeekKey() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

function StatusDot({ state }) {
  const map = {
    idle: { text: '', color: 'transparent' },
    saving: { text: 'Saving…', color: '#9C7A3C' },
    saved: { text: 'Saved', color: '#4A7A3C' },
    error: { text: 'Save failed — try again', color: '#B8492E' },
  };
  const s = map[state] || map.idle;
  if (!s.text) return <span className="status-spacer" />;
  return (
    <span className="storage-status">
      <span className="dot" style={{ background: s.color }} />
      {s.text}
    </span>
  );
}

function StatFieldsGrid({ values, onChange }) {
  return (
    <>
      <div className="stat-group-label">Primary Attributes</div>
      <div className="field-grid-3">
        {PRIMARY_STATS.map((s) => (
          <div className="field" key={s.key}>
            <label>{s.label}</label>
            <input type="number" value={values[s.key] ?? ''} onChange={(e) => onChange(s.key, e.target.value)} placeholder="0" min="0" />
          </div>
        ))}
      </div>
      <div className="stat-group-label">Secondary Attributes</div>
      <div className="field-grid-3">
        {SECONDARY_STATS.map((s) => (
          <div className="field" key={s.key}>
            <label>{s.label}{s.suffix ? ` (${s.suffix})` : ''}</label>
            <input type="number" value={values[s.key] ?? ''} onChange={(e) => onChange(s.key, e.target.value)} placeholder="0" min="0" step={s.suffix === '%' ? '0.1' : '1'} />
          </div>
        ))}
      </div>
    </>
  );
}

export default function App() {
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [ownerPasscode, setOwnerPasscode] = useState('hf2026');
  const [saveState, setSaveState] = useState('idle');
  const [toast, setToast] = useState(null);

  const [gatePasscodeInput, setGatePasscodeInput] = useState('');
  const [gateError, setGateError] = useState('');

  const [memberRecord, setMemberRecord] = useState(null);
  const [selfForm, setSelfForm] = useState(emptySelfForm);
  const [joinName, setJoinName] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [joinError, setJoinError] = useState('');

  const [ownerForm, setOwnerForm] = useState(emptyOwnerForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [attendanceWeek, setAttendanceWeek] = useState(currentWeekKey());
  const [statsExpanded, setStatsExpanded] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: memberRows, error: memberErr } = await supabase
        .from('members')
        .select('*')
        .order('name', { ascending: true });
      if (memberErr) throw memberErr;
      setMembers(memberRows || []);

      const { data: attRows, error: attErr } = await supabase
        .from('attendance')
        .select('*');
      if (attErr) throw attErr;
      const attMap = {};
      (attRows || []).forEach((r) => {
        if (!attMap[r.week_key]) attMap[r.week_key] = {};
        attMap[r.week_key][r.member_id] = { Thursday: r.thursday, Saturday: r.saturday };
      });
      setAttendance(attMap);

      const { data: settingsRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'owner_passcode')
        .single();
      if (settingsRow?.value) setOwnerPasscode(settingsRow.value);
    } catch (e) {
      setLoadError(e.message || 'Failed to connect to the database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const withSaveState = async (fn) => {
    setSaveState('saving');
    try {
      await fn();
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 2500);
      throw e;
    }
  };

  const handleGateSubmit = (e) => {
    e.preventDefault();
    if (gatePasscodeInput === ownerPasscode) {
      setMode('owner');
      setGateError('');
      setGatePasscodeInput('');
    } else {
      setGateError('Incorrect passcode.');
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoinError('');
    const nameMatch = members.find((m) => m.name.toLowerCase() === joinName.trim().toLowerCase());

    if (!nameMatch) {
      setJoinError('No member found with that name. Ask your clan officer to add you to the roster first.');
      return;
    }
    if (nameMatch.passcode && nameMatch.passcode !== joinPasscode) {
      setJoinError('That name already has a different passcode set. Check with your clan officer if you forgot it.');
      return;
    }
    if (!nameMatch.passcode && joinPasscode) {
      try {
        await withSaveState(async () => {
          const { error } = await supabase.from('members').update({ passcode: joinPasscode }).eq('id', nameMatch.id);
          if (error) throw error;
        });
        nameMatch.passcode = joinPasscode;
      } catch (e) {
        showToast('Could not save your passcode — try again.');
        return;
      }
    }
    setMemberRecord(nameMatch);
    const filledStats = {};
    ALL_STAT_FIELDS.forEach((s) => { filledStats[s.key] = nameMatch[s.key] ?? ''; });
    setSelfForm({
      passcode: joinPasscode || nameMatch.passcode || '',
      class_name: nameMatch.class_name,
      combat_power: nameMatch.combat_power ?? '',
      resonance: nameMatch.resonance ?? '',
      notes: nameMatch.notes ?? '',
      ...filledStats,
    });
  };

  const handleSelfStatChange = (key, value) => setSelfForm((f) => ({ ...f, [key]: value }));

  const handleSelfUpdate = async (e) => {
    e.preventDefault();
    const statUpdates = {};
    ALL_STAT_FIELDS.forEach((s) => {
      statUpdates[s.key] = selfForm[s.key] === '' ? null : Number(selfForm[s.key]);
    });
    const updatePayload = {
      class_name: selfForm.class_name,
      combat_power: selfForm.combat_power === '' ? null : Number(selfForm.combat_power),
      resonance: selfForm.resonance === '' ? null : Number(selfForm.resonance),
      notes: selfForm.notes,
      updated_at: new Date().toISOString(),
      ...statUpdates,
    };
    try {
      await withSaveState(async () => {
        const { error } = await supabase.from('members').update(updatePayload).eq('id', memberRecord.id);
        if (error) throw error;
      });
      setMembers((prev) => prev.map((m) => (m.id === memberRecord.id ? { ...m, ...updatePayload } : m)));
      showToast('Your stats are saved');
    } catch (e) {
      showToast('Save failed — check your connection and try again.');
    }
  };

  const handleOwnerChange = (field, value) => setOwnerForm((f) => ({ ...f, [field]: value }));
  const resetOwnerForm = () => { setOwnerForm(emptyOwnerForm); setEditingId(null); };

  const handleOwnerSubmit = async (e) => {
    e.preventDefault();
    if (!ownerForm.name.trim()) return;

    const payload = {
      name: ownerForm.name.trim(),
      class_name: ownerForm.class_name,
      role: ownerForm.role,
      combat_power: ownerForm.combat_power === '' ? null : Number(ownerForm.combat_power),
      resonance: ownerForm.resonance === '' ? null : Number(ownerForm.resonance),
      team: ownerForm.team,
      shadow_war_active: ownerForm.shadow_war_active,
      notes: ownerForm.notes,
      updated_at: new Date().toISOString(),
    };
    ALL_STAT_FIELDS.forEach((s) => {
      payload[s.key] = ownerForm[s.key] === '' ? null : Number(ownerForm[s.key]);
    });

    try {
      if (editingId) {
        await withSaveState(async () => {
          const { error } = await supabase.from('members').update(payload).eq('id', editingId);
          if (error) throw error;
        });
        setMembers((prev) => prev.map((m) => (m.id === editingId ? { ...m, ...payload } : m)));
        showToast(`Updated ${payload.name}`);
      } else {
        let inserted;
        await withSaveState(async () => {
          const { data, error } = await supabase.from('members').insert(payload).select().single();
          if (error) throw error;
          inserted = data;
        });
        setMembers((prev) => [...prev, inserted].sort((a, b) => a.name.localeCompare(b.name)));
        showToast(`Added ${payload.name} to the roster`);
      }
      resetOwnerForm();
    } catch (e) {
      if (e.message && e.message.includes('duplicate')) {
        showToast('A member with that name already exists.');
      } else {
        showToast('Save failed — check your connection and try again.');
      }
    }
  };

  const handleOwnerEdit = (member) => {
    const filledStats = {};
    ALL_STAT_FIELDS.forEach((s) => { filledStats[s.key] = member[s.key] ?? ''; });
    setOwnerForm({
      name: member.name,
      passcode: member.passcode || '',
      class_name: member.class_name,
      role: member.role,
      combat_power: member.combat_power ?? '',
      resonance: member.resonance ?? '',
      team: member.team,
      shadow_war_active: member.shadow_war_active,
      notes: member.notes ?? '',
      ...filledStats,
    });
    setEditingId(member.id);
    setStatsExpanded(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    try {
      await withSaveState(async () => {
        const { error } = await supabase.from('members').delete().eq('id', id);
        if (error) throw error;
      });
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setConfirmDelete(null);
      showToast('Member removed');
    } catch (e) {
      showToast('Delete failed — check your connection and try again.');
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleAttendance = async (memberId, day) => {
    const weekData = attendance[attendanceWeek] || {};
    const memberData = weekData[memberId] || {};
    const newVal = !memberData[day];
    const nextMemberData = { ...memberData, [day]: newVal };

    setAttendance((prev) => ({ ...prev, [attendanceWeek]: { ...weekData, [memberId]: nextMemberData } }));

    try {
      await withSaveState(async () => {
        const { error } = await supabase.from('attendance').upsert(
          {
            member_id: memberId,
            week_key: attendanceWeek,
            thursday: day === 'Thursday' ? newVal : !!nextMemberData.Thursday,
            saturday: day === 'Saturday' ? newVal : !!nextMemberData.Saturday,
          },
          { onConflict: 'member_id,week_key' }
        );
        if (error) throw error;
      });
    } catch (e) {
      showToast('Could not save attendance — try again.');
    }
  };

  const attendanceScore = (memberId) => {
    const weeks = Object.keys(attendance);
    if (weeks.length === 0) return null;
    let possible = 0, attended = 0;
    weeks.forEach((wk) => {
      WAR_DAYS.forEach((day) => {
        const rec = attendance[wk]?.[memberId];
        possible += 1;
        if (rec && rec[day]) attended += 1;
      });
    });
    return possible === 0 ? null : Math.round((attended / possible) * 100);
  };

  const exportToExcel = () => {
    const rows = members.map((m) => {
      const row = {
        Name: m.name,
        Class: m.class_name,
        Role: m.role,
        'Combat Power': m.combat_power ?? '',
        Resonance: m.resonance ?? '',
        Team: m.team,
        'Shadow War Active': m.shadow_war_active ? 'Yes' : 'No',
        'Attendance %': attendanceScore(m.id) ?? '',
      };
      PRIMARY_STATS.forEach((s) => { row[s.label] = m[s.key] ?? ''; });
      SECONDARY_STATS.forEach((s) => { row[s.label + (s.suffix ? ` (${s.suffix})` : '')] = m[s.key] ?? ''; });
      row.Notes = m.notes || '';
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map((k) => ({ wch: k === 'Notes' ? 36 : Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');

    const weeks = Object.keys(attendance).sort();
    const attRows = [];
    members.forEach((m) => {
      weeks.forEach((wk) => {
        const rec = attendance[wk]?.[m.id];
        if (rec) {
          attRows.push({ Name: m.name, Week: wk, Thursday: rec.Thursday ? 'Present' : 'Absent', Saturday: rec.Saturday ? 'Present' : 'Absent' });
        }
      });
    });
    if (attRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(attRows);
      ws2['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Log');
    }

    const total = members.length;
    const active = members.filter((m) => m.shadow_war_active).length;
    const byClass = CLASSES.map((c) => ({ Class: c.name, Count: members.filter((m) => m.class_name === c.name).length }));
    const avgCP = total ? Math.round(members.reduce((s, m) => s + (Number(m.combat_power) || 0), 0) / total) : 0;
    const avgRes = total ? Math.round(members.reduce((s, m) => s + (Number(m.resonance) || 0), 0) / total) : 0;

    const summaryRows = [
      { Metric: 'Total Members', Value: total },
      { Metric: 'Shadow War Active', Value: active },
      { Metric: 'Average Combat Power', Value: avgCP },
      { Metric: 'Average Resonance', Value: avgRes },
      {},
      ...byClass.filter((r) => r.Count > 0).map((r) => ({ Metric: `${r.Class} count`, Value: r.Count })),
    ];
    const ws3 = XLSX.utils.json_to_sheet(summaryRows);
    ws3['!cols'] = [{ wch: 24 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Summary');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `high-functioning-roster-${dateStr}.xlsx`);
    showToast('Excel file exported');
  };

  const filteredSorted = useMemo(() => {
    let list = members
      .filter((m) => (classFilter === 'All' ? true : m.class_name === classFilter))
      .filter((m) => (teamFilter === 'All' ? true : m.team === teamFilter))
      .filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

    list = [...list].sort((a, b) => {
      let av, bv;
      const statKeys = ALL_STAT_FIELDS.map((s) => s.key);
      if (sortKey === 'combat_power' || sortKey === 'resonance' || statKeys.includes(sortKey)) {
        av = Number(a[sortKey]) || 0; bv = Number(b[sortKey]) || 0;
      } else if (sortKey === 'attendance') {
        av = attendanceScore(a.id) ?? -1; bv = attendanceScore(b.id) ?? -1;
      } else {
        av = (a[sortKey] || '').toString().toLowerCase(); bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, classFilter, teamFilter, search, sortKey, sortDir, attendance]);

  const total = members.length;
  const active = members.filter((m) => m.shadow_war_active).length;

  const SortHeader = ({ label, sortField }) => (
    <th className="sortable" onClick={() => handleSort(sortField)}>{label} {sortKey === sortField ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
  );

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        .app-root {
          --bg: #0E0C10; --bg-raised: #17141B; --bg-input: #1D1922; --border: #2A2531;
          --ember: #B8492E; --ember-bright: #D6603F; --violet: #4A3768; --warlock: #6A2BA8;
          --gold: #9C7A3C; --bone: #E8E1D3; --bone-dim: #9C9486; --green: #4A7A3C;
          background: radial-gradient(ellipse at top, #1A1620 0%, #0E0C10 55%);
          color: var(--bone); font-family: 'Inter', sans-serif; min-height: 100vh; padding: 28px 20px 60px;
        }
        .gate-screen { max-width: 420px; margin: 90px auto; text-align: center; }
        .gate-screen .glyph { font-family: 'Cinzel', serif; font-size: 32px; color: var(--ember-bright); margin-bottom: 6px; text-shadow: 0 0 30px rgba(184,73,46,0.35); }
        .gate-screen h1 { font-family: 'Cinzel', serif; font-size: 24px; letter-spacing: 0.05em; margin: 0 0 4px; text-transform: uppercase; }
        .gate-screen .sub { font-size: 12px; color: var(--bone-dim); margin-bottom: 28px; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: 0.07em; }
        .gate-card { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px; padding: 24px; margin-bottom: 14px; text-align: left; }
        .gate-card h3 { font-family: 'Cinzel', serif; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--gold); margin: 0 0 14px; }
        .gate-card.member-card h3 { color: var(--ember-bright); }
        .gate-error { color: var(--ember-bright); font-size: 12px; margin-top: 8px; font-family: 'IBM Plex Mono', monospace; }
        .load-error { color: var(--ember-bright); font-size: 12px; margin-top: 14px; font-family: 'IBM Plex Mono', monospace; line-height: 1.6; }
        .field { margin-bottom: 14px; }
        .field label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bone-dim); margin-bottom: 6px; }
        .field input[type="text"], .field input[type="password"], .field input[type="number"], .field select, .field textarea {
          width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: var(--bone);
          padding: 9px 10px; border-radius: 3px; font-family: 'Inter', sans-serif; font-size: 13px; outline: none;
        }
        .field textarea { resize: vertical; min-height: 56px; }
        .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember); }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .field-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        @media (max-width: 420px) { .field-grid-3 { grid-template-columns: 1fr 1fr; } }
        .stat-group-label { font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); margin: 14px 0 8px; padding-top: 10px; border-top: 1px solid var(--border); }
        .stat-group-label:first-of-type { border-top: none; padding-top: 0; }
        .checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
        .checkbox-row input { width: 16px; height: 16px; accent-color: var(--ember); }
        .checkbox-row label { font-size: 12px; color: var(--bone); margin: 0; text-transform: none; letter-spacing: 0; }
        .form-actions { display: flex; gap: 8px; margin-top: 18px; }
        button { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px; border-radius: 3px; border: 1px solid transparent; cursor: pointer; padding: 10px 16px; transition: filter 0.12s ease, transform 0.05s ease; }
        button:active { transform: translateY(1px); }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-primary { background: var(--ember); color: #fff; flex: 1; }
        .btn-primary:hover { filter: brightness(1.12); }
        .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--bone-dim); }
        .btn-ghost:hover { color: var(--bone); border-color: var(--bone-dim); }
        .btn-export { background: var(--violet); color: var(--bone); }
        .btn-export:hover { filter: brightness(1.18); }
        .btn-full { width: 100%; }
        .stats-toggle { background: transparent; border: 1px dashed var(--border); color: var(--bone-dim); width: 100%; padding: 9px; font-size: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
        .stats-toggle:hover { color: var(--bone); border-color: var(--gold); }
        .mode-switch { position: fixed; top: 16px; right: 16px; z-index: 40; }
        .header { max-width: 1180px; margin: 0 auto 28px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
        .title-block h1 { font-family: 'Cinzel', serif; font-weight: 900; font-size: 26px; letter-spacing: 0.04em; margin: 0; color: var(--bone); text-shadow: 0 0 24px rgba(184, 73, 46, 0.25); text-transform: uppercase; }
        .title-block .sub { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--bone-dim); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 4px; }
        .header-stats { display: flex; gap: 22px; font-family: 'IBM Plex Mono', monospace; }
        .header-stat { text-align: right; }
        .header-stat .num { font-size: 22px; font-weight: 600; color: var(--ember-bright); line-height: 1; }
        .header-stat .label { font-size: 10px; color: var(--bone-dim); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }
        .layout { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
        .panel { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 4px; }
        .form-panel { padding: 20px; position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow-y: auto; }
        .form-panel h2 { font-family: 'Cinzel', serif; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 4px; color: var(--gold); }
        .form-panel .form-sub { font-size: 12px; color: var(--bone-dim); margin-bottom: 18px; }
        .roster-panel { padding: 0; overflow: hidden; }
        .panel-tabs { display: flex; border-bottom: 1px solid var(--border); }
        .panel-tab { flex: 1; padding: 12px; text-align: center; font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bone-dim); cursor: pointer; border-bottom: 2px solid transparent; background: transparent; border-radius: 0; }
        .panel-tab.active { color: var(--ember-bright); border-bottom-color: var(--ember); }
        .panel-tab:hover { color: var(--bone); }
        .roster-toolbar { display: flex; gap: 10px; padding: 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; align-items: center; }
        .roster-toolbar input[type="text"] { flex: 1; min-width: 160px; background: var(--bg-input); border: 1px solid var(--border); color: var(--bone); padding: 9px 12px; border-radius: 3px; font-size: 13px; outline: none; }
        .roster-toolbar select { background: var(--bg-input); border: 1px solid var(--border); color: var(--bone); padding: 9px 10px; border-radius: 3px; font-size: 13px; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        thead th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--bone-dim); padding: 10px 14px; border-bottom: 1px solid var(--border); white-space: nowrap; }
        thead th.sortable { cursor: pointer; user-select: none; }
        thead th.sortable:hover { color: var(--bone); }
        tbody tr { border-bottom: 1px solid rgba(42, 37, 49, 0.6); }
        tbody tr:hover { background: rgba(184, 73, 46, 0.05); }
        td { padding: 11px 14px; vertical-align: middle; white-space: nowrap; }
        td.name-cell { font-weight: 600; color: var(--bone); border-left: 3px solid transparent; }
        .class-tag { display: inline-flex; align-items: center; gap: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .class-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .role-badge { font-size: 10px; font-family: 'IBM Plex Mono', monospace; padding: 3px 7px; border-radius: 2px; border: 1px solid var(--border); color: var(--bone-dim); text-transform: uppercase; letter-spacing: 0.04em; }
        .role-badge.Officer { color: var(--gold); border-color: var(--gold); }
        .role-badge.Veteran { color: var(--ember-bright); border-color: var(--ember); }
        .sw-pill { font-size: 11px; font-family: 'IBM Plex Mono', monospace; }
        .sw-pill.active { color: var(--green); }
        .sw-pill.inactive { color: var(--bone-dim); }
        .notes-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; color: var(--bone-dim); font-size: 12px; white-space: nowrap; }
        .row-actions { display: flex; gap: 6px; }
        .icon-btn { background: transparent; border: 1px solid var(--border); color: var(--bone-dim); padding: 5px 9px; font-size: 11px; }
        .icon-btn:hover { color: var(--bone); border-color: var(--bone-dim); }
        .icon-btn.danger:hover { color: var(--ember-bright); border-color: var(--ember); }
        .confirm-row { background: rgba(184, 73, 46, 0.08) !important; }
        .confirm-bar { display: flex; align-items: center; gap: 10px; font-size: 12px; }
        .empty-state { padding: 60px 20px; text-align: center; color: var(--bone-dim); }
        .empty-state .glyph { font-family: 'Cinzel', serif; font-size: 38px; color: var(--border); margin-bottom: 10px; }
        .empty-state p { font-size: 13px; max-width: 320px; margin: 6px auto 0; }
        .storage-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--bone-dim); font-family: 'IBM Plex Mono', monospace; }
        .status-spacer { display: inline-block; height: 14px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; }
        .roster-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border); }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: var(--bg-raised); border: 1px solid var(--ember); color: var(--bone); padding: 10px 18px; border-radius: 4px; font-size: 13px; font-family: 'IBM Plex Mono', monospace; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 50; animation: toast-in 0.2s ease; }
        @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .loading-state { max-width: 1180px; margin: 80px auto; text-align: center; color: var(--bone-dim); font-family: 'IBM Plex Mono', monospace; font-size: 13px; }
        .attendance-wrap { padding: 16px; }
        .attendance-week-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--bone-dim); }
        .attendance-week-bar input { background: var(--bg-input); border: 1px solid var(--border); color: var(--bone); padding: 7px 10px; border-radius: 3px; font-size: 12px; font-family: 'IBM Plex Mono', monospace; }
        .att-check { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-input); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: transparent; font-size: 13px; }
        .att-check.present { background: var(--green); border-color: var(--green); color: #fff; }
        .member-view { max-width: 520px; margin: 60px auto; }
        .member-view .glyph { text-align: center; font-family: 'Cinzel', serif; font-size: 28px; color: var(--ember-bright); margin-bottom: 4px; }
        .member-view h1 { text-align: center; font-family: 'Cinzel', serif; font-size: 22px; margin: 0 0 4px; text-transform: uppercase; }
        .member-view .sub { text-align: center; font-size: 12px; color: var(--bone-dim); margin-bottom: 24px; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: 0.06em; }
        @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
      `}</style>

      {loading ? (
        <div className="loading-state">Loading roster…</div>
      ) : loadError ? (
        <div className="gate-screen">
          <div className="glyph">⚠</div>
          <h1>{CLAN_NAME}</h1>
          <div className="gate-card">
            <h3>Connection Problem</h3>
            <p style={{ fontSize: 13, color: 'var(--bone-dim)' }}>
              Couldn't reach the database. This usually means the Supabase environment variables aren't set yet, or the schema hasn't been created.
            </p>
            <div className="load-error">{loadError}</div>
            <button className="btn-primary btn-full" style={{ marginTop: 14 }} onClick={loadAll}>Try Again</button>
          </div>
        </div>
      ) : mode === null ? (
        <div className="gate-screen">
          <div className="glyph">⚔</div>
          <h1>{CLAN_NAME}</h1>
          <div className="sub">Stats</div>

          <div className="gate-card">
            <h3>Officer Access</h3>
            <form onSubmit={handleGateSubmit}>
              <div className="field">
                <label>Passcode</label>
                <input type="password" value={gatePasscodeInput} onChange={(e) => setGatePasscodeInput(e.target.value)} placeholder="Enter passcode" autoFocus />
              </div>
              <button type="submit" className="btn-primary btn-full">Enter Full Roster</button>
              {gateError && <div className="gate-error">{gateError}</div>}
            </form>
          </div>

          <div className="gate-card member-card">
            <h3>Clan Member</h3>
            <p style={{ fontSize: 12, color: 'var(--bone-dim)', marginTop: 0, marginBottom: 14 }}>
              Enter your stats and update them anytime. You'll only see your own data.
            </p>
            <button className="btn-export btn-full" onClick={() => setMode('member')}>Enter My Stats</button>
          </div>
        </div>
      ) : mode === 'member' ? (
        <div className="member-view">
          <div className="glyph">⚔</div>
          <h1>{CLAN_NAME}</h1>
          <div className="sub">Your Stats</div>

          {!memberRecord ? (
            <div className="gate-card">
              <h3>Identify Yourself</h3>
              <form onSubmit={handleJoin}>
                <div className="field">
                  <label>Your In-Game Name</label>
                  <input type="text" value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Must match exactly what's on the roster" autoFocus />
                </div>
                <div className="field">
                  <label>Passcode</label>
                  <input type="password" value={joinPasscode} onChange={(e) => setJoinPasscode(e.target.value)} placeholder="Pick one if this is your first time" />
                </div>
                <button type="submit" className="btn-primary btn-full">Continue</button>
                {joinError && <div className="gate-error">{joinError}</div>}
              </form>
              <div style={{ marginTop: 14 }}>
                <button className="btn-ghost btn-full" onClick={() => setMode(null)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="gate-card">
              <h3>Update Your Stats — {memberRecord.name}</h3>
              <form onSubmit={handleSelfUpdate}>
                <div className="field">
                  <label>Class</label>
                  <select value={selfForm.class_name} onChange={(e) => setSelfForm((f) => ({ ...f, class_name: e.target.value }))}>
                    {CLASSES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Combat Power</label>
                    <input type="number" value={selfForm.combat_power} onChange={(e) => setSelfForm((f) => ({ ...f, combat_power: e.target.value }))} placeholder="e.g. 4200000" min="0" />
                  </div>
                  <div className="field">
                    <label>Resonance</label>
                    <input type="number" value={selfForm.resonance} onChange={(e) => setSelfForm((f) => ({ ...f, resonance: e.target.value }))} placeholder="e.g. 12500" min="0" />
                  </div>
                </div>
                <StatFieldsGrid values={selfForm} onChange={handleSelfStatChange} />
                <div className="field" style={{ marginTop: 14 }}>
                  <label>Notes (build, availability, etc.)</label>
                  <textarea value={selfForm.notes} onChange={(e) => setSelfForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything your officer should know" />
                </div>
                <button type="submit" className="btn-primary btn-full">Save My Stats</button>
              </form>
              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={() => { setMemberRecord(null); setJoinName(''); setJoinPasscode(''); }}>Switch Player</button>
                <button className="btn-ghost" onClick={() => setMode(null)}>Back to Start</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mode-switch">
            <button className="btn-ghost" onClick={() => setMode(null)}>Exit Officer View</button>
          </div>

          <header className="header">
            <div className="title-block">
              <h1>{CLAN_NAME}</h1>
              <div className="sub">Stats — Officer View</div>
            </div>
            <div className="header-stats">
              <div className="header-stat"><div className="num">{total}</div><div className="label">Members</div></div>
              <div className="header-stat"><div className="num">{active}</div><div className="label">Shadow War Active</div></div>
            </div>
          </header>

          <div className="layout">
            <div className="panel form-panel">
              <h2>{editingId ? 'Edit Member' : 'Add Member'}</h2>
              <div className="form-sub">{editingId ? 'Update stats and save.' : 'Add a new member to the roster.'}</div>

              <form onSubmit={handleOwnerSubmit}>
                <div className="field">
                  <label>Name</label>
                  <input type="text" value={ownerForm.name} onChange={(e) => handleOwnerChange('name', e.target.value)} placeholder="Player name" required />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Class</label>
                    <select value={ownerForm.class_name} onChange={(e) => handleOwnerChange('class_name', e.target.value)}>
                      {CLASSES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Role</label>
                    <select value={ownerForm.role} onChange={(e) => handleOwnerChange('role', e.target.value)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Combat Power</label>
                    <input type="number" value={ownerForm.combat_power} onChange={(e) => handleOwnerChange('combat_power', e.target.value)} placeholder="e.g. 4200000" min="0" />
                  </div>
                  <div className="field">
                    <label>Resonance</label>
                    <input type="number" value={ownerForm.resonance} onChange={(e) => handleOwnerChange('resonance', e.target.value)} placeholder="e.g. 12500" min="0" />
                  </div>
                </div>

                <button type="button" className="stats-toggle" onClick={() => setStatsExpanded((v) => !v)}>
                  {statsExpanded ? '− Hide Primary / Secondary Stats' : '+ Add Primary / Secondary Stats'}
                </button>
                {statsExpanded && <StatFieldsGrid values={ownerForm} onChange={handleOwnerChange} />}

                <div className="field" style={{ marginTop: 14 }}>
                  <label>Shadow War Team (8v8 Alley of Blood)</label>
                  <select value={ownerForm.team} onChange={(e) => handleOwnerChange('team', e.target.value)}>
                    {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="checkbox-row">
                  <input type="checkbox" id="sw-active" checked={ownerForm.shadow_war_active} onChange={(e) => handleOwnerChange('shadow_war_active', e.target.checked)} />
                  <label htmlFor="sw-active">Active Shadow War roster</label>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea value={ownerForm.notes} onChange={(e) => handleOwnerChange('notes', e.target.value)} placeholder="Role notes, build, behavior flags, etc." />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn-primary">{editingId ? 'Save Changes' : 'Add to Roster'}</button>
                  {editingId && <button type="button" className="btn-ghost" onClick={resetOwnerForm}>Cancel</button>}
                </div>
              </form>
            </div>

            <div className="panel roster-panel">
              <RosterOrAttendance
                filteredSorted={filteredSorted}
                members={members}
                search={search}
                setSearch={setSearch}
                classFilter={classFilter}
                setClassFilter={setClassFilter}
                teamFilter={teamFilter}
                setTeamFilter={setTeamFilter}
                exportToExcel={exportToExcel}
                total={total}
                confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete}
                handleDelete={handleDelete}
                handleOwnerEdit={handleOwnerEdit}
                SortHeader={SortHeader}
                attendanceWeek={attendanceWeek}
                setAttendanceWeek={setAttendanceWeek}
                attendance={attendance}
                toggleAttendance={toggleAttendance}
                attendanceScore={attendanceScore}
                saveState={saveState}
              />
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function RosterOrAttendance({
  filteredSorted, members, search, setSearch, classFilter, setClassFilter,
  teamFilter, setTeamFilter, exportToExcel, total, confirmDelete, setConfirmDelete,
  handleDelete, handleOwnerEdit, SortHeader, attendanceWeek, setAttendanceWeek,
  attendance, toggleAttendance, attendanceScore, saveState,
}) {
  const [tab, setTab] = useState('roster');
  const [showAllStats, setShowAllStats] = useState(false);

  return (
    <>
      <div className="panel-tabs">
        <button className={`panel-tab ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}>Roster</button>
        <button className={`panel-tab ${tab === 'attendance' ? 'active' : ''}`} onClick={() => setTab('attendance')}>War Attendance</button>
      </div>

      {tab === 'roster' ? (
        <>
          <div className="roster-toolbar">
            <input type="text" placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="All">All Classes</option>
              {CLASSES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
              <option value="All">All Teams</option>
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-ghost" onClick={() => setShowAllStats((v) => !v)} style={{ fontSize: 11 }}>
              {showAllStats ? 'Hide Full Stats' : 'Show Full Stats'}
            </button>
            <button className="btn-export" onClick={exportToExcel} disabled={total === 0}>Export to Excel</button>
          </div>

          {filteredSorted.length === 0 ? (
            <div className="empty-state">
              <div className="glyph">⚔</div>
              {total === 0 ? (
                <><strong>No members yet</strong><p>Add your first player using the form to start building the roster.</p></>
              ) : (
                <><strong>No matches</strong><p>Try a different search term or filter.</p></>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortHeader label="Name" sortField="name" />
                    <SortHeader label="Class" sortField="class_name" />
                    <SortHeader label="Role" sortField="role" />
                    <SortHeader label="Combat Power" sortField="combat_power" />
                    <SortHeader label="Resonance" sortField="resonance" />
                    {showAllStats && PRIMARY_STATS.map((s) => <SortHeader key={s.key} label={s.label} sortField={s.key} />)}
                    {showAllStats && SECONDARY_STATS.map((s) => <SortHeader key={s.key} label={s.label} sortField={s.key} />)}
                    <SortHeader label="Team" sortField="team" />
                    <th>SW Active</th>
                    <SortHeader label="Attendance" sortField="attendance" />
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((m) =>
                    confirmDelete === m.id ? (
                      <tr key={m.id} className="confirm-row">
                        <td colSpan={20}>
                          <div className="confirm-bar">
                            Remove <strong>{m.name}</strong> from the roster?
                            <button className="icon-btn danger" onClick={() => handleDelete(m.id)}>Confirm Delete</button>
                            <button className="icon-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={m.id}>
                        <td className="name-cell" style={{ borderLeftColor: classColor(m.class_name) }}>{m.name}</td>
                        <td><span className="class-tag"><span className="class-dot" style={{ background: classColor(m.class_name) }} />{m.class_name}</span></td>
                        <td><span className={`role-badge ${m.role}`}>{m.role}</span></td>
                        <td className="mono">{m.combat_power ? Number(m.combat_power).toLocaleString() : '—'}</td>
                        <td className="mono">{m.resonance ? Number(m.resonance).toLocaleString() : '—'}</td>
                        {showAllStats && PRIMARY_STATS.map((s) => <td className="mono" key={s.key}>{m[s.key] ? Number(m[s.key]).toLocaleString() : '—'}</td>)}
                        {showAllStats && SECONDARY_STATS.map((s) => <td className="mono" key={s.key}>{m[s.key] ? `${m[s.key]}${s.suffix || ''}` : '—'}</td>)}
                        <td>{m.team}</td>
                        <td><span className={`sw-pill ${m.shadow_war_active ? 'active' : 'inactive'}`}>{m.shadow_war_active ? '● Active' : '○ Inactive'}</span></td>
                        <td className="mono">{attendanceScore(m.id) !== null ? `${attendanceScore(m.id)}%` : '—'}</td>
                        <td className="notes-cell" title={m.notes}>{m.notes || '—'}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => handleOwnerEdit(m)}>Edit</button>
                            <button className="icon-btn danger" onClick={() => setConfirmDelete(m.id)}>Del</button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="roster-footer">
            <span>{filteredSorted.length} of {total} shown</span>
            <StatusDot state={saveState} />
          </div>
        </>
      ) : (
        <div className="attendance-wrap">
          <div className="attendance-week-bar">
            <span>Week: {attendanceWeek}</span>
            <input type="text" value={attendanceWeek} onChange={(e) => setAttendanceWeek(e.target.value)} style={{ width: 110 }} title="Format: YYYY-Www, e.g. 2026-W25" />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Team</th><th>Thursday</th><th>Saturday</th><th>Rolling Attendance</th></tr>
              </thead>
              <tbody>
                {members.filter((m) => m.shadow_war_active).map((m) => {
                  const rec = attendance[attendanceWeek]?.[m.id] || {};
                  const score = attendanceScore(m.id);
                  return (
                    <tr key={m.id}>
                      <td className="name-cell" style={{ borderLeftColor: classColor(m.class_name) }}>{m.name}</td>
                      <td>{m.team}</td>
                      <td><span className={`att-check ${rec.Thursday ? 'present' : ''}`} onClick={() => toggleAttendance(m.id, 'Thursday')}>{rec.Thursday ? '✓' : ''}</span></td>
                      <td><span className={`att-check ${rec.Saturday ? 'present' : ''}`} onClick={() => toggleAttendance(m.id, 'Saturday')}>{rec.Saturday ? '✓' : ''}</span></td>
                      <td className="mono">{score !== null ? `${score}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {members.filter((m) => m.shadow_war_active).length === 0 && (
            <div className="empty-state">
              <div className="glyph">⚔</div>
              <strong>No active Shadow War members</strong>
              <p>Mark members as Shadow War active in the roster to track their attendance here.</p>
            </div>
          )}
          <div className="roster-footer">
            <span>Click a cell to mark present / absent for {attendanceWeek}</span>
            <StatusDot state={saveState} />
          </div>
        </div>
      )}
    </>
  );
}
