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
export async function fetchPricing(id) {
  return (await api.get(`/api/pricing/${id}`)).data;
}
export async function fetchPricingPortfolio() {
  return (await api.get('/api/pricing/portfolio')).data;
}
export async function pricingQuote(payload) {
  return (await api.post('/api/pricing/quote', payload)).data;
}
export async function fetchEws(id) {
  return (await api.get(`/api/ews/${id}`)).data;
}
export async function fetchEwsWatchlist(limit = 100) {
  return (await api.get('/api/ews/watchlist', { params: { limit } })).data;
}
export async function fetchEwsSegments() {
  return (await api.get('/api/ews/segments')).data;
}
export async function fetchLineIncrease(id) {
  return (await api.get(`/api/line-increase/${id}`)).data;
}
export async function fetchCandidates(page = 1, perPage = 100) {
  return (await api.get('/api/line-increase/candidates', { params: { page, per_page: perPage } })).data;
}
export async function lineIncreaseSimulate(payload) {
  return (await api.post('/api/line-increase/simulate', payload)).data;
}
export async function fetchLineIncreaseSegments() {
  return (await api.get('/api/line-increase/segments')).data;
}
