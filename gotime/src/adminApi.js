import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 1. Create the Supabase client
export const adminSb = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 2. Admin Login
export const adminLogin = async (username, password) => {
  if (!adminSb) throw new Error("Supabase not connected.");
  const email = username.includes('@') ? username : `${username}@admin-demo.app`;
  const { data, error } = await adminSb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return username.split('@')[0];
};

// 3. Admin Logout
export const adminLogout = async () => {
  if (adminSb) await adminSb.auth.signOut();
};

// 4. Get Current User
export const adminGetUser = async () => {
  if (!adminSb) return null;
  const { data } = await adminSb.auth.getUser();
  return data.user ? data.user.email.split('@')[0] : null;
};

// 5. Check if user is actually an admin
export const isAdmin = async () => {
  if (!adminSb) return false;
  const { data } = await adminSb.rpc('is_admin');
  return !!data;
};

// 6. Load Data for Dashboard
export const liveApi = {
  load: async () => {
    if (!adminSb) throw new Error("Supabase not connected.");
    const [attempts, blocked, geo, settings, profiles, claims, promos, admins, adminAttempts] = await Promise.all([
      adminSb.from('login_attempts').select('*').order('created_at', { ascending: false }).limit(500),
      adminSb.from('blocked_ips').select('*'),
      adminSb.from('ip_geo').select('*'),
      adminSb.from('security_settings').select('*').single(),
      adminSb.from('profiles').select('*'),
      adminSb.from('claimed_promos').select('*'),
      adminSb.from('promos').select('*').order('sort'),
      adminSb.from('admins').select('*'),
      adminSb.from('login_attempts').select('*').eq('kind', 'admin').order('created_at', { ascending: false }).limit(100),
    ]);

    const geoMap = {};
    (geo.data || []).forEach(g => { geoMap[g.ip] = g; });

    return {
      attempts: attempts.data || [],
      blocked: blocked.data || [],
      geo: geoMap,
      settings: settings.data || { max_failures: 5, window_minutes: 15, lockout_minutes: 15, auto_block: true, auto_block_failures: 20, auto_block_hours: 24 },
      profiles: profiles.data || [],
      claims: claims.data || [],
      promos: promos.data || [],
      admins: admins.data || [],
      adminAttempts: adminAttempts.data || [],
    };
  },
  enrichGeo: async (ips) => {
    if (!adminSb) return;
    const missingIps = ips.filter(ip => ip && ip !== '127.0.0.1' && ip !== '::1');
    if (!missingIps.length) return;
    
    try {
      for (const ip of missingIps) {
        // Use a secure API (HTTPS) that Vercel can access
        const res = await fetch(`https://ipwho.is/${ip}`);
        const data = await res.json();
        
        if (data.success) {
          await adminSb.from('ip_geo').upsert({
            ip: ip,
            country: data.country,
            country_code: data.country_code,
            region: data.region,
            city: data.city,
            lat: data.latitude,
            lon: data.longitude,
            isp: data.connection?.isp,
            org: data.connection?.org,
            asn: data.connection?.asn ? `AS${data.connection.asn}` : null,
            timezone: data.timezone?.id
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch geo data", e);
    }
  },
  subscribe: (callback) => {
    if (!adminSb) return () => {};
    const channel = adminSb.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, callback)
      .subscribe();
    return () => adminSb.removeChannel(channel);
  }
};

// 7. Actions
const run = async (query) => {
  if (!adminSb) throw new Error('Supabase not connected.');
  const { error } = await query();
  if (error) throw error;
};

export const api2 = {
  blockIp: (ip, reason, hours) => run(() => adminSb.rpc('admin_block_ip', { p_ip: ip, p_reason: reason, p_hours: hours })),
  unblockIp: (ip) => run(() => adminSb.from('blocked_ips').delete().eq('ip', ip)),
  deleteUser: (id) => run(() => adminSb.rpc('admin_delete_user', { p_id: id })),
  savePromo: (promo) => run(() => adminSb.from('promos').upsert(promo)),
  deletePromo: (id) => run(() => adminSb.from('promos').delete().eq('id', id)),
  saveSettings: (settings) => run(() => adminSb.from('security_settings').update(settings).eq('id', 1)),
  removeAdmin: (userId) => run(() => adminSb.from('admins').delete().eq('user_id', userId)),
};

// 8. Demo API — self-contained sample data so every view and action is previewable.
export const makeDemoApi = () => {
  const now = Date.now();
  const at = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();
  const later = (hours) => new Date(now + hours * 3600e3).toISOString();

  const state = {
    settings: {
      id: 1, max_failures: 5, window_minutes: 15, lockout_minutes: 15,
      auto_block: true, auto_block_failures: 20, auto_block_hours: 24,
    },
    profiles: [
      { id: 'u1', mobile: '09171234567', created_at: at(60 * 24 * 41) },
      { id: 'u2', mobile: '09182345678', created_at: at(60 * 24 * 17) },
      { id: 'u3', mobile: '09193456789', created_at: at(60 * 24 * 6) },
      { id: 'u4', mobile: '09204567890', created_at: at(60 * 24 * 2) },
    ],
    claims: [
      { id: 1, user_id: 'u1', promo_id: 'data-boost', claimed_at: at(60 * 24 * 12) },
      { id: 2, user_id: 'u2', promo_id: 'unli-connection', claimed_at: at(60 * 24 * 5) },
      { id: 3, user_id: 'u1', promo_id: 'game-zone', claimed_at: at(60 * 24 * 2) },
      { id: 4, user_id: 'u3', promo_id: 'data-boost', claimed_at: at(60 * 8) },
    ],
    promos: [
      { id: 'data-boost', category: 'Data', tag: 'DATA BOOST', title: 'Data Boost', description: 'Extra data for the days you need it most.', price: '₱99', detail: '30 GB • 7 days', icon: 'Zap', perks: ['30 GB of mobile data', 'Valid for 7 days', 'Works for browsing and video'], sort: 1, active: true },
      { id: 'unli-connection', category: 'Bundles', tag: 'UNLI CONNECTION', title: 'Unli Connection', description: 'Stay online with unlimited apps for two weeks.', price: '₱149', detail: 'Unli apps • 15 days', icon: 'Wifi', perks: ['Unlimited popular apps', 'Valid for 15 days', 'Great for streaming'], sort: 2, active: true },
      { id: 'game-zone', category: 'Entertainment', tag: 'GAME ZONE', title: 'Game Zone', description: 'Low-lag data built for mobile gamers.', price: '₱129', detail: 'Game data • 15 days', icon: 'Gamepad2', perks: ['Dedicated game data', 'Valid for 15 days', 'Smooth play, less lag'], sort: 3, active: true },
      { id: 'music-pass', category: 'Entertainment', tag: 'MUSIC PASS', title: 'Music Pass', description: 'Unlimited music streaming all day.', price: '₱59', detail: 'Music apps • 7 days', icon: 'Music', perks: ['Unlimited streaming', 'Valid for 7 days', 'Works on popular apps'], sort: 4, active: false },
    ],
    admins: [
      { user_id: 'adm1', username: 'demo-admin', email: 'demo-admin@admin-demo.app', created_at: at(60 * 24 * 90) },
      { user_id: 'adm2', username: 'manager', email: 'manager@dito-demo.app', created_at: at(60 * 24 * 30) },
    ],
    blocked: [
      { ip: '203.0.113.9', reason: 'Manual: Brute force', auto: false, blocked_at: at(95), expires_at: later(20) },
      { ip: '185.220.101.4', reason: 'Auto-blocked: 24 failed attempts in 60 minutes', auto: true, blocked_at: at(300), expires_at: later(24) },
      { ip: '192.0.2.44', reason: 'Manual block', auto: false, blocked_at: at(60 * 24 * 4), expires_at: at(60 * 24 * 2) },
    ],
    geo: {
      '203.0.113.9': { ip: '203.0.113.9', country: 'Netherlands', country_code: 'NL', region: 'North Holland', city: 'Amsterdam', lat: 52.3676, lon: 4.9041, isp: 'Example Hosting BV', org: 'Example Hosting', asn: 'AS64500', timezone: 'Europe/Amsterdam', fetched_at: at(40) },
      '45.155.205.233': { ip: '45.155.205.233', country: 'Russia', country_code: 'RU', region: 'Moscow', city: 'Moscow', lat: 55.7558, lon: 37.6173, isp: 'Example Telecom', org: 'Example Telecom', asn: 'AS64501', timezone: 'Europe/Moscow', fetched_at: at(55) },
      '185.220.101.4': { ip: '185.220.101.4', country: 'Germany', country_code: 'DE', region: 'Berlin', city: 'Berlin', lat: 52.52, lon: 13.405, isp: 'Example VPN', org: 'Example VPN', asn: 'AS64502', timezone: 'Europe/Berlin', fetched_at: at(120) },
      '102.165.51.8': { ip: '102.165.51.8', country: 'Nigeria', country_code: 'NG', region: 'Lagos', city: 'Lagos', lat: 6.5244, lon: 3.3792, isp: 'Example Mobile', org: 'Example Mobile', asn: 'AS64503', timezone: 'Africa/Lagos', fetched_at: at(20) },
      '198.51.100.23': { ip: '198.51.100.23', country: 'United States', country_code: 'US', region: 'California', city: 'Los Angeles', lat: 34.0522, lon: -118.2437, isp: 'Example Fiber', org: 'Example Fiber', asn: 'AS64504', timezone: 'America/Los_Angeles', fetched_at: at(15) },
      '192.0.2.44': { ip: '192.0.2.44', country: 'Brazil', country_code: 'BR', region: 'Sao Paulo', city: 'Sao Paulo', lat: -23.5505, lon: -46.6333, isp: 'Example Net', org: 'Example Net', asn: 'AS64505', timezone: 'America/Sao_Paulo', fetched_at: at(60) },
    },
    attempts: [],
    adminAttempts: [],
  };

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const BOT_UA = 'python-requests/2.31.0';
  let seq = 0;
  const addAttempt = (ip, minsAgo, over = {}) => {
    seq++;
    state.attempts.push({
      id: `demo-${seq}`, kind: 'login', mobile: '09171234567', success: false, blocked: false,
      reason: null, ip, user_agent: UA, origin: 'https://gotime-demo.app', language: 'en-US', meta: {}, created_at: at(minsAgo), ...over,
    });
  };

  // Brute-force burst from Amsterdam (the blocked one).
  for (let i = 0; i < 14; i++) addAttempt('203.0.113.9', 15 + i * 6, {
    mobile: ['09170000001', '09170000002', '09170000003'][i % 3], user_agent: BOT_UA,
    meta: { tz: 'Europe/Amsterdam', screen: '1440x900' },
  });
  // Credential stuffing across many numbers.
  for (let i = 0; i < 8; i++) addAttempt('45.155.205.233', 40 + i * 9, {
    mobile: `09181000${String(i).padStart(3, '0')}`, reason: i > 5 ? 'Rate limited' : null,
  });
  // VPN IP with a few failures and refusals.
  addAttempt('185.220.101.4', 70, { mobile: '09173334444' });
  addAttempt('185.220.101.4', 66, { mobile: '09173334444' });
  addAttempt('185.220.101.4', 62, { mobile: '09173334444', blocked: true, reason: 'IP locked out' });
  addAttempt('185.220.101.4', 58, { mobile: '09175556666', blocked: true, reason: 'IP locked out' });
  // Normal-looking customer traffic.
  addAttempt('102.165.51.8', 120, { mobile: '09171234567', success: true });
  addAttempt('102.165.51.8', 118, { mobile: '09171234567', reason: 'Wrong password' });
  addAttempt('102.165.51.8', 112, { mobile: '09182345678' });
  addAttempt('102.165.51.8', 40, { mobile: '09171234567', success: true, kind: 'register' });
  addAttempt('198.51.100.23', 55, { mobile: '09193456789', success: true });
  addAttempt('198.51.100.23', 53, { mobile: '09193456789', success: true });
  addAttempt('192.0.2.44', 60 * 5, { mobile: '09204567890', blocked: true, reason: 'IP blocked' });

  state.adminAttempts.push(
    { id: 'adm-1', kind: 'admin', username: 'demo-admin', success: true, blocked: false, reason: null, ip: '102.165.51.8', user_agent: UA, created_at: at(210) },
    { id: 'adm-2', kind: 'admin', username: 'root', success: false, blocked: false, reason: 'Invalid password', ip: '45.155.205.233', user_agent: BOT_UA, created_at: at(150) },
    { id: 'adm-3', kind: 'admin', username: 'admin', success: false, blocked: false, reason: 'Invalid password', ip: '45.155.205.233', user_agent: BOT_UA, created_at: at(148) },
    { id: 'adm-4', kind: 'admin', username: 'manager', success: true, blocked: false, reason: null, ip: '198.51.100.23', user_agent: UA, created_at: at(60) },
  );

  const clone = (value) => JSON.parse(JSON.stringify(value));

  return {
    load: async () => {
      const snap = clone(state);
      snap.attempts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      snap.adminAttempts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return snap;
    },
    enrichGeo: async () => {},
    subscribe: () => () => {},
    blockIp: async (ip, reason, hours) => {
      const entry = { ip, reason: reason || 'Manual block', auto: false, blocked_at: new Date().toISOString(), expires_at: hours == null ? null : new Date(Date.now() + hours * 3600e3).toISOString() };
      const i = state.blocked.findIndex(b => b.ip === ip);
      if (i >= 0) state.blocked[i] = entry; else state.blocked.unshift(entry);
    },
    unblockIp: async (ip) => { state.blocked = state.blocked.filter(b => b.ip !== ip); },
    deleteUser: async (id) => {
      state.profiles = state.profiles.filter(p => p.id !== id);
      state.claims = state.claims.filter(c => c.user_id !== id);
    },
    savePromo: async (promo) => {
      const i = state.promos.findIndex(p => p.id === promo.id);
      if (i >= 0) state.promos[i] = { ...state.promos[i], ...promo };
      else state.promos.push({ active: true, perks: [], sort: state.promos.length + 1, ...promo });
    },
    deletePromo: async (id) => {
      state.promos = state.promos.filter(p => p.id !== id);
      state.claims = state.claims.filter(c => c.promo_id !== id);
    },
    saveSettings: async (settings) => { state.settings = { ...state.settings, ...settings }; },
    removeAdmin: async (userId) => { state.admins = state.admins.filter(a => a.user_id !== userId); },
  };
};