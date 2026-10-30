import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const makeEmail = (number) => `${number}@dito-demo.app`;

export const register = async (mobile, password) => {
  const { data, error } = await supabase.auth.signUp({
    email: makeEmail(mobile),
    password: password,
    options: { data: { mobile } },
  });
  if (error) throw error;
  return data;
};

export const login = async (mobile, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: makeEmail(mobile),
    password: password,
  });
  
  if (error) throw error;
  
  // --- THIS IS THE MAGIC LINE ---
  // This records the login attempt so it shows up in the Admin Dashboard!
  await supabase.rpc('record_login_attempt', {
    p_mobile: mobile,
    p_success: true,
    p_kind: 'login'
  });
  
  return data;
};

export const logout = async () => {
  await supabase.auth.signOut();
};

export const getUser = async () => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return '';
  return data.user.user_metadata?.mobile || '';
};

export const onAuthChange = (callback) => {
  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user?.user_metadata?.mobile || '');
  });
  return () => authListener.subscription.unsubscribe();
};

export const validateSession = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user ? (data.user.user_metadata?.mobile || '') : '';
};

export const fetchPromos = async () => {
  const { data, error } = await supabase.from('promos').select('*').order('sort');
  if (error) return [];
  return data;
};

export const fetchClaimed = async (mobile) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data } = await supabase.from('claimed_promos').select('promo_id').eq('user_id', userData.user.id);
  return data ? data.map(d => d.promo_id) : [];
};

export const claimPromo = async (mobile, promoId) => {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from('claimed_promos').insert({ user_id: userData.user.id, promo_id: promoId });
};