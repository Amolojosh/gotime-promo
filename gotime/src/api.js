// Dummy API for demo
export const register = async () => { throw new Error("Registration is disabled in this demo."); };
export const login = async () => { throw new Error("Login is disabled in this demo."); };
export const logout = async () => {};
export const getUser = async () => "";
export const onAuthChange = () => () => {};
export const validateSession = async () => "";
export const fetchPromos = async () => [];
export const fetchClaimed = async () => [];
export const claimPromo = async () => {};