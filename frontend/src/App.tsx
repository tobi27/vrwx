
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { Marketplace } from './pages/Marketplace';
import { Connect } from './pages/Connect';
import { Receipts } from './pages/Receipts';
import { Quote } from './pages/Quote';
import { Community } from './pages/Community';
import { Docs } from './pages/Docs';
import { PaymentSuccess } from './pages/PaymentSuccess';
import { LanguageProvider } from './lib/i18n';
import { AuthProvider } from './lib/auth';

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/receipts/:id" element={<Receipts />} />
            <Route path="/quote" element={<Quote />} />
            <Route path="/community" element={<Community />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/payment/success" element={<PaymentSuccess />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
