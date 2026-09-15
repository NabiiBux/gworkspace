import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Suppress unhandled rejections and errors injected by external browser extensions (e.g. MetaMask)
if (typeof window !== 'undefined') {
  const isExtensionNoise = (err) => {
    if (!err) return false;
    const msg = (typeof err === 'string' ? err : err.message || err.description || String(err)).toLowerCase();
    return (
      msg.includes('metamask') ||
      msg.includes('failed to connect to metamask') ||
      msg.includes('extension context invalidated') ||
      msg.includes('chrome-extension://') ||
      msg.includes('moz-extension://')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isExtensionNoise(event?.reason)) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  }, true);

  window.addEventListener('error', (event) => {
    if (isExtensionNoise(event?.message) || isExtensionNoise(event?.error)) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    }
  }, true);
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error caught by RootErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      if (msg.toLowerCase().includes('metamask')) {
        // If it's a MetaMask error that somehow reached the boundary, re-render children
        return this.props.children;
      }
      return (
        <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center', color: '#1e293b' }}>
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>Something went wrong</h2>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              background: '#0F766E',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
