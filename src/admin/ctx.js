import { createContext, useContext } from 'react';
import { useApi } from './ui';

export const AdminCtx = createContext({ logout: () => {}, me: null, can: () => false });
export const useMe = () => useContext(AdminCtx);
/** useApi that sends the user back to the sign-in screen if their session ends. */
export const useAdmin = (path, params) => useApi(path, params, useContext(AdminCtx).logout);
