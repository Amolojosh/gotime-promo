import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 1. Create the Supabase client
export const adminSb = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 2. Admin Login
export const adminLogin = async (username, password) => {
  if (!adminSb) throw new Error("Supabase not connected.");
  const email = `${username}@admin-demo.app`;
  const { data, error } = await adminSb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return username;
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
export const api2 = {
  blockIp: async (ip, reason, hours) => { await adminSb.rpc('admin_block_ip', { p_ip: ip, p_reason: reason, p_hours: hours }); },
  unblockIp: async (ip) => { await adminSb.from('blocked_ips').delete().eq('ip', ip); },
  deleteUser: async (id) => { await adminSb.rpc('admin_delete_user', { p_id: id }); },
  savePromo: async (promo) => { await adminSb.from('promos').upsert(promo); },
  deletePromo: async (id) => { await adminSb.from('promos').delete().eq('id', id); },
  saveSettings: async (settings) => { await adminSb.from('security_settings').update(settings).eq('id', 1); },
  removeAdmin: async (userId) => { await adminSb.from('admins').delete().eq('user_id', userId); }
};

// 8. Demo API
export const makeDemoApi = () => ({
  load: async () => ({ attempts: [], blocked: [], geo: {}, settings: {}, profiles: [], claims: [], promos: [], admins: [], adminAttempts: [] }),
  enrichGeo: async () => {},
  subscribe: () => () => {}
});