import { useCallback, useState } from 'react';
import { fetchApplication, fetchApplications, decide, fetchSegments, fetchHealth, fetchPricing, fetchPricingPortfolio, pricingQuote, fetchEws, fetchEwsWatchlist, fetchEwsSegments } from './api';

function asError(e) {
  return e.response?.data?.detail || { error: 'unknown', message: 'Request failed' };
}

export function useApplication() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setData(await fetchApplication(id)); }
    catch (e) { setData(null); setError(asError(e)); }
    finally { setLoading(false); }
  }, []);
  return { data, error, loading, lookup };
}

export function useApplications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (decision = null) => {
    setLoading(true);
    try { setItems((await fetchApplications(1, 100, decision)).items || []); }
    finally { setLoading(false); }
  }, []);
  return { items, loading, load };
}

export function useDecide() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async (payload) => {
    setLoading(true);
    try { setData(await decide(payload)); }
    finally { setLoading(false); }
  }, []);
  return { data, loading, run };
}

export function useSegments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchSegments()); }
    finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}

export function useHealth() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => { try { setData(await fetchHealth()); } catch { /* noop */ } }, []);
  return { data, load };
}

export function usePricing() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setData(await fetchPricing(id)); }
    catch (e) { setData(null); setError(e.response?.data?.detail || { message: 'Request failed' }); }
    finally { setLoading(false); }
  }, []);
  return { data, error, loading, lookup };
}

export function usePricingPortfolio() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchPricingPortfolio()); } finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}

export function usePricingQuote() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const run = useCallback(async (payload) => {
    setLoading(true);
    try { setData(await pricingQuote(payload)); } finally { setLoading(false); }
  }, []);
  return { data, loading, run };
}

export function useEws() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const lookup = useCallback(async (id) => {
    if (!id) return;
    setLoading(true); setError(null);
    try { setData(await fetchEws(id)); }
    catch (e) { setData(null); setError(e.response?.data?.detail || { message: 'Request failed' }); }
    finally { setLoading(false); }
  }, []);
  return { data, error, loading, lookup };
}

export function useEwsWatchlist() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchEwsWatchlist(100)); } finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}

export function useEwsSegments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchEwsSegments()); } finally { setLoading(false); }
  }, []);
  return { data, loading, load };
}
