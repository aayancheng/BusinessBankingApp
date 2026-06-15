import axios from 'axios';

// Relative baseURL → Vite dev server proxies /api to FastAPI:8100.
const api = axios.create({ baseURL: '' });

export async function fetchHealth() {
  return (await api.get('/health')).data;
}
export async function fetchApplications(page = 1, perPage = 50, decision = null) {
  const params = { page, per_page: perPage };
  if (decision) params.decision = decision;
  return (await api.get('/api/adjudication/applications', { params })).data;
}
export async function fetchApplication(id) {
  return (await api.get(`/api/adjudication/${id}`)).data;
}
export async function decide(payload) {
  return (await api.post('/api/adjudication/decide', payload)).data;
}
export async function fetchSegments() {
  return (await api.get('/api/adjudication/segments')).data;
}
