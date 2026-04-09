import { apiRequest, refreshSession, setAccessToken } from './apiClient';
import { AuthorizedUser, User, UserRole } from '../types';

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active?: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
}

const mapUser = (user: ApiUser): User => ({
  ...user,
  active: user.active,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
  isAdmin: user.role === 'ADMIN',
});

export const login = async (email: string, password: string): Promise<User> => {
  const response = await apiRequest<{ token: string; user: ApiUser }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    false,
  );

  setAccessToken(response.token);
  return mapUser(response.user);
};

export const restoreSession = async (): Promise<User | null> => {
  try {
    await refreshSession();
    return await getCurrentUser();
  } catch {
    setAccessToken(null);
    return null;
  }
};

export const getCurrentUser = async (): Promise<User> => {
  const user = await apiRequest<ApiUser>('/api/auth/me');
  return mapUser(user);
};

export const logout = async (): Promise<void> => {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    setAccessToken(null);
  }
};

export const getUsers = async (): Promise<AuthorizedUser[]> => {
  const users = await apiRequest<ApiUser[]>('/api/admin/users');
  return users.map(mapUser);
};

export const saveUser = async (user: {
  name: string;
  email: string;
  password: string;
  isAdmin: boolean;
}): Promise<void> => {
  await apiRequest('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.isAdmin ? 'ADMIN' : 'PERITO',
    }),
  });
};

export const updateUser = async (
  userId: string,
  user: {
    name?: string;
    email?: string;
    password?: string;
    isAdmin?: boolean;
    active?: boolean;
  },
): Promise<AuthorizedUser> => {
  const response = await apiRequest<ApiUser>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...user,
      role: user.isAdmin === undefined ? undefined : user.isAdmin ? 'ADMIN' : 'PERITO',
      isAdmin: undefined,
    }),
  });

  return mapUser(response);
};

export const deleteUser = async (userId: string): Promise<void> => {
  await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
};
