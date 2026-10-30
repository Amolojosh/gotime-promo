export const adminSb = null;
export const liveApi = { load: async () => ({}), enrichGeo: async () => {}, subscribe: () => () => {} };
export const makeDemoApi = () => liveApi;
export const isAdmin = async () => false;
export const adminLogin = async () => { throw new Error("Admin is disabled in this demo."); };
export const adminLogout = async () => {};
export const adminGetUser = async () => null;