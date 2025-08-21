const SERVER_URL: string = 'https://aily-chat.diandeng.tech';
const REGISTRY_URL: string = 'https://registry.diandeng.tech';

export const API = {
  projectList: `${REGISTRY_URL}/-/verdaccio/data/packages`,
  projectSearch: `${REGISTRY_URL}/-/v1/search`,
  // auth
  login: `${SERVER_URL}/auth/api/v1/auth/login`,
  register: `${SERVER_URL}/auth/api/v1/auth/register`,
  logout: `${SERVER_URL}/auth/api/v1/auth/logout`,
  verifyToken: `${SERVER_URL}/auth/api/v1/auth/verify`,
  refreshToken: `${SERVER_URL}/auth/api/v1/auth/refresh`,
  me: `${SERVER_URL}/auth/api/v1/auth/me`,
  // ai
  startSession: `${SERVER_URL}/chat/api/v1/start_session`,
  closeSession: `${SERVER_URL}/chat/api/v1/close_session`,
  streamConnect: `${SERVER_URL}/chat/api/v1/stream`,
  sendMessage: `${SERVER_URL}/chat/api/v1/send_message`,
  getHistory: `${SERVER_URL}/chat/api/v1/conversation_history`,
  stopSession: `${SERVER_URL}/chat/api/v1/stop_session`,
  cancelTask: `${SERVER_URL}/chat/api/v1/cancel_task`,
};
