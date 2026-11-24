import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/source-sans-3';
import './styles.css';
import { App } from './App';
import { ApiError } from './lib/api';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2 },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (err instanceof ApiError && err.status === 401 && query.queryKey[0] !== 'me') void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
