import { createContext, useContext } from 'react';
import { useApi } from './ui';

export const AdminCtx = createContext({ logout: () => {} });
/** useApi that sends the user back to the login screen if the key stops working. */
export const useAdmin = (path, params) => useApi(path, params, useContext(AdminCtx).logout);
