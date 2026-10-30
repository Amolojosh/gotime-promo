import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 1. Create the Supabase client
export const adminSb = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 2. Admin Login
export const adminLogin = async (username, password) => {
  if (!adminSb) throw new Error("Supabase not connected.");
  // The app logs in using a fake email format based on the username
  const email = `${username}@dito-demo.app`;
  const { data, error } = await adminSb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user.user_metadata?.username || username;
};

// 3. Admin Logout
export const adminLogout = async () => {
  if (adminSb) await adminSb.auth.signOut();
};

// 4. Get Current User
export const adminGetUser = async () => {
  if (!adminSb) return null;
  const { data } = await adminSb.auth.getUser();
  return data.user ? (data.user.user_metadata?.username || 'admin') : null;
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

    // Format geo data into an object
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
    // In a real app, you would call an IP lookup API here.
    // For this demo, we skip it to keep the build simple.
  },
  subscribe: (callback) => {
    if (!adminSb) return () => {};
    // Realtime subscription for live feed updates
    const channel = adminSb.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, callback)
      .subscribe();
    return () => adminSb.removeChannel(channel);
  }
};

// 7. Actions (Block, Unblock, etc.)
export const api2 = {
  blockIp: async (ip, reason, hours) => {
    await adminSb.rpc('admin_block_ip', { p_ip: ip, p_reason: reason, p_hours: hours });
  },
  unblockIp: async (ip) => {
    await adminSb.from('blocked_ips').delete().eq('ip', ip);
  },
  deleteUser: async (id) => {
    await adminSb.rpc('admin_delete_user', { p_id: id });
  },
  savePromo: async (promo) => {
    await adminSb.from('promos').upsert(promo);
  },
  deletePromo: async (id) => {
    await adminSb.from('promos').delete().eq('id', id);
  },
  saveSettings: async (settings) => {
    await adminSb.from('security_settings').update(settings).eq('id', 1);
  },
  removeAdmin: async (userId) => {
    await adminSb.from('admins').delete().eq('user_id', userId);
  }
};

// 8. Demo API (used when you visit /#/admin/demo)
export const makeDemoApi = () => ({
  load: async () => ({
    attempts: [], blocked: [], geo: {}, settings: {}, profiles: [], claims: [], promos: [], admins: [], adminAttempts: []
  }),
  enrichGeo: async () => {},
  subscribe: () => () => {}
});