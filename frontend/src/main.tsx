import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { WalletProvider } from './lib/wallet';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </WalletProvider>
  </React.StrictMode>
);
