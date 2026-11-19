import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { AuthProvider } from '@/contexts/SupabaseAuthContext';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from "@/components/ui/use-toast";

const Root = () => {
  const { toast } = useToast();
  return (
    <AuthProvider toast={toast}>
        <App />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Toaster />
    <Root />
  </React.StrictMode>
);