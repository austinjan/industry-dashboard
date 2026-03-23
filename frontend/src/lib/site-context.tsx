import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from './api';

interface Site {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

interface SiteContextType {
  sites: Site[];
  currentSite: Site | null;
  setCurrentSite: (site: Site) => void;
  loading: boolean;
}

const SiteContext = createContext<SiteContextType>({
  sites: [],
  currentSite: null,
  setCurrentSite: () => {},
  loading: true,
});

export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/sites')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Site[]) => {
        setSites(data ?? []);
        if (data && data.length > 0) {
          const saved = localStorage.getItem('current_site_id');
          const match = data.find((s) => s.id === saved);
          setCurrentSite(match ?? data[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSetSite = (site: Site) => {
    setCurrentSite(site);
    localStorage.setItem('current_site_id', site.id);
  };

  return (
    <SiteContext.Provider value={{ sites, currentSite, setCurrentSite: handleSetSite, loading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
