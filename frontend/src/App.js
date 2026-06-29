/**
 * Google Workspace Reseller Portal - Frontend
 * Complete React Application
 */

import React, { useState, useEffect, useContext, createContext, useRef } from 'react';
import axios from 'axios';
import './App.css';

// API Config
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

// ====== EDIT THIS: allowed countries for the address autocomplete ======
// Use lowercase 2-letter country codes. Examples:
//   ['us']            -> United States only
//   ['us', 'ca']      -> United States + Canada
//   ['us', 'gb', 'au']-> US + United Kingdom + Australia
// Full list of codes: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
const ALLOWED_COUNTRIES = ['us'];
// =======================================================================

// All countries for checkout (Israel intentionally excluded).
const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Côte d'Ivoire", "Croatia", "Cuba", "Cyprus", "Czechia",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia",
  "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

// Reusable Google Maps Places address autocomplete.
// Renders an input; on selection, calls onPick({ street, city, state, zip }).
const ALLOWED_COUNTRIES_DEFAULT = ['us'];
const AddressAutocomplete = ({ onPick, countries = ALLOWED_COUNTRIES_DEFAULT }) => {
  const containerRef = useRef(null);
  const mountedRef = useRef(false);
  const [mapsReady, setMapsReady] = useState(false);

  // Load the Google Maps JavaScript API (with Places) once — same as the customer form.
  useEffect(() => {
    if (!MAPS_KEY) return;
    let poll;
    const ready = () => setMapsReady(true);
    if (window.google && window.google.maps && window.google.maps.places) { ready(); return; }
    const existing = document.getElementById('gmaps-places-script');
    if (existing) {
      existing.addEventListener('load', ready);
      // The script may already be mid-load (added by another form) and we missed 'load' — poll.
      poll = setInterval(() => { if (window.google && window.google.maps && window.google.maps.places) { clearInterval(poll); ready(); } }, 250);
      return () => { existing.removeEventListener('load', ready); if (poll) clearInterval(poll); };
    }
    const script = document.createElement('script');
    script.id = 'gmaps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = ready;
    document.body.appendChild(script);
  }, []);

  // Mount the PlaceAutocompleteElement when maps is ready — identical to the customer form.
  useEffect(() => {
    if (!mapsReady || !containerRef.current) return;
    if (mountedRef.current) return; // already mounted
    let cancelled = false;

    (async () => {
      try {
        const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');
        if (cancelled || !containerRef.current) return;

        const el = new PlaceAutocompleteElement({
          componentRestrictions: { country: countries },
        });
        el.style.width = '100%';
        mountedRef.current = true;

        const container = containerRef.current;
        container.innerHTML = '';
        container.appendChild(el);

        el.addEventListener('gmp-select', async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });
            const comps = place.addressComponents || [];
            const get = (type) => comps.find((c) => (c.types || []).includes(type));
            const streetNumber = get('street_number')?.longText || '';
            const route = get('route')?.longText || '';
            const city = get('locality')?.longText || get('sublocality')?.longText || get('postal_town')?.longText || '';
            const stateShort = get('administrative_area_level_1')?.shortText || '';
            const zip = get('postal_code')?.longText || '';
            const street = `${streetNumber} ${route}`.trim();
            onPick({ street, city, state: stateShort, zip });
          } catch (err) {
            console.error('Place select error:', err);
          }
        });
      } catch (err) {
        console.error('Autocomplete init error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [mapsReady]);

  if (!MAPS_KEY) return null;
  return <div ref={containerRef} style={{ width: '100%', minHeight: 44 }} />;
};

// Auth Context
const AuthContext = createContext();

// Branding Context — loads logo/favicon/name/color from the backend and applies the favicon.
const BrandingContext = createContext({ brandName: 'GNB MENTOR LLC', brandColor: '#0F766E', logoDataUrl: '', faviconDataUrl: '' });
const useBranding = () => useContext(BrandingContext);

const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState({ brandName: 'GNB MENTOR LLC', brandColor: '#0F766E', logoDataUrl: '', faviconDataUrl: '' });
  const refresh = async () => {
    try {
      const r = await axios.get(`${API_URL}/branding`);
      if (r.data) setBranding(r.data);
    } catch (_) { }
  };
  useEffect(() => { refresh(); }, []);
  // Guarantee the viewport meta tag exists so responsive CSS works on mobile,
  // even if public/index.html is missing it.
  useEffect(() => {
    let vp = document.querySelector("meta[name='viewport']");
    if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
    vp.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  }, []);
  // Apply favicon + page title whenever branding changes.
  useEffect(() => {
    if (branding.faviconDataUrl) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = branding.faviconDataUrl;
    }
    if (branding.brandName) document.title = branding.brandName;
  }, [branding.faviconDataUrl, branding.brandName]);
  return <BrandingContext.Provider value={{ ...branding, refresh }}>{children}</BrandingContext.Provider>;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMe = async () => {
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          const res = await axios.get(`${API_URL}/auth/me`);
          setUser(res.data);
        } catch (e) {
          // token invalid/expired
          setToken(null);
          setUser(null);
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      setLoading(false);
    };
    loadMe();
  }, [token]);

  const login = (email, token, userData) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// ==================== LOGIN PAGE ====================
const LoginPage = ({ adminMode = false, startTab = 'login' }) => {
  const { login } = useAuth();
  const brand = useBranding();
  const [activeTab, setActiveTab] = useState(startTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPwReg, setShowPwReg] = useState(false);

  // Login Form
  const [loginForm, setLoginForm] = useState({
    businessEmail: '',
    password: '',
  });

  // Register Form
  const [registerForm, setRegisterForm] = useState({
    companyName: '',
    username: '',
    domain: '',
    businessEmail: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    phoneCountryCode: '1',
    country: 'United States',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    taxId: '',
    aupAccepted: false,
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/auth/login`, loginForm);
      const { token, customer } = response.data;
      login(customer.businessEmail, token, customer);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((registerForm.businessEmail || '').trim());
    if (!emailOk) {
      setError('Please enter a valid email address (e.g. you@example.com).');
      return;
    }
    if (!registerForm.aupAccepted) {
      setError('Please accept the Voice Acceptable Use Policy to continue.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/auth/register`, registerForm);
      const { token, customer } = response.data;
      login(customer.businessEmail, token, customer);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'linear-gradient(135deg,#0F766E 0%,#0b5750 45%,#0a3f3a 100%)' }}>
      <div className="auth-card" style={{ background: '#fff', borderRadius: 20, padding: '32px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div className="auth-header" style={{ textAlign: 'center', marginBottom: 8 }}>
          {brand.logoDataUrl
            ? <img src={brand.logoDataUrl} alt={brand.brandName} style={{ maxHeight: 54, maxWidth: 200, marginBottom: 8 }} />
            : <div style={{ width: 54, height: 54, borderRadius: 14, background: '#0F766E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, marginBottom: 8 }}>{(brand.brandName || 'G')[0]}</div>}
          <h1 style={{ fontSize: 22, margin: '6px 0 2px', color: '#111827' }}>{adminMode ? 'Admin sign in' : (brand.brandName || 'GNB MENTOR LLC')}</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>{adminMode ? 'Administrator access' : 'Sign in or create your account'}</p>
        </div>

        <div className="auth-tabs">
          <button
            className={`tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Login
          </button>
          {!adminMode && (
            <button
              className={`tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              Register
            </button>
          )}
        </div>

        {adminMode && (
          <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, margin: '8px 0 0' }}>
            Administrator login
          </p>
        )}

        {error && <div className="error-message">{error}</div>}

        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="your@company.com"
                value={loginForm.businessEmail}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, businessEmail: e.target.value })
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) =>
                    setLoginForm({ ...loginForm, password: e.target.value })
                  }
                  required
                  style={{ paddingRight: 64 }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#0F766E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        )}

        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-row">
              <div className="form-group">
                <label>First Name</label>
                <input type="text" value={registerForm.firstName} required
                  onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input type="text" value={registerForm.lastName} required
                  onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Company Name</label>
                <input type="text" value={registerForm.companyName} required
                  onChange={(e) => setRegisterForm({ ...registerForm, companyName: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={registerForm.businessEmail} required
                  onChange={(e) => setRegisterForm({ ...registerForm, businessEmail: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" value={registerForm.phone} required
                  onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Country</label>
                <select value={registerForm.country}
                  onChange={(e) => setRegisterForm({ ...registerForm, country: e.target.value })}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input type="text" value={registerForm.address} required
                onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>City</label>
                <input type="text" value={registerForm.city} required
                  onChange={(e) => setRegisterForm({ ...registerForm, city: e.target.value })} />
              </div>
              <div className="form-group">
                <label>State / Region</label>
                <input type="text" value={registerForm.state} required
                  onChange={(e) => setRegisterForm({ ...registerForm, state: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Postal Code</label>
                <input type="text" value={registerForm.postalCode} required
                  onChange={(e) => setRegisterForm({ ...registerForm, postalCode: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPwReg ? 'text' : 'password'} value={registerForm.password} required
                    onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                    style={{ paddingRight: 64 }} />
                  <button type="button" onClick={() => setShowPwReg(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#0F766E', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {showPwReg ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', margin: '8px 0 16px' }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={registerForm.aupAccepted} style={{ marginTop: 3 }}
                  onChange={(e) => setRegisterForm({ ...registerForm, aupAccepted: e.target.checked })} />
                <span>
                  I have read and agree to the <a href="/voice-aup" target="_blank" rel="noreferrer" style={{ color: '#0F766E', fontWeight: 600 }}>Voice Acceptable Use Policy</a>.
                  I understand that spam, harassment, fraud, illegal use, or other violations may result in immediate suspension of my service.
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading || !registerForm.aupAccepted}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ==================== DASHBOARD ====================
const Dashboard = () => {
  const { user, logout } = useAuth();
  const initialAdminSection = (typeof window !== 'undefined' && window.location.hash)
    ? window.location.hash.replace('#', '') : 'overview';
  const [activeSection, setActiveSectionState] = useState(initialAdminSection || 'overview');
  const setActiveSection = (s) => {
    setActiveSectionState(s);
    if (typeof window !== 'undefined') window.location.hash = s;
  };
  useEffect(() => {
    const onHash = () => setActiveSectionState(window.location.hash.replace('#', '') || 'overview');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/dashboard`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    }
  };

  return (
    <div className="dashboard">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h2>📊 Workspace Portal</h2>
          <p>{user?.companyName}</p>
        </div>

        <ul className="sidebar-menu">
          <li>
            <button
              className={`menu-item ${activeSection === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveSection('overview')}
            >
              📈 Overview
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'order-workspace' ? 'active' : ''}`}
              onClick={() => setActiveSection('order-workspace')}
            >
              ✨ Order Workspace
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'products' ? 'active' : ''}`}
              onClick={() => setActiveSection('products')}
            >
              📦 Products
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'addon-pricing' ? 'active' : ''}`}
              onClick={() => setActiveSection('addon-pricing')}
            >
              🧩 Add-on Pricing
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'subs-pk' ? 'active' : ''}`}
              onClick={() => setActiveSection('subs-pk')}
            >
              Pakistan Workspace
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'subs-usa' ? 'active' : ''}`}
              onClick={() => setActiveSection('subs-usa')}
            >
              USA Voice
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveSection('customers')}
            >
              👥 Customers
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'tickets' ? 'active' : ''}`}
              onClick={() => setActiveSection('tickets')}
            >
              🎫 Tickets
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveSection('payments')}
            >
              💳 Payments
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'emails' ? 'active' : ''}`}
              onClick={() => setActiveSection('emails')}
            >
              ✉️ Emails
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'domains-ssl' ? 'active' : ''}`}
              onClick={() => setActiveSection('domains-ssl')}
            >
              🔒 Domains & SSL
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'voice-monitor' ? 'active' : ''}`}
              onClick={() => setActiveSection('voice-monitor')}
            >
              🛡 Abuse Monitor
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'branding' ? 'active' : ''}`}
              onClick={() => setActiveSection('branding')}
            >
              🎨 Branding
            </button>
          </li>
        </ul>

        <button onClick={logout} className="btn btn-logout">
          🚪 Logout
        </button>
      </nav>

      <main className="dashboard-content">
        {activeSection === 'overview' && <OverviewSection stats={stats} />}
        {activeSection === 'order-workspace' && <AdminOrderWorkspace />}
        {activeSection === 'products' && <ProductsSection />}
        {activeSection === 'addon-pricing' && <AdminAddonPricing />}
        {activeSection === 'subs-pk' && <SubscriptionsSection account="PK" />}
        {activeSection === 'subs-usa' && <SubscriptionsSection account="USA" />}
        {activeSection === 'customers' && <AdminCustomersSection />}
        {activeSection === 'tickets' && <AdminTicketsSection />}
        {activeSection === 'payments' && <AdminPaymentsSection />}
        {activeSection === 'emails' && <AdminEmailsSection />}
        {activeSection === 'domains-ssl' && <AdminDomainsSslSection />}
        {activeSection === 'voice-monitor' && <AdminVoiceMonitorSection />}
        {activeSection === 'branding' && <AdminBrandingSection />}
      </main>
    </div>
  );
};

// ==================== OVERVIEW SECTION ====================
const OverviewSection = ({ stats }) => {
  const [live, setLive] = useState(null);
  const [liveErr, setLiveErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/admin/google/dashboard`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setLive(res.data);
      } catch (e) {
        setLiveErr(e?.response?.data?.error || 'Could not load live Google data.');
      }
    })();
  }, []);

  if (!stats) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Dashboard Overview</h2>

      {liveErr && <div style={{ background: '#fff7ed', color: '#9a3412', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{liveErr}</div>}

      {/* Combined summary */}
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><h3>Total Customers</h3><p className="stat-value">{live ? (live.combined?.totalCustomers ?? live.totalCustomers) : '…'}</p></div>
        <div className="stat-card"><h3>Active Subscriptions</h3><p className="stat-value">{live ? (live.combined?.activeSubscriptions ?? live.activeSubscriptions) : '…'}</p></div>
        <div className="stat-card"><h3>Total Seats</h3><p className="stat-value">{live ? (live.combined?.totalSeats ?? live.totalSeats) : '…'}</p></div>
        <div className="stat-card"><h3>Suspended</h3><p className="stat-value">{live ? (live.combined?.suspendedSubscriptions ?? live.suspendedSubscriptions) : '…'}</p></div>
      </div>

      {/* Per-account breakdown: USA vs Pakistan */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-2">
        {[
          { key: 'pk', label: 'Pakistan reseller', sub: 'gnbmentor.com · Workspace', color: '#0F766E', data: live?.pk },
          { key: 'usa', label: 'USA reseller', sub: 'artisandrywallaz.com · Voice', color: '#1d4ed8', data: live?.usa },
        ].map(acc => (
          <div key={acc.key} style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e7eb', borderTop: `4px solid ${acc.color}` }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{acc.label}</div>
            <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>{acc.sub}</div>
            {!live ? <p style={{ color: '#9ca3af' }}>Loading…</p> : acc.data?.error ? (
              <div style={{ color: '#b45309', fontSize: 13 }}>⚠️ {acc.data.error}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: acc.color }}>{acc.data?.totalCustomers ?? 0}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Customers</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: acc.color }}>{acc.data?.activeSubscriptions ?? 0}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Active subs</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: acc.color }}>{acc.data?.totalSeats ?? 0}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Seats</div></div>
                <div><div style={{ fontSize: 24, fontWeight: 800, color: (acc.data?.suspendedSubscriptions ? '#b42318' : acc.color) }}>{acc.data?.suspendedSubscriptions ?? 0}</div><div style={{ fontSize: 12, color: '#6b7280' }}>Suspended</div></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="recent-orders" style={{ marginTop: 24 }}>
        <h3>Recent Orders</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentOrders.map((order) => (
              <tr key={order._id}>
                <td>{order.orderNumber}</td>
                <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                <td>${order.totalAmount.toFixed(2)}</td>
                <td>
                  <span className={`status ${order.status}`}>{order.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== PRODUCTS SECTION ====================
// ==================== ADMIN: ADD-ON & SKU PRICING ====================
const AdminAddonPricing = () => {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await axios.get(`${API_URL}/admin/sku-catalog`); setCatalog(r.data.catalog || []); }
    catch (e) { setMsg(e?.response?.data?.error || 'Could not load catalog.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const savePrice = async (skuId) => {
    const price = edits[skuId];
    if (price == null || price === '') { setMsg('Enter a price first.'); return; }
    setMsg('Saving…');
    try {
      await axios.post(`${API_URL}/admin/sku-price`, { skuId, price: Number(price) });
      setMsg(`✓ Price saved for ${skuId}.`);
      setEdits(prev => { const n = { ...prev }; delete n[skuId]; return n; });
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Save failed.'); }
  };

  const groups = { core: [], voice: [], addon: [] };
  catalog.forEach(c => { (groups[c.category] || groups.addon).push(c); });
  const labels = { core: 'Google Workspace Core Plans', voice: 'Google Voice', addon: 'Add-on Subscriptions' };

  const inp = { width: 110, borderRadius: 6, border: '1px solid #d8dbe6', padding: '6px 10px', fontSize: 14 };

  return (
    <div className="section">
      <h2 style={{ marginTop: 0 }}>🧩 Add-on & SKU Pricing</h2>
      <p style={{ color: '#6b7280' }}>Set your selling price (per user / month) for each plan and add-on. <strong>Add-ons with no price set cannot be purchased by customers</strong> — they'll see "Contact support" instead.</p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a' }}>{msg}</div>}

      {loading ? <p>Loading…</p> : ['core', 'voice', 'addon'].map(cat => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <h3>{labels[cat]}</h3>
          <table className="data-table">
            <thead><tr><th>Plan / Add-on</th><th>SKU ID</th><th>Price ($/user/mo)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {groups[cat].map(c => (
                <tr key={c.skuId}>
                  <td>{c.name}</td>
                  <td style={{ color: '#6b7280', fontSize: 13 }}>{c.skuId}</td>
                  <td>
                    <input
                      style={inp}
                      type="number" step="0.01" min="0"
                      placeholder={c.price != null ? '' : 'not set'}
                      value={edits[c.skuId] != null ? edits[c.skuId] : (c.price != null ? c.price : '')}
                      onChange={e => setEdits({ ...edits, [c.skuId]: e.target.value })}
                    />
                  </td>
                  <td>
                    {c.price != null
                      ? <span style={{ color: '#166534', fontWeight: 600, fontSize: 13 }}>Purchasable</span>
                      : <span style={{ color: '#b42318', fontWeight: 600, fontSize: 13 }}>No price (hidden checkout)</span>}
                  </td>
                  <td><button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => savePrice(c.skuId)}>Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};


const ProductsSection = () => {
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null); // plan being edited (or 'new')
  const [form, setForm] = useState({ planId: '', category: 'workspace', name: '', monthlyPrice: 0, skuId: '', features: '', active: true, sortOrder: 0 });
  const [msg, setMsg] = useState('');

  // Order routing + plan availability
  const [os, setOs] = useState(null);
  const [osMsg, setOsMsg] = useState('');
  const loadOs = async () => { try { const r = await axios.get(`${API_URL}/admin/order-settings`); setOs(r.data); } catch (_) { } };
  useEffect(() => { loadOs(); }, []);
  const saveOs = async (patch) => {
    const next = { ...os, ...patch };
    setOs(next); setOsMsg('');
    try { await axios.post(`${API_URL}/admin/order-settings`, next); setOsMsg('✓ Saved.'); setTimeout(() => setOsMsg(''), 1500); }
    catch (e) { setOsMsg(e?.response?.data?.error || 'Could not save.'); }
  };

  // Hosting plans (admin CRUD)
  const [hosting, setHosting] = useState([]);
  const [hForm, setHForm] = useState(null); // editing hosting plan or null
  const [hMsg, setHMsg] = useState('');
  const loadHosting = async () => { try { const r = await axios.get(`${API_URL}/admin/nc/hosting`); setHosting(r.data.plans || []); } catch (_) { } };
  useEffect(() => { loadHosting(); }, []);
  const saveHosting = async () => {
    setHMsg('');
    try {
      const body = { ...hForm, price: Number(hForm.price), cost: Number(hForm.cost || 0), features: typeof hForm.features === 'string' ? hForm.features.split('\n').map(s => s.trim()).filter(Boolean) : (hForm.features || []) };
      await axios.post(`${API_URL}/admin/nc/hosting`, body);
      setHMsg('✓ Saved.'); setHForm(null); loadHosting();
    } catch (e) { setHMsg(e?.response?.data?.error || 'Could not save.'); }
  };
  const deleteHosting = async (planId) => { if (!window.confirm('Delete this hosting plan?')) return; try { await axios.delete(`${API_URL}/admin/nc/hosting/${planId}`); loadHosting(); } catch (_) { } };

  const load = async () => {
    try { const res = await axios.get(`${API_URL}/admin/plans`); setPlans(res.data); }
    catch (_) { try { const r = await axios.get(`${API_URL}/products`); setPlans([...(r.data.workspace || []), ...(r.data.voice || []), ...(r.data.addon || [])]); } catch (__) { setPlans([]); } }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setForm({ planId: '', category: 'workspace', name: '', monthlyPrice: 0, skuId: '', features: '', active: true, sortOrder: 0 });
    setEditing('new');
  };
  const startEdit = (p) => {
    setForm({
      planId: p.planId || '', category: p.category || 'workspace', name: p.name || '',
      monthlyPrice: p.monthlyPrice ?? 0, skuId: p.skuId || '',
      features: (p.features || []).join(', '), active: p.active !== false, sortOrder: p.sortOrder || 0,
    });
    setEditing(p._id || p.id);
  };

  const save = async () => {
    setMsg('');
    const payload = {
      planId: form.planId.trim(),
      category: form.category,
      name: form.name.trim(),
      monthlyPrice: Number(form.monthlyPrice),
      skuId: form.skuId.trim(),
      features: form.features ? form.features.split(',').map(s => s.trim()).filter(Boolean) : [],
      active: !!form.active,
      sortOrder: Number(form.sortOrder) || 0,
    };
    if (!payload.planId || !payload.name) { setMsg('Plan ID and Name are required.'); return; }
    try {
      if (editing === 'new') await axios.post(`${API_URL}/admin/plans`, payload);
      else await axios.put(`${API_URL}/admin/plans/${editing}`, payload);
      setMsg('✓ Saved.'); setEditing(null); load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save.'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this plan? Customers will no longer see it.')) return;
    try { await axios.delete(`${API_URL}/admin/plans/${id}`); load(); }
    catch (e) { setMsg(e?.response?.data?.error || 'Could not delete.'); }
  };

  const inp = { width: '100%', height: 38, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 10 };
  if (!plans) return <div className="loading">Loading plans…</div>;

  return (
    <div className="section">
      <h2>📦 Products & Pricing</h2>
      <p style={{ color: '#5b6075' }}>Set the prices customers see. Changes apply immediately to the customer portal and landing page.</p>
      {msg && <div style={{ background: msg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: msg.startsWith('✓') ? '#166534' : '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{msg}</div>}

      {/* Order routing + payment plans */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>⚙ Order routing & payment plans</h3>
        {osMsg && <div style={{ color: osMsg.startsWith('✓') ? '#166534' : '#b42318', fontSize: 13, marginBottom: 8 }}>{osMsg}</div>}
        {!os ? <p style={{ color: '#9ca3af' }}>Loading…</p> : (
          <>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Which reseller account takes new Workspace orders?</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!os.pkOrdersEnabled} onChange={e => saveOs({ pkOrdersEnabled: e.target.checked })} />
                Pakistan reseller (gnbmentor.com)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!os.usaOrdersEnabled} onChange={e => saveOs({ usaOrdersEnabled: e.target.checked })} />
                USA reseller (artisandrywallaz.com)
              </label>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              New orders go to USA if it's the only one on; otherwise to Pakistan. Turn an account off to stop it taking orders.
            </div>

            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Payment plans customers can choose</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!os.flexibleEnabled} onChange={e => saveOs({ flexibleEnabled: e.target.checked })} />
                Flexible (monthly, pay-as-you-go)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!os.annualEnabled} onChange={e => saveOs({ annualEnabled: e.target.checked })} />
                Annual (12-month commitment, monthly pay)
              </label>
            </div>

            <div style={{ borderTop: '1px solid #eee', marginTop: 16, paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Workspace transfer tokens</div>
              <p style={{ color: '#6b7280', fontSize: 12, marginTop: 0 }}>Your reseller transfer tokens — customers paste these in their Google Admin to authorize transferring their Workspace to you. Set the one for whichever account takes orders.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="grid-2">
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Pakistan transfer token</label>
                  <input style={inp} value={os.pkTransferToken || ''} onChange={e => setOs({ ...os, pkTransferToken: e.target.value })} onBlur={() => saveOs({})} placeholder="e.g. C02qvoufl" />
                  <label style={{ fontSize: 12, fontWeight: 600, marginTop: 8, display: 'block' }}>Pakistan Partner ID (optional)</label>
                  <input style={inp} value={os.pkPartnerId || ''} onChange={e => setOs({ ...os, pkPartnerId: e.target.value })} onBlur={() => saveOs({})} placeholder="Partner/Reseller ID" />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>USA transfer token</label>
                  <input style={inp} value={os.usaTransferToken || ''} onChange={e => setOs({ ...os, usaTransferToken: e.target.value })} onBlur={() => saveOs({})} placeholder="e.g. C0xxxxxxx" />
                  <label style={{ fontSize: 12, fontWeight: 600, marginTop: 8, display: 'block' }}>USA Partner ID (optional)</label>
                  <input style={inp} value={os.usaPartnerId || ''} onChange={e => setOs({ ...os, usaPartnerId: e.target.value })} onBlur={() => saveOs({})} placeholder="Partner/Reseller ID" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <button className="btn btn-primary" onClick={startNew} style={{ marginBottom: 16 }}>+ Add product</button>

      {/* Hosting plans management */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>🖥 Hosting plans</h3>
          <button className="btn btn-secondary" onClick={() => setHForm({ name: '', description: '', price: '', cost: '', billingCycle: 'yearly', features: '', active: true, sortOrder: 0 })}>+ Add hosting plan</button>
        </div>
        {hMsg && <div style={{ color: hMsg.startsWith('✓') ? '#166534' : '#b42318', fontSize: 13, marginTop: 8 }}>{hMsg}</div>}

        {hForm && (
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginTop: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Plan name</label><input style={inp} value={hForm.name} onChange={e => setHForm({ ...hForm, name: e.target.value })} placeholder="Starter Hosting" /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Selling price ($)</label><input type="number" step="0.01" style={inp} value={hForm.price} onChange={e => setHForm({ ...hForm, price: e.target.value })} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Your cost ($, optional)</label><input type="number" step="0.01" style={inp} value={hForm.cost} onChange={e => setHForm({ ...hForm, cost: e.target.value })} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600 }}>Billing cycle</label>
                <select style={inp} value={hForm.billingCycle} onChange={e => setHForm({ ...hForm, billingCycle: e.target.value })}>
                  <option value="yearly">Yearly</option><option value="monthly">Monthly</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 10 }}><label style={{ fontSize: 12, fontWeight: 600 }}>Description</label><input style={inp} value={hForm.description} onChange={e => setHForm({ ...hForm, description: e.target.value })} placeholder="Great for small sites" /></div>
            <div style={{ marginTop: 10 }}><label style={{ fontSize: 12, fontWeight: 600 }}>Features (one per line)</label><textarea style={{ ...inp, height: 80, padding: '8px 12px' }} value={typeof hForm.features === 'string' ? hForm.features : (hForm.features || []).join('\n')} onChange={e => setHForm({ ...hForm, features: e.target.value })} placeholder={"10 GB storage\nFree SSL\n24/7 support"} /></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={saveHosting}>Save plan</button>
              <button className="btn btn-secondary" onClick={() => setHForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        {hosting.length > 0 && (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', marginTop: 12 }}>
            <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}><th style={{ padding: '8px 0' }}>Name</th><th>Price</th><th>Cycle</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {hosting.map(p => (
                <tr key={p.planId} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{p.name}</td>
                  <td>${Number(p.price).toFixed(2)}</td>
                  <td>{p.billingCycle}</td>
                  <td>{p.active ? '✓' : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', marginRight: 6 }} onClick={() => setHForm({ ...p, features: (p.features || []).join('\n') })}>Edit</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: '#b42318', borderColor: '#f5b5b5' }} onClick={() => deleteHosting(p.planId)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{editing === 'new' ? 'New product' : 'Edit product'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13 }}>Plan ID (unique, e.g. "starter")</label>
              <input style={inp} value={form.planId} onChange={e => setForm({ ...form, planId: e.target.value })} disabled={editing !== 'new'} />
            </div>
            <div>
              <label style={{ fontSize: 13 }}>Category</label>
              <select style={inp} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="workspace">Workspace</option>
                <option value="voice">Voice</option>
                <option value="addon">Add-on</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13 }}>Display name</label>
              <input style={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 13 }}>Price (USD / user / month)</label>
              <input type="number" step="0.01" style={inp} value={form.monthlyPrice} onChange={e => setForm({ ...form, monthlyPrice: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 13 }}>Google SKU ID</label>
              <input style={inp} value={form.skuId} onChange={e => setForm({ ...form, skuId: e.target.value })} placeholder="e.g. 1010020027" />
            </div>
            <div>
              <label style={{ fontSize: 13 }}>Sort order</label>
              <input type="number" style={inp} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
          </div>
          <label style={{ fontSize: 13 }}>Features (comma-separated)</label>
          <input style={inp} value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} placeholder="30 GB storage, Custom email, Video meetings" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active (visible to customers)
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={save}>Save</button>
            <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <table className="data-table">
        <thead><tr><th>Name</th><th>Category</th><th>Price/mo</th><th>SKU</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {plans.length === 0 ? <tr><td colSpan="6">No plans yet. Click "Add product".</td></tr> :
            plans.map(p => (
              <tr key={p._id || p.id}>
                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>${Number(p.monthlyPrice ?? 0).toFixed(2)}</td>
                <td style={{ fontSize: 12 }}>{p.skuId || '—'}</td>
                <td>{p.active === false ? 'No' : 'Yes'}</td>
                <td>
                  <button className="btn btn-secondary" onClick={() => startEdit(p)}>Edit</button>
                  {' '}
                  <button className="btn btn-secondary" onClick={() => remove(p._id || p.id)} style={{ color: '#b42318' }}>Delete</button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

// ==================== CHECKOUT MODAL ====================
const CheckoutModal = ({ items }) => {
  const [showModal, setShowModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheckout = async () => {
    setLoading(true);
    setError('');

    try {
      const orderItems = items.map((item) => ({
        productType: item.productType,
        productName: item.name,
        quantity: item.quantity,
        monthlyPrice: item.monthlyPrice,
        totalPrice: item.monthlyPrice * item.quantity,
      }));

      const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

      const response = await axios.post(`${API_URL}/orders`, {
        items: orderItems,
        paymentMethod,
      });

      alert(`Order placed successfully! Order #${response.data.order.orderNumber}`);
      setShowModal(false);
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => setShowModal(true)}
        style={{ width: '100%' }}
      >
        Proceed to Checkout
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Checkout</h3>
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="stripe">Credit Card (Stripe)</option>
                <option value="paypal">PayPal</option>
                <option value="bank">Bank Transfer</option>
              </select>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Complete Order'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ==================== ORDERS SECTION ====================
const OrdersSection = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API_URL}/orders`);
      setOrders(response.data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading orders...</div>;

  return (
    <div className="section">
      <h2>🛒 Orders</h2>

      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order._id}>
                <td>{order.orderNumber}</td>
                <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                <td>{order.items.length}</td>
                <td>${order.totalAmount.toFixed(2)}</td>
                <td>
                  <span className={`status ${order.paymentStatus}`}>
                    {order.paymentStatus}
                  </span>
                </td>
                <td>
                  <span className={`status ${order.status}`}>{order.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ==================== SUBSCRIPTIONS SECTION (per-account, paginated) ====================
const SubscriptionsSection = ({ account = 'PK' }) => {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notConnected, setNotConnected] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [voicePlans, setVoicePlans] = useState([]);
  const [vForm, setVForm] = useState({ domain: '', voicePlanId: '', seats: 1 });
  const [vMsg, setVMsg] = useState('');
  const [vBusy, setVBusy] = useState(false);

  const isUSA = account === 'USA';

  useEffect(() => { setPage(1); }, [account]);
  useEffect(() => { fetchSubs(); }, [account, page]);
  useEffect(() => { if (isUSA) fetchVoicePlans(); }, [isUSA]);

  const fetchVoicePlans = async () => {
    try {
      const res = await axios.get(`${API_URL}/products`);
      const v = res.data.voice || [];
      setVoicePlans(v);
      if (v.length) setVForm((f) => ({ ...f, voicePlanId: v[0].id }));
    } catch (_) { }
  };

  const fetchSubs = async () => {
    setLoading(true); setError(''); setNotConnected(false);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/admin/google/subscriptions?account=${account}&page=${page}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setRows(res.data.subscriptions || []);
      setSummary(res.data.summary || null);
      setTotalPages(res.data.totalPages || 1);
    } catch (e) {
      if (e?.response?.data?.notConnected) setNotConnected(true);
      setError(e?.response?.data?.error || 'Could not load subscriptions from Google.');
    } finally {
      setLoading(false);
    }
  };

  const addVoice = async () => {
    if (!vForm.domain || !vForm.voicePlanId) { setVMsg('Pick a domain and a Voice plan.'); return; }
    setVBusy(true); setVMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/admin/add-voice`, vForm, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setVMsg('✓ ' + (res.data.message || 'Voice added.') + ' It may take a few minutes to appear in Google.');
      fetchSubs();
    } catch (e) {
      setVMsg(e?.response?.data?.error || 'Could not add Voice.');
    } finally { setVBusy(false); }
  };

  // USA Voice eligibility: USA-account domains without a Voice sub yet
  const voiceSkus = ['1010330003', '1010330004', '1010330002', '1010330005', '1010330006'];
  const domainsWithVoice = new Set(rows.filter(r => voiceSkus.includes(String(r.skuId))).map(r => r.domain));
  const eligibleDomains = [...new Set(rows.map(r => r.domain))].filter(d => !domainsWithVoice.has(d));

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString() : '—';
  const planLabel = (p) => ({
    FLEXIBLE: 'Flexible (monthly)',
    ANNUAL_MONTHLY_PAY: 'Annual (monthly pay)',
    ANNUAL_YEARLY_PAY: 'Annual (yearly pay)',
    TRIAL: 'Trial', FREE: 'Free',
  }[p] || p || '—');

  const title = isUSA ? 'USA Voice Subscriptions' : 'Pakistan Workspace Subscriptions';

  if (loading) return <div className="loading">Loading {isUSA ? 'USA' : 'Pakistan'} subscriptions from Google…</div>;

  if (notConnected) {
    return (
      <div className="section">
        <h2>{title}</h2>
        <div style={{ background: '#fff7ed', color: '#9a3412', padding: '14px 16px', borderRadius: 10 }}>
          {isUSA
            ? 'USA reseller is not connected. Connect it by visiting /api/google/usa/connect on the backend.'
            : 'Pakistan reseller is not connected.'}
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>{title}</h2>

      {error && <div className="error-banner" style={{ background: '#fde8e8', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {summary && (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card"><h3>Customers</h3><p className="stat-value">{summary.totalCustomers}</p></div>
          <div className="stat-card"><h3>Subscriptions</h3><p className="stat-value">{summary.totalSubscriptions}</p></div>
          <div className="stat-card"><h3>Active</h3><p className="stat-value">{summary.activeSubscriptions}</p></div>
          <div className="stat-card"><h3>Suspended</h3><p className="stat-value">{summary.suspendedSubscriptions}</p></div>
        </div>
      )}

      {isUSA && (
        <div className="add-voice-card" style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 4px' }}>📞 Add Google Voice (USA only)</h3>
          <p style={{ margin: '0 0 12px', color: '#5b6075', fontSize: 14 }}>
            Voice is available only in supported countries (US, Canada, UK, and parts of Europe). One Voice subscription per domain.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Domain (type to search)</label>
              <input list="usa-domains-list" value={vForm.domain}
                onChange={(e) => setVForm({ ...vForm, domain: e.target.value })}
                placeholder="Search USA domains…"
                style={{ height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', minWidth: 240 }} />
              <datalist id="usa-domains-list">
                {eligibleDomains.map(d => <option key={d} value={d} />)}
              </datalist>
              <div style={{ fontSize: 12, color: '#7a809a', marginTop: 4 }}>{eligibleDomains.length} eligible domains</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Voice plan</label>
              <select value={vForm.voicePlanId} onChange={(e) => setVForm({ ...vForm, voicePlanId: e.target.value })}
                style={{ height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', minWidth: 160 }}>
                {voicePlans.map(p => <option key={p.id} value={p.id}>{p.name} (${p.monthlyPrice}/mo)</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Seats</label>
              <input type="number" min="1" value={vForm.seats}
                onChange={(e) => setVForm({ ...vForm, seats: Math.max(1, parseInt(e.target.value) || 1) })}
                style={{ height: 40, width: 80, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px' }} />
            </div>
            <button className="btn btn-primary" onClick={addVoice} disabled={vBusy} style={{ height: 40 }}>
              {vBusy ? 'Adding…' : 'Add Voice'}
            </button>
          </div>
          {vMsg && <div style={{ marginTop: 12, fontSize: 14, color: vMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{vMsg}</div>}
        </div>
      )}

      <button className="btn btn-secondary" onClick={fetchSubs} style={{ marginBottom: 12 }}>↻ Refresh</button>

      {rows.length === 0 ? (
        <p>No subscriptions found on this account.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr><th>Domain</th><th>Product</th><th>Plan</th><th>Seats</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.customerId}-${s.skuId}-${i}`}>
                  <td>{s.domain}</td>
                  <td>{s.skuName}</td>
                  <td>{planLabel(s.planName)}</td>
                  <td>{s.seats ?? s.licensedSeats ?? '—'}</td>
                  <td><span className={`status ${(s.status || '').toLowerCase()}`}>{s.status}</span></td>
                  <td>{fmtDate(s.creationTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>← Previous</button>
            <span style={{ fontSize: 14, color: '#5b6075' }}>Page {page} of {totalPages}</span>
            <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</button>
          </div>
        </>
      )}
    </div>
  );
};

// ==================== USERS SECTION ====================
const UsersSection = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    voiceNumber: '',
    forwardingNumber: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/users`, newUser);
      setNewUser({
        firstName: '',
        lastName: '',
        email: '',
        voiceNumber: '',
        forwardingNumber: '',
      });
      setShowAddUser(false);
      fetchUsers();
      alert('User created successfully!');
    } catch (error) {
      alert('Failed to create user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await axios.delete(`${API_URL}/users/${id}`);
        fetchUsers();
        alert('User disabled!');
      } catch (error) {
        alert('Failed to delete user');
      }
    }
  };

  if (loading) return <div className="loading">Loading users...</div>;

  return (
    <div className="section">
      <div className="section-header">
        <h2>👥 Users</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddUser(true)}
        >
          + Add User
        </button>
      </div>

      {showAddUser && (
        <div className="modal-overlay" onClick={() => setShowAddUser(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add New User</h3>
            <form onSubmit={handleAddUser}>
              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    type="text"
                    value={newUser.firstName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, firstName: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    type="text"
                    value={newUser.lastName}
                    onChange={(e) =>
                      setNewUser({ ...newUser, lastName: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Google Voice Number</label>
                  <input
                    type="tel"
                    value={newUser.voiceNumber}
                    onChange={(e) =>
                      setNewUser({ ...newUser, voiceNumber: e.target.value })
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Forwarding Number</label>
                  <input
                    type="tel"
                    value={newUser.forwardingNumber}
                    onChange={(e) =>
                      setNewUser({
                        ...newUser,
                        forwardingNumber: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  Create User
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddUser(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <p>No users yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Voice</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id}>
                <td>
                  {user.firstName} {user.lastName}
                </td>
                <td>{user.email}</td>
                <td>
                  <span className={`status ${user.status}`}>{user.status}</span>
                </td>
                <td>{user.voiceNumber || '-'}</td>
                <td>
                  <button
                    className="btn-remove"
                    onClick={() => handleDeleteUser(user._id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ==================== INVOICES SECTION ====================
const InvoicesSection = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const response = await axios.get(`${API_URL}/invoices`);
      setInvoices(response.data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading invoices...</div>;

  return (
    <div className="section">
      <h2>📄 Invoices</h2>

      {invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice._id}>
                <td>{invoice.invoiceNumber}</td>
                <td>{new Date(invoice.issueDate).toLocaleDateString()}</td>
                <td>${invoice.total.toFixed(2)}</td>
                <td>
                  <span className={`status ${invoice.status}`}>
                    {invoice.status}
                  </span>
                </td>
                <td>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                <td>
                  <button className="btn-download">📥 Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ==================== DOMAINS SECTION ====================
const DomainsSection = () => {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const response = await axios.get(`${API_URL}/domains`);
      setDomains(response.data);
    } catch (error) {
      console.error('Error fetching domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/domains`, { domainName: newDomain });
      setNewDomain('');
      setShowAddDomain(false);
      fetchDomains();
      alert('Domain added! Follow the verification steps.');
    } catch (error) {
      alert('Failed to add domain');
    }
  };

  const handleVerify = async (id) => {
    try {
      await axios.post(`${API_URL}/domains/${id}/verify`);
      fetchDomains();
      alert('Domain verified!');
    } catch (error) {
      alert('Verification failed. Please check DNS records.');
    }
  };

  if (loading) return <div className="loading">Loading domains...</div>;

  return (
    <div className="section">
      <div className="section-header">
        <h2>🌐 Domains</h2>
        <button className="btn btn-primary" onClick={() => setShowAddDomain(true)}>
          + Add Domain
        </button>
      </div>

      {showAddDomain && (
        <div className="modal-overlay" onClick={() => setShowAddDomain(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Domain</h3>
            <form onSubmit={handleAddDomain}>
              <div className="form-group">
                <label>Domain Name</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  Add Domain
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddDomain(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {domains.length === 0 ? (
        <p>No domains added yet.</p>
      ) : (
        <div className="domains-grid">
          {domains.map((domain) => (
            <div key={domain._id} className="domain-card">
              <h4>{domain.domainName}</h4>
              <p>
                Status:{' '}
                <span className={domain.verified ? 'verified' : 'pending'}>
                  {domain.verified ? '✓ Verified' : '⏳ Pending'}
                </span>
              </p>

              {!domain.verified && (
                <div className="verification-info">
                  <p>
                    <strong>TXT Record:</strong>
                  </p>
                  <code>{domain.txtRecord}</code>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleVerify(domain._id)}
                  >
                    Verify Domain
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== ADMIN: CUSTOMERS SECTION ====================
const AdminCustomersSection = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetMsg, setResetMsg] = useState({});

  const load = async () => {
    setLoading(true); setError('');
    try { const res = await axios.get(`${API_URL}/admin/customers`); setCustomers(res.data.customers || []); }
    catch (e) { setError(e?.response?.data?.error || 'Could not load customers.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const resetPassword = async (id) => {
    try {
      const res = await axios.post(`${API_URL}/admin/customers/${id}/reset-password`, {});
      setResetMsg(m => ({ ...m, [id]: `New temp password: ${res.data.temporaryPassword}` }));
    } catch (e) {
      setResetMsg(m => ({ ...m, [id]: e?.response?.data?.error || 'Reset failed.' }));
    }
  };

  // Attach subscription to a customer (auto-detect account from Google)
  const [attaching, setAttaching] = useState(null); // customer object
  const [attachDom, setAttachDom] = useState('');
  const [lookup, setLookup] = useState(null); // { found, account, subscriptions } | null
  const [lookupBusy, setLookupBusy] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachMsg, setAttachMsg] = useState('');

  const openAttach = (c) => { setAttaching(c); setAttachDom(c.domain || ''); setLookup(null); setAttachMsg(''); };
  const doLookup = async () => {
    const dom = attachDom.toLowerCase().trim();
    if (!dom) { setAttachMsg('Enter the customer\'s domain.'); return; }
    setLookupBusy(true); setAttachMsg(''); setLookup(null);
    try {
      const r = await axios.get(`${API_URL}/admin/lookup-domain`, { params: { domain: dom } });
      setLookup(r.data);
      if (!r.data.found) setAttachMsg(r.data.note || 'No subscription found for this domain.');
    } catch (e) { setAttachMsg(e?.response?.data?.error || 'Lookup failed.'); }
    finally { setLookupBusy(false); }
  };
  const confirmAttach = async () => {
    setAttachBusy(true); setAttachMsg('');
    try {
      const r = await axios.post(`${API_URL}/admin/customers/${attaching.id}/attach-domain`, { domain: attachDom.toLowerCase().trim() });
      setAttachMsg('✓ ' + r.data.message);
      setAttaching(null); load();
    } catch (e) { setAttachMsg(e?.response?.data?.error || 'Could not attach.'); }
    finally { setAttachBusy(false); }
  };

  if (loading) return <div className="loading">Loading customers…</div>;

  return (
    <div className="section">
      <h2>👥 Customers</h2>
      {error && <div style={{ background: '#fde8e8', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      <p style={{ color: '#5b6075' }}>{customers.length} registered customer{customers.length === 1 ? '' : 's'}</p>
      {customers.length === 0 ? <p>No customers have registered yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Username</th><th>Email</th><th>Domain</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td>{c.username || '—'}</td>
                  <td>{c.email}</td>
                  <td>{c.domain || <span style={{ color: '#b45309' }}>none</span>}</td>
                  <td>{c.account ? c.account.toUpperCase() : '—'}</td>
                  <td><span className={`status ${c.status}`}>{c.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => resetPassword(c.id)}>Reset pwd</button>
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openAttach(c)}>Attach subscription</button>
                    </div>
                    {resetMsg[c.id] && <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>{resetMsg[c.id]}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Attach subscription modal */}
      {attaching && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }} onClick={() => !attachBusy && setAttaching(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 520, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Attach Workspace subscription</h3>
            <p style={{ color: '#6b7280', marginTop: 0, fontSize: 14 }}>Customer: <strong>{attaching.email}</strong></p>

            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Customer's Workspace domain</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={attachDom} onChange={e => { setAttachDom(e.target.value); setLookup(null); }} placeholder="customerdomain.com"
                style={{ flex: 1, height: 42, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 12px' }} />
              <button onClick={doLookup} disabled={lookupBusy} className="btn btn-secondary">{lookupBusy ? 'Looking…' : 'Look up'}</button>
            </div>

            {lookup?.found && (
              <div style={{ background: '#f0f7f5', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  Found on the {lookup.account === 'usa' ? 'USA' : 'Pakistan'} account ({lookup.account.toUpperCase()}) ✓
                </div>
                <div style={{ fontSize: 13, color: '#374151' }}>Subscriptions that will be attached:</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {lookup.subscriptions.map((s, i) => (
                    <li key={i}>{s.skuName} — {s.planName || '—'} · {s.seats ?? '?'} seats · <span style={{ color: s.status === 'ACTIVE' ? '#166534' : '#b45309' }}>{s.status}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {attachMsg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: attachMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: attachMsg.startsWith('✓') ? '#166534' : '#b42318', fontSize: 14 }}>{attachMsg}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmAttach} disabled={attachBusy || !lookup?.found} className="btn btn-primary">
                {attachBusy ? 'Attaching…' : 'Attach to this customer'}
              </button>
              <button onClick={() => setAttaching(null)} disabled={attachBusy} className="btn btn-secondary">Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10, marginBottom: 0 }}>The account (Pakistan/USA) is detected automatically from where the subscription lives.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== ADMIN: TICKETS SECTION ====================
const AdminTicketsSection = () => {
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const q = filter ? `?status=${filter}` : '';
      const res = await axios.get(`${API_URL}/admin/tickets${q}`);
      setTickets(res.data.tickets || []); setCounts(res.data.counts || {});
    } catch (_) { } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);

  const sendReply = async (id) => {
    if (!reply) return;
    try { await axios.post(`${API_URL}/admin/tickets/${id}/reply`, { message: reply }); setReply(''); load(); }
    catch (_) { }
  };
  const setStatus = async (id, status) => {
    try { await axios.patch(`${API_URL}/admin/tickets/${id}/status`, { status }); load(); }
    catch (_) { }
  };

  return (
    <div className="section">
      <h2>🎫 Support Tickets</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button key={s || 'all'} className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>
            {s === '' ? 'All' : s.replace('_', ' ')} {s && counts[s] !== undefined ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {loading ? <p>Loading…</p> : tickets.length === 0 ? <p>No tickets.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map(t => (
            <div key={t._id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{t.subject}</strong>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{t.customerEmail} {t.customerDomain ? `• ${t.customerDomain}` : ''} • {t.priority}</div>
                </div>
                <span className={`status ${t.status}`}>{t.status.replace('_', ' ')}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setOpenId(openId === t._id ? null : t._id)}>
                  {openId === t._id ? 'Hide' : 'View'}
                </button>
                <button className="btn btn-secondary" onClick={() => setStatus(t._id, 'resolved')}>Mark resolved</button>
                <button className="btn btn-secondary" onClick={() => setStatus(t._id, 'closed')}>Close</button>
                <button className="btn btn-secondary" onClick={() => setStatus(t._id, 'open')}>Reopen</button>
              </div>
              {openId === t._id && (
                <div style={{ marginTop: 12 }}>
                  {t.messages.map((m, i) => (
                    <div key={i} style={{
                      marginBottom: 8, padding: '8px 12px', borderRadius: 8,
                      background: m.fromRole === 'admin' ? '#eef2ff' : '#f3f4f6'
                    }}>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
                        {m.fromRole === 'admin' ? 'Support' : 'Customer'} • {new Date(m.createdAt).toLocaleString()}
                      </div>
                      <div>{m.body}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input placeholder="Type a reply…" value={reply} onChange={e => setReply(e.target.value)}
                      style={{ flex: 1, height: 38, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px' }} />
                    <button className="btn btn-primary" onClick={() => sendReply(t._id)}>Reply</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};


// ==================== ADMIN: PAYMENTS SECTION ====================
// ==================== ADMIN: PAYMENTS + SETTINGS ====================
// ==================== ADMIN: EMAIL MANAGEMENT ====================
// ==================== ADMIN: ABUSE / SPAM COMPLAINT MONITOR ====================
// Legitimate reseller tool: log complaints received about customers, track which
// customers have a pattern of abuse, and act on confirmed cases to protect the account.
const AdminDomainsSslSection = () => {
  const [tab, setTab] = useState('tld');
  const [balance, setBalance] = useState(null);
  const [tlds, setTlds] = useState([]);
  const [sslPricing, setSslPricing] = useState([]);
  const [sslOrders, setSslOrders] = useState([]);
  const [domainOrders, setDomainOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState(20);

  const load = async () => {
    setLoading(true); setMsg('');
    try {
      const [b, t, s, so, dd] = await Promise.all([
        axios.get(`${API_URL}/admin/nc/balance`).catch(() => ({ data: null })),
        axios.get(`${API_URL}/admin/nc/tld-pricing`).catch(() => ({ data: { tlds: [] } })),
        axios.get(`${API_URL}/admin/nc/ssl-pricing`).catch(() => ({ data: { products: [] } })),
        axios.get(`${API_URL}/admin/nc/ssl-orders`).catch(() => ({ data: { orders: [] } })),
        axios.get(`${API_URL}/admin/nc/domain-diagnostic`).catch(() => ({ data: { orders: [] } })),
      ]);
      setBalance(b.data);
      setTlds(t.data.tlds || []); setDefaultMarkup(t.data.defaultMarkup ?? 20);
      setSslPricing(s.data.products || []);
      setSslOrders(so.data.orders || []);
      setDomainOrders(dd.data.orders || []);
    } catch (e) { setMsg('Could not load some data. Check Namecheap configuration.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const savePricing = async (kind, key, markupPercent, fixedPrice, cost) => {
    setMsg('');
    try {
      await axios.post(`${API_URL}/admin/nc/pricing`, { kind, key, markupPercent, fixedPrice, cost });
      setMsg('✓ Price saved.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save price.'); }
  };

  const card = { background: '#fff', borderRadius: 14, padding: 20, marginBottom: 18, border: '1px solid #e5e7eb' };
  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)} style={{ background: tab === k ? '#0F766E' : '#fff', color: tab === k ? '#fff' : '#111', border: '1px solid ' + (tab === k ? '#0F766E' : '#d8dbe6'), borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>{label}</button>
  );
  const inp = { borderRadius: 8, border: '1px solid #d8dbe6', padding: '6px 8px', fontSize: 14, width: 90 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Domains & SSL</h1>
        {balance && <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 10, padding: '8px 16px', fontWeight: 600, color: '#0F766E' }}>
          Namecheap balance: {balance.currency || '$'} {Number(balance.availableBalance ?? balance.balance ?? 0).toFixed(2)}
        </div>}
      </div>
      <p style={{ color: '#6b7280', marginTop: 6 }}>Set your selling prices (markup % or fixed), and manage SSL & domain orders. Default markup: {defaultMarkup}%.</p>

      <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {tabBtn('tld', 'TLD pricing')}
        {tabBtn('ssl', 'SSL pricing')}
        {tabBtn('sslorders', 'SSL orders')}
        {tabBtn('domainorders', 'Domain orders')}
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a' }}>{msg}</div>}
      {loading && <p>Loading…</p>}

      {tab === 'tld' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Domain TLD pricing</h3>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Your cost is from Namecheap. Set a markup % or a fixed price (fixed wins). Leave both blank to use the default {defaultMarkup}% markup.</p>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}><th style={{ padding: '6px 0' }}>TLD</th><th>Cost</th><th>Markup %</th><th>Fixed $</th><th>Your price</th><th></th></tr></thead>
            <tbody>
              {tlds.map((t, i) => <TldPriceRow key={t.tld} row={t} inp={inp} onSave={savePricing} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ssl' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>SSL certificate pricing</h3>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Same pricing model as domains. These products appear in the customer SSL page only if a price is set (or default markup applies).</p>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}><th style={{ padding: '6px 0' }}>Product</th><th>Cost</th><th>Markup %</th><th>Fixed $</th><th>Your price</th><th></th></tr></thead>
            <tbody>
              {sslPricing.map((p) => <SslPriceRow key={p.name} row={p} inp={inp} onSave={savePricing} />)}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sslorders' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>SSL orders</h3>
          {sslOrders.length === 0 ? <p style={{ color: '#6b7280' }}>No SSL orders yet.</p> : (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}><th style={{ padding: '6px 0' }}>Order</th><th>Product</th><th>Domain</th><th>Customer</th><th>Status</th></tr></thead>
              <tbody>
                {sslOrders.map(o => (
                  <tr key={o._id || o.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0' }}>{o.orderNumber}</td>
                    <td>{o.productType}</td><td>{o.forDomain || '—'}</td><td>{o.customer || '—'}</td>
                    <td><span style={{ color: (o.status === 'purchased' || o.status === 'active') ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'domainorders' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Domain orders</h3>
          {domainOrders.length === 0 ? <p style={{ color: '#6b7280' }}>No domain orders yet.</p> : (
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}><th style={{ padding: '6px 0' }}>Domain</th><th>Order status</th><th>Payment</th><th>Test?</th><th>Note</th></tr></thead>
              <tbody>
                {domainOrders.map((o, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{o.domain}</td>
                    <td><span style={{ color: o.orderStatus === 'registered' ? '#166534' : o.orderStatus === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{o.orderStatus}</span></td>
                    <td>{o.paymentStatus}</td><td>{o.isTest ? 'Yes' : 'No'}</td>
                    <td style={{ color: '#6b7280', fontSize: 12, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.result || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

// Editable pricing row for a TLD
const TldPriceRow = ({ row, inp, onSave }) => {
  const [mk, setMk] = useState(row.markupPercent ?? '');
  const [fx, setFx] = useState(row.fixedPrice ?? '');
  return (
    <tr style={{ borderTop: '1px solid #f0f0f0' }}>
      <td style={{ padding: '8px 0', fontWeight: 600 }}>.{row.tld}</td>
      <td>{row.cost != null ? `$${Number(row.cost).toFixed(2)}` : (row.error ? '—' : '…')}</td>
      <td><input style={inp} value={mk} onChange={e => setMk(e.target.value)} placeholder="e.g. 20" /></td>
      <td><input style={inp} value={fx} onChange={e => setFx(e.target.value)} placeholder="e.g. 14.99" /></td>
      <td style={{ fontWeight: 600, color: '#0F766E' }}>{row.price != null ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
      <td><button onClick={() => onSave('tld', row.tld, mk, fx, row.cost)} style={{ background: '#0F766E', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Save</button></td>
    </tr>
  );
};

// Editable pricing row for an SSL product
const SslPriceRow = ({ row, inp, onSave }) => {
  const [mk, setMk] = useState(row.markupPercent ?? '');
  const [fx, setFx] = useState(row.fixedPrice ?? '');
  return (
    <tr style={{ borderTop: '1px solid #f0f0f0' }}>
      <td style={{ padding: '8px 0', fontWeight: 600 }}>{row.name}</td>
      <td>{row.cost != null ? `$${Number(row.cost).toFixed(2)}` : '…'}</td>
      <td><input style={inp} value={mk} onChange={e => setMk(e.target.value)} placeholder="e.g. 20" /></td>
      <td><input style={inp} value={fx} onChange={e => setFx(e.target.value)} placeholder="e.g. 29.99" /></td>
      <td style={{ fontWeight: 600, color: '#0F766E' }}>{row.price != null ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
      <td><button onClick={() => onSave('ssl', row.name, mk, fx, row.cost)} style={{ background: '#0F766E', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>Save</button></td>
    </tr>
  );
};

const AdminVoiceMonitorSection = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ domain: '', reportType: 'spam_calls', source: '', severity: 'medium', phoneNumber: '', description: '' });

  const runAbuseCheck = async () => {
    setChecking(true); setMsg('');
    try { const r = await axios.get(`${API_URL}/admin/abuse/check`); setCheckResult(r.data); }
    catch (e) { setMsg(e?.response?.data?.error || 'Check failed.'); }
    finally { setChecking(false); }
  };

  const TEAL = '#0F766E';
  const card = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 };
  const inp = { width: '100%', borderRadius: 8, border: '1px solid #d8dbe6', padding: '10px 12px', marginBottom: 12, fontSize: 14, fontFamily: 'inherit' };

  const load = async () => {
    setLoading(true); setErr('');
    try { const r = await axios.get(`${API_URL}/admin/abuse-reports`); setData(r.data); }
    catch (e) { setErr(e?.response?.data?.error || 'Could not load reports.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const logReport = async () => {
    if (!form.domain.trim()) { setMsg('Customer domain is required.'); return; }
    setMsg('Saving…');
    try {
      await axios.post(`${API_URL}/admin/abuse-reports`, form);
      setMsg('✓ Report logged.');
      setForm({ domain: '', reportType: 'spam_calls', source: '', severity: 'medium', phoneNumber: '', description: '' });
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save.'); }
  };

  const setStatus = async (id, status) => {
    try { await axios.patch(`${API_URL}/admin/abuse-reports/${id}`, { status }); load(); } catch (_) { }
  };

  const suspendCustomer = async (domain) => {
    if (!window.confirm(`Suspend all Google Voice subscriptions for ${domain}? Use only for confirmed abuse.`)) return;
    setMsg('Suspending…');
    try { const r = await axios.post(`${API_URL}/admin/abuse-reports/suspend-customer`, { domain }); setMsg(`✓ ${r.data.message}`); load(); }
    catch (e) { setMsg(e?.response?.data?.error || 'Suspend failed.'); }
  };

  const riskPill = (risk) => {
    const map = { low: ['#dcfce7', '#166534', 'Low'], medium: ['#fef3c7', '#92600a', 'Medium'], high: ['#fee2e2', '#b42318', 'High'] };
    const [bg, fg, label] = map[risk] || map.low;
    return <span style={{ background: bg, color: fg, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{label} risk</span>;
  };
  const statusPill = (s) => {
    const map = { open: ['#fee2e2', '#b42318'], investigating: ['#fef3c7', '#92600a'], actioned: ['#dcfce7', '#166534'], dismissed: ['#e5e7eb', '#6b7280'] };
    const [bg, fg] = map[s] || map.open;
    return <span style={{ background: bg, color: fg, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{s}</span>;
  };

  const typeLabels = {
    spam_calls: 'Spam calls', spam_sms: 'Spam SMS', robocall: 'Robocalls', harassment: 'Harassment',
    fraud_scam: 'Fraud / scam ⛔', child_safety: 'Child safety ⛔', illegal: 'Illegal activity ⛔',
    impersonation: 'Impersonation', privacy: 'Privacy violation',
    carrier_block: 'Carrier block', google_notice: 'Google notice', other: 'Other',
  };
  const ZERO_TOL = ['fraud_scam', 'child_safety', 'illegal'];

  return (
    <div className="section">
      <h2>🛡 Abuse & Spam Monitoring</h2>
      <p style={{ color: '#6b7280' }}>
        Log complaints you receive about customers (from recipients, carriers, or Google), track which customers have a
        pattern of abuse, and suspend confirmed bad actors to protect your reseller account.
      </p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a' }}>{msg}</div>}

      {/* Abuse detection check */}
      <div style={{ ...card, borderLeft: '4px solid #b42318' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Abuse detection check</h3>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
              Flags Voice customers (existing + new) when they have a <strong>zero-tolerance report</strong> (fraud, child safety, illegal — flags on a single report) <strong>or 2+ high-severity complaints</strong>. Flag only — you decide whether to suspend.
            </p>
          </div>
          <button className="btn btn-primary" onClick={runAbuseCheck} disabled={checking}>
            {checking ? 'Checking…' : 'Run abuse check'}
          </button>
        </div>

        {checkResult && (
          <div style={{ marginTop: 16 }}>
            {checkResult.note && <div style={{ color: '#92600a', fontSize: 13, marginBottom: 10 }}>{checkResult.note}</div>}
            {checkResult.flagged.length === 0 ? (
              <div style={{ color: '#166534', fontWeight: 600 }}>✓ No customers flagged for abuse.</div>
            ) : (
              <>
                <div style={{ color: '#b42318', fontWeight: 700, marginBottom: 10 }}>
                  ⚠️ {checkResult.flagged.length} customer(s) flagged — review and decide:
                </div>
                <table className="data-table">
                  <thead><tr><th>Domain</th><th>Reason</th><th>High-severity</th><th>Open reports</th><th>Voice plan</th><th>Voice status</th><th>Purchased</th><th>Action</th></tr></thead>
                  <tbody>
                    {checkResult.flagged.map((f, i) => {
                      const vc = (checkResult.voiceCustomers || []).find(v => v.domain === f.domain);
                      const zt = f.reason === 'zero_tolerance';
                      return (
                        <tr key={i}>
                          <td>{f.domain}</td>
                          <td>
                            <span style={{ background: zt ? '#fee2e2' : '#fef3c7', color: zt ? '#b42318' : '#92600a', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                              {zt ? '⛔ Zero-tolerance' : 'Repeated high-severity'}
                            </span>
                          </td>
                          <td><span style={{ background: '#fee2e2', color: '#b42318', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{f.highSeverity} high</span></td>
                          <td>{f.totalOpen}</td>
                          <td>{vc?.plan || '—'}</td>
                          <td>{vc?.status || '—'}</td>
                          <td>{vc?.purchaseDate ? new Date(vc.purchaseDate).toLocaleDateString() : '—'}</td>
                          <td>
                            <button className="btn btn-secondary" style={{ color: '#b42318', borderColor: '#b42318' }} onClick={() => suspendCustomer(f.domain)}>
                              Review & suspend
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* Log a new report */}
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Log a complaint</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Customer domain *</label>
            <input style={inp} value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="customer.com" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Type</label>
            <select style={inp} value={form.reportType} onChange={e => setForm({ ...form, reportType: e.target.value })}>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Severity</label>
            <select style={inp} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Phone number (if known)</label>
            <input style={inp} value={form.phoneNumber} onChange={e => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+1..." />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Source</label>
            <input style={inp} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Recipient / Carrier / Google" />
          </div>
        </div>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
        <textarea style={{ ...inp, minHeight: 80 }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What was reported?" />
        <button className="btn btn-primary" onClick={logReport}>Log complaint</button>
      </div>

      {loading ? <p>Loading…</p> : err ? (
        <div style={{ background: '#fef3c7', color: '#92600a', padding: '12px 16px', borderRadius: 8 }}>{err}</div>
      ) : data && (
        <>
          {/* Customer risk summary */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Customers by risk</h3>
            {data.customers.length === 0 ? <p style={{ color: '#6b7280' }}>No complaints logged yet.</p> : (
              <table className="data-table">
                <thead><tr><th>Domain</th><th>Reports</th><th>Open</th><th>High severity</th><th>Risk</th><th>Action</th></tr></thead>
                <tbody>
                  {data.customers.map((c, i) => (
                    <tr key={i}>
                      <td>{c.domain}</td>
                      <td>{c.total}</td>
                      <td>{c.open}</td>
                      <td>{c.high}</td>
                      <td>{riskPill(c.risk)}</td>
                      <td>
                        {c.risk === 'high' && (
                          <button className="btn btn-secondary" style={{ color: '#b42318', borderColor: '#b42318' }} onClick={() => suspendCustomer(c.domain)}>
                            Suspend Voice
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* All reports */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>All complaints</h3>
            {data.reports.length === 0 ? <p style={{ color: '#6b7280' }}>None yet.</p> : (
              <table className="data-table">
                <thead><tr><th>Date</th><th>Domain</th><th>Type</th><th>Severity</th><th>Source</th><th>Status</th><th>Set status</th></tr></thead>
                <tbody>
                  {data.reports.map((r) => (
                    <tr key={r._id}>
                      <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td>{r.domain}</td>
                      <td>{typeLabels[r.reportType] || r.reportType}</td>
                      <td>{r.severity}</td>
                      <td style={{ fontSize: 13 }}>{r.source || '—'}</td>
                      <td>{statusPill(r.status)}</td>
                      <td>
                        <select value={r.status} onChange={e => setStatus(r._id, e.target.value)} style={{ borderRadius: 6, border: '1px solid #d8dbe6', padding: '4px 8px', fontSize: 13 }}>
                          <option value="open">open</option>
                          <option value="investigating">investigating</option>
                          <option value="actioned">actioned</option>
                          <option value="dismissed">dismissed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ ...card, background: '#f8fafc' }}>
            <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
              Note: Google's Reseller API doesn't expose customers' call/SMS logs, so this tracks complaints you receive
              rather than reading private call data. When a customer accumulates high-severity reports, investigate and
              suspend if confirmed — this protects your reseller standing with Google.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

const AdminEmailsSection = () => {
  const [tab, setTab] = useState('templates'); // 'templates' | 'send'
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState('warning');
  const [draft, setDraft] = useState({ subject: '', heading: '', body: '' });
  const [msg, setMsg] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [testTo, setTestTo] = useState('');
  // manual send
  const [mTo, setMTo] = useState(''); const [mSubject, setMSubject] = useState(''); const [mBody, setMBody] = useState('');
  const [mMsg, setMMsg] = useState('');

  const TEAL = '#0F766E';
  const card = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 };
  const inp = { width: '100%', borderRadius: 8, border: '1px solid #d8dbe6', padding: '10px 12px', marginBottom: 12, fontSize: 14, fontFamily: 'inherit' };

  const labels = { warning: 'Renewal warning', suspension: 'Suspension notice', payment: 'Payment confirmation' };

  const load = async () => {
    try { const r = await axios.get(`${API_URL}/admin/email/templates`); setData(r.data); pick('warning', r.data); }
    catch (_) { }
  };
  useEffect(() => { load(); }, []);

  const pick = (key, d) => {
    const src = d || data; if (!src) return;
    setEditing(key);
    setDraft({ subject: src.templates[key].subject, heading: src.templates[key].heading, body: src.templates[key].body });
    setPreviewHtml('');
    setMsg('');
  };

  const save = async () => {
    setMsg('Saving…');
    try { await axios.put(`${API_URL}/admin/email/templates/${editing}`, draft); setMsg('✓ Saved.'); load(); }
    catch (e) { setMsg(e?.response?.data?.error || 'Save failed.'); }
  };
  const resetDefault = async () => {
    setMsg('Resetting…');
    try { await axios.delete(`${API_URL}/admin/email/templates/${editing}`); setMsg('✓ Reset to default.'); load(); }
    catch (e) { setMsg(e?.response?.data?.error || 'Reset failed.'); }
  };
  const preview = async () => {
    try { const r = await axios.post(`${API_URL}/admin/email/preview`, { key: editing }); setPreviewHtml(r.data.html); }
    catch (e) { setMsg(e?.response?.data?.error || 'Preview failed.'); }
  };
  const sendTest = async () => {
    setMsg('Sending test…');
    try { const r = await axios.post(`${API_URL}/admin/email/test`, { key: editing, to: testTo || undefined }); setMsg(`✓ Test sent to ${r.data.sentTo}`); }
    catch (e) { setMsg(e?.response?.data?.error || 'Test send failed.'); }
  };
  const sendManual = async () => {
    setMMsg('Sending…');
    try { const r = await axios.post(`${API_URL}/admin/email/send`, { to: mTo, subject: mSubject, message: mBody }); setMMsg(`✓ Sent to ${r.data.sentTo}`); setMTo(''); setMSubject(''); setMBody(''); }
    catch (e) { setMMsg(e?.response?.data?.error || 'Send failed.'); }
  };

  if (!data) return <div className="section"><h2>✉️ Emails</h2><p>Loading…</p></div>;

  return (
    <div className="section">
      <h2>✉️ Emails</h2>

      {!data.emailConfigured && (
        <div style={{ background: '#fef3c7', color: '#92600a', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
          ⚠️ Email isn't configured yet. Set <code>EMAIL_USER</code> and <code>EMAIL_PASSWORD</code> (Gmail/Workspace app password) in Railway to send emails.
        </div>
      )}
      {data.emailConfigured && (
        <div style={{ color: '#166534', fontSize: 14, marginBottom: 16 }}>
          Sending from: <strong>{data.fromName} &lt;{data.fromAddress}&gt;</strong>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`btn ${tab === 'templates' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('templates')}>Templates</button>
        <button className={`btn ${tab === 'send' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('send')}>Send a message</button>
      </div>

      {tab === 'templates' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {['warning', 'suspension', 'payment'].map(k => (
              <button key={k} className={`btn ${editing === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => pick(k)}>
                {labels[k]}{data.templates[k].customized ? ' •' : ''}
              </button>
            ))}
          </div>

          <div style={card}>
            <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0 }}>
              Use variables: <code>{'{{domain}}'}</code>, <code>{'{{dueDate}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{brand}}'}</code>. They're filled automatically when sent.
            </p>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Subject</label>
            <input style={inp} value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Heading</label>
            <input style={inp} value={draft.heading} onChange={e => setDraft({ ...draft, heading: e.target.value })} />
            <label style={{ fontSize: 13, fontWeight: 600 }}>Body (one paragraph per line)</label>
            <textarea style={{ ...inp, minHeight: 140 }} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={save}>Save template</button>
              <button className="btn btn-secondary" onClick={preview}>Preview</button>
              <button className="btn btn-secondary" onClick={resetDefault}>Reset to default</button>
            </div>
            {msg && <div style={{ marginTop: 10, color: msg.startsWith('✓') ? '#166534' : '#b42318' }}>{msg}</div>}
          </div>

          {previewHtml && (
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>Preview</h3>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}

          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Send a test</h3>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Sends the <strong>{labels[editing]}</strong> template (with sample data) to an address.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ ...inp, flex: 1, marginBottom: 0, minWidth: 220 }} placeholder={data.fromAddress || 'you@example.com'} value={testTo} onChange={e => setTestTo(e.target.value)} />
              <button className="btn btn-primary" onClick={sendTest}>Send test</button>
            </div>
          </div>
        </>
      )}

      {tab === 'send' && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Send a message to a customer</h3>
          <label style={{ fontSize: 13, fontWeight: 600 }}>To (email)</label>
          <input style={inp} value={mTo} onChange={e => setMTo(e.target.value)} placeholder="customer@example.com" />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Subject</label>
          <input style={inp} value={mSubject} onChange={e => setMSubject(e.target.value)} />
          <label style={{ fontSize: 13, fontWeight: 600 }}>Message (one paragraph per line)</label>
          <textarea style={{ ...inp, minHeight: 160 }} value={mBody} onChange={e => setMBody(e.target.value)} />
          <button className="btn btn-primary" onClick={sendManual}>Send email</button>
          {mMsg && <div style={{ marginTop: 10, color: mMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{mMsg}</div>}
        </div>
      )}
    </div>
  );
};


const AdminPaymentsSection = () => {
  const [tab, setTab] = useState('settings'); // 'settings' | 'transactions'
  const [s, setS] = useState(null);
  const [payments, setPayments] = useState([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [balance, setBalance] = useState(null);
  const [balErr, setBalErr] = useState('');
  const [domainOrders, setDomainOrders] = useState([]);
  const [retryMsg, setRetryMsg] = useState({});
  const [subBilling, setSubBilling] = useState([]);
  const [subBillingMsg, setSubBillingMsg] = useState('');
  const [bulkDomains, setBulkDomains] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [testDomain, setTestDomain] = useState('');
  const [wsPreview, setWsPreview] = useState(null);
  const [suspendedList, setSuspendedList] = useState([]);
  const [unsuspendSearch, setUnsuspendSearch] = useState('');
  const [showBulkUnsuspend, setShowBulkUnsuspend] = useState(false);
  const [bulkUnsuspendDomains, setBulkUnsuspendDomains] = useState('');
  const [bulkUnsuspendResult, setBulkUnsuspendResult] = useState(null);
  const [bulkUnsuspendBusy, setBulkUnsuspendBusy] = useState(false);

  const runBulkUnsuspend = async () => {
    const domains = bulkUnsuspendDomains.split(/[\s,]+/).map(d => d.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) { setSubBillingMsg('Paste at least one domain.'); return; }
    if (!window.confirm(`Reactivate ALL suspended subscriptions for ${domains.length} domain(s)?`)) return;
    setBulkUnsuspendBusy(true); setBulkUnsuspendResult(null); setSubBillingMsg('');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/unsuspend-bulk`, { domains });
      setBulkUnsuspendResult(r.data);
      loadSuspended();
    } catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Bulk unsuspend failed.'); }
    finally { setBulkUnsuspendBusy(false); }
  };
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [selectedSubs, setSelectedSubs] = useState([]);

  const loadSuspended = async () => {
    try { const r = await axios.get(`${API_URL}/admin/billing/suspended`); setSuspendedList(r.data.suspended || []); }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Could not load suspended list.'); }
  };
  const reactivateDomain = async (s) => {
    if (!window.confirm(`Reactivate ALL suspended subscriptions for ${s.domain}?`)) return;
    setSubBillingMsg('Reactivating ' + s.domain + '…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/unsuspend`, { domain: s.domain, all: true });
      const out = r.data.outcomes.map(o => `${o.skuId}: ${o.result}`).join(' | ');
      setSubBillingMsg(`✓ ${s.domain} → ${out}`);
      loadSuspended();
    } catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Reactivate failed.'); }
  };
  const doUnsuspend = async (all) => {
    if (!selectedDomain) { setSubBillingMsg('Select a suspended domain first.'); return; }
    if (!all && !selectedSubs.length) { setSubBillingMsg('Select at least one subscription, or use Unsuspend all.'); return; }
    const payload = all
      ? { domain: selectedDomain.domain, all: true }
      : { domain: selectedDomain.domain, skuItems: selectedSubs };
    if (!window.confirm(all ? `Reactivate ALL subscriptions for ${selectedDomain.domain}?` : `Reactivate ${selectedSubs.length} selected subscription(s)?`)) return;
    setSubBillingMsg('Reactivating…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/unsuspend`, payload);
      const out = r.data.outcomes.map(o => `${o.skuId}: ${o.result}`).join(' | ');
      setSubBillingMsg(`✓ ${out}`);
      setSelectedDomain(null); setSelectedSubs([]);
      loadSuspended();
    } catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Unsuspend failed.'); }
  };

  const testSuspend = async () => {
    const d = testDomain.trim().toLowerCase();
    if (!d) { setSubBillingMsg('Enter a domain to test.'); return; }
    if (!window.confirm(`Suspend ${d} now via Google? (You can reactivate it right after.)`)) return;
    setSubBillingMsg('Suspending ' + d + '…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/test-suspend`, { domain: d });
      const out = r.data.outcomes.map(o => `${o.skuId}: ${o.result}`).join(' | ');
      setSubBillingMsg(`Test suspend ${d} → ${out}`);
      loadSubBilling();
    } catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Test suspend failed.'); }
  };
  const testActivate = async () => {
    const d = testDomain.trim().toLowerCase();
    if (!d) { setSubBillingMsg('Enter a domain.'); return; }
    setSubBillingMsg('Reactivating ' + d + '…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/test-activate`, { domain: d });
      const out = r.data.outcomes.map(o => `${o.skuId}: ${o.result}`).join(' | ');
      setSubBillingMsg(`Reactivate ${d} → ${out}`);
      loadSubBilling();
    } catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Reactivate failed.'); }
  };

  const bulkWhitelist = async () => {
    const domains = bulkDomains.split(/[\s,\n]+/).map(d => d.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) { setSubBillingMsg('Paste at least one domain.'); return; }
    if (!window.confirm(`Whitelist ${domains.length} domain(s)? They'll be permanently protected from the billing cycle (never auto-suspended) until you remove them.`)) return;
    setSubBillingMsg('Whitelisting…');
    try { const r = await axios.post(`${API_URL}/admin/billing/whitelist-bulk`, { domains }); setSubBillingMsg(`✓ Whitelisted ${r.data.updated} of ${r.data.requested} requested (${r.data.totalWhitelisted} total protected).`); setBulkDomains(''); loadSubBilling(); }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Bulk whitelist failed.'); }
  };

  const loadSubBilling = async () => {
    try { const r = await axios.get(`${API_URL}/admin/billing/subscriptions`); setSubBilling(r.data.subscriptions || []); }
    catch (_) { }
  };
  const syncSubBilling = async () => {
    setSubBillingMsg('Syncing from Google…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/sync`, {});
      const pk = r.data.pk || {}, usa = r.data.usa || {};
      setSubBillingMsg(`✓ Synced. PK: ${pk.total || 0} found (${pk.seeded || 0} new)${pk.error ? ' [' + pk.error + ']' : ''} · USA: ${usa.total || 0} found (${usa.seeded || 0} new)${usa.error ? ' [' + usa.error + ']' : ''}`);
      loadSubBilling();
    }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Sync failed.'); }
  };
  const runSubBilling = async () => {
    setSubBillingMsg('Running check…');
    try {
      const r = await axios.post(`${API_URL}/admin/billing/run`, {});
      let m = `✓ ${r.data.checked} customers checked · warned ${r.data.warned.length} · suspended ${r.data.suspended.length} · overdue ${r.data.overdue.length} · whitelisted skipped ${r.data.skippedWhitelisted || 0}`;
      if (r.data.suspendErrors && r.data.suspendErrors.length) {
        m += ` | ⚠️ ${r.data.suspendErrors.length} FAILED: ` + r.data.suspendErrors.map(e => `${e.domain} (${e.error})`).join('; ');
      }
      setSubBillingMsg(m);
      loadSubBilling();
    }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Check failed.'); }
  };
  const recalcDates = async () => {
    if (!window.confirm('Recalculate billing due dates for all accounts from their purchase date? This fixes accounts whose dates were stored incorrectly.')) return;
    setSubBillingMsg('Recalculating dates…');
    try { const r = await axios.post(`${API_URL}/admin/billing/recalculate`, {}); setSubBillingMsg(`✓ Recalculated ${r.data.updated} accounts. ${r.data.nowPastDue} are now past due and will suspend on next check.`); loadSubBilling(); }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Recalculate failed.'); }
  };
  const toggleWhitelist = async (id, whitelisted) => {
    if (whitelisted && !window.confirm('Whitelist this account? It will be permanently protected from the billing cycle (never auto-suspended), reactivated if currently suspended, until an admin removes it.')) return;
    try { await axios.post(`${API_URL}/admin/billing/whitelist`, { id, whitelisted }); loadSubBilling(); if (whitelisted) setTab('renewed'); }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Whitelist update failed.'); }
  };
  const startFromToday = async () => {
    if (!window.confirm('Reset past-due / suspended subscriptions to start a fresh 29-day cycle from today? This reactivates any we suspended.')) return;
    setSubBillingMsg('Resetting cycles to today…');
    try { const r = await axios.post(`${API_URL}/admin/billing/start-from-today`, { onlyPastDue: true }); setSubBillingMsg(`✓ Reset ${r.data.reset} subscription(s) to a fresh 29-day cycle from today.`); loadSubBilling(); }
    catch (e) { setSubBillingMsg(e?.response?.data?.error || 'Reset failed.'); }
  };

  const loadDomainOrders = async () => {
    try { const r = await axios.get(`${API_URL}/admin/domain-orders`); setDomainOrders(r.data.orders || []); }
    catch (_) { }
  };

  const retryDomain = async (id) => {
    setRetryMsg(m => ({ ...m, [id]: 'Retrying…' }));
    try {
      const r = await axios.post(`${API_URL}/admin/domain-orders/${id}/retry`, {});
      setRetryMsg(m => ({ ...m, [id]: '✓ ' + (r.data.message || 'Registered') }));
      loadDomainOrders();
    } catch (e) {
      setRetryMsg(m => ({ ...m, [id]: '✗ ' + (e?.response?.data?.error || 'Retry failed') }));
    }
  };

  const loadBalance = async () => {
    setBalErr('');
    try { const r = await axios.get(`${API_URL}/admin/domain-balance`); setBalance(r.data); }
    catch (e) { setBalErr(e?.response?.data?.error || 'Could not load balance.'); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [st, p] = await Promise.all([
        axios.get(`${API_URL}/admin/payment-settings`),
        axios.get(`${API_URL}/admin/payments`).catch(() => ({ data: { payments: [], totalPaid: 0 } })),
      ]);
      setS(st.data);
      setPayments(p.data.payments || []);
      setTotalPaid(p.data.totalPaid || 0);
    } catch (_) { } finally { setLoading(false); }
    loadBalance();
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setS(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await axios.patch(`${API_URL}/admin/payment-settings`, {
        stripeEnabled: s.stripeEnabled,
        nickyEnabled: s.nickyEnabled,
        stripeMode: s.stripeMode,
        namecheapMode: s.namecheapMode,
        stripePublishableTest: s.stripePublishableTest,
        stripePublishableLive: s.stripePublishableLive,
        feeEnabled: s.feeEnabled,
        feeFixed: s.feeFixed,
        feePercent: s.feePercent,
        taxEnabled: s.taxEnabled,
        taxPercent: s.taxPercent,
        taxLabel: s.taxLabel,
      });
      setMsg('✓ Settings saved.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const card = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18 };
  const inp = { width: '100%', height: 38, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 12, fontFamily: 'monospace', fontSize: 13 };
  const chip = (ok) => ({ fontSize: 12, fontWeight: 600, color: ok ? '#166534' : '#b45309' });

  if (loading || !s) return <div className="loading">Loading payment settings…</div>;

  return (
    <div className="section">
      <h2>💳 Payments</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button className={`btn ${tab === 'settings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('settings')}>Settings</button>
        <button className={`btn ${tab === 'transactions' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('transactions')}>Transactions</button>
        <button className={`btn ${tab === 'domains' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('domains'); loadDomainOrders(); }}>Domain Orders</button>
        <button className={`btn ${tab === 'subbilling' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('subbilling'); loadSubBilling(); }}>Subscription Billing</button>
        <button className={`btn ${tab === 'renewed' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('renewed'); loadSubBilling(); }}>Whitelist</button>
        <button className={`btn ${tab === 'suspended' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('suspended'); loadSuspended(); }}>Suspended Accounts</button>
        <button className={`btn ${tab === 'unsuspend' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('unsuspend'); loadSuspended(); }}>Unsuspend</button>
      </div>

      {tab === 'settings' && (
        <>
          {msg && <div style={{ background: msg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: msg.startsWith('✓') ? '#166534' : '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{msg}</div>}

          {/* STRIPE */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>💳 Stripe Checkout</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={!!s.stripeEnabled} onChange={e => set('stripeEnabled', e.target.checked)} /> Enabled
              </label>
            </div>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Hosted Stripe Checkout. Customers are redirected to Stripe, then returned to your site. Currently active mode: <strong style={{ color: s.stripeMode === 'live' ? '#166534' : '#b45309' }}>{(s.stripeMode || 'test').toUpperCase()}</strong></p>

            <label style={{ fontSize: 13, fontWeight: 600 }}>Payment environment</label>
            <div style={{ display: 'flex', gap: 16, margin: '8px 0 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="mode" checked={s.stripeMode !== 'live'} onChange={() => set('stripeMode', 'test')} /> Test (sandbox)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="mode" checked={s.stripeMode === 'live'} onChange={() => set('stripeMode', 'live')} /> Live (real charges)
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <h4 style={{ margin: '0 0 8px' }}>Test keys</h4>
                <label style={{ fontSize: 13 }}>Publishable key (pk_test_…)</label>
                <input style={inp} value={s.stripePublishableTest || ''} onChange={e => set('stripePublishableTest', e.target.value)} placeholder="pk_test_..." />
                <div style={chip(s.stripeTestSecretConfigured)}>Secret key (test): {s.stripeTestSecretConfigured ? 'configured in Railway ✓' : 'set STRIPE_SECRET_KEY_TEST in Railway'}</div>
              </div>
              <div>
                <h4 style={{ margin: '0 0 8px' }}>Live keys</h4>
                <label style={{ fontSize: 13 }}>Publishable key (pk_live_…)</label>
                <input style={inp} value={s.stripePublishableLive || ''} onChange={e => set('stripePublishableLive', e.target.value)} placeholder="pk_live_..." />
                <div style={chip(s.stripeLiveSecretConfigured)}>Secret key (live): {s.stripeLiveSecretConfigured ? 'configured in Railway ✓' : 'set STRIPE_SECRET_KEY in Railway'}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
              🔒 Secret keys are stored securely in Railway environment variables, never in the database. Webhook: {s.stripeWebhookConfigured ? 'configured ✓' : 'set STRIPE_WEBHOOK_SECRET'}
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginBottom: 18, border: '1px solid #e5e7eb' }}>
            <h3 style={{ marginTop: 0 }}>🌐 Namecheap (Domains, SSL, Hosting)</h3>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              Controls domain registration. <strong>Sandbox</strong> = test mode (no real charges, registers on Namecheap's test system). <strong>Live</strong> = real domains, real charges. Currently: <strong style={{ color: s.namecheapMode === 'live' ? '#166534' : '#b45309' }}>{(s.namecheapMode || 'sandbox').toUpperCase()}</strong>
            </p>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Namecheap environment</label>
            <div style={{ display: 'flex', gap: 16, margin: '8px 0 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="ncmode" checked={s.namecheapMode !== 'live'} onChange={() => set('namecheapMode', 'sandbox')} /> Sandbox (test)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="radio" name="ncmode" checked={s.namecheapMode === 'live'} onChange={() => set('namecheapMode', 'live')} /> Live (real domains)
              </label>
            </div>
            <div style={chip(s.namecheapConfigured)}>API credentials: {s.namecheapConfigured ? 'configured in Railway ✓' : 'set NAMECHEAP_API_KEY, NAMECHEAP_API_USER, NAMECHEAP_CLIENT_IP in Railway'}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#92600a', background: '#fffbeb', padding: '8px 12px', borderRadius: 8 }}>
              ⚠️ For sandbox testing, sign up at sandbox.namecheap.com and use that account's API key. The whitelisted IP must be your Railway server's outbound IP.
            </div>
          </div>

          {/* PROCESSING FEE */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Processing fee (customer-paid)</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={!!s.feeEnabled} onChange={e => set('feeEnabled', e.target.checked)} /> Enable
              </label>
            </div>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Added as a separate line item on top of the order subtotal. Fee = fixed (USD) + percentage × subtotal.</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13 }}>Fixed amount (USD)</label>
                <input type="number" step="0.01" style={{ ...inp, fontFamily: 'inherit' }} value={s.feeFixed} onChange={e => set('feeFixed', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13 }}>Percentage of subtotal (%)</label>
                <input type="number" step="0.1" style={{ ...inp, fontFamily: 'inherit' }} value={s.feePercent} onChange={e => set('feePercent', e.target.value)} />
              </div>
            </div>
          </div>

          {/* TAX */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Tax (customer-paid)</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={!!s.taxEnabled} onChange={e => set('taxEnabled', e.target.checked)} /> Enable
              </label>
            </div>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Applied as a separate line item to <strong>every</strong> order (Workspace, domains, SSL) for both card and crypto. This is the portal's own tax — Stripe/Nicky dashboard tax settings do not apply to hosted checkouts.</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13 }}>Tax rate (%)</label>
                <input type="number" step="0.1" style={{ ...inp, fontFamily: 'inherit' }} value={s.taxPercent} onChange={e => set('taxPercent', e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 13 }}>Label (e.g. VAT, GST, Sales Tax)</label>
                <input type="text" style={{ ...inp, fontFamily: 'inherit' }} value={s.taxLabel || 'Tax'} onChange={e => set('taxLabel', e.target.value)} />
              </div>
            </div>
          </div>

          {/* NICKY */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>🪙 Crypto (Nicky)</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={!!s.nickyEnabled} onChange={e => set('nickyEnabled', e.target.checked)} /> Enabled
              </label>
            </div>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Customers pay in crypto via Nicky's hosted checkout, settled to your account.</p>
            <div style={chip(s.nickyConfigured)}>API key: {s.nickyConfigured ? 'configured in Railway ✓' : 'set NICKY_API_TOKEN in Railway'}</div>
          </div>

          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save payment settings'}</button>

          {/* Reseller domain balance */}
          <div style={{ ...card, marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>🌐 Domain reseller balance</h3>
              <button className="btn btn-secondary" onClick={loadBalance}>Refresh</button>
            </div>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Your DomainNameAPI deposit balance — domains are charged from here when customers buy.</p>
            {balErr && <div style={{ color: '#b42318', fontSize: 14 }}>{balErr}</div>}
            {balance ? (
              <div style={{ fontSize: 32, fontWeight: 800, color: '#0F766E' }}>
                {balance.balance != null ? `${balance.currency || ''} ${Number(balance.balance).toFixed(2)}` : 'See details'}
              </div>
            ) : !balErr ? <div style={{ color: '#6b7280' }}>Loading…</div> : null}
          </div>

          {/* Billing automation */}
          <div style={{ ...card, marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>🔄 Renewal & billing automation</h3>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              Subscriptions renew every 29 days from last payment. Customers are warned ~4 days before, and suspended if unpaid past day 29. Paying reactivates automatically.
            </p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              A daily check must ping: <code>/api/cron/billing-check?secret=YOUR_JWT_SECRET</code> — set up a free daily cron (e.g. cron-job.org) pointing here.
            </p>
            <button className="btn btn-secondary" onClick={async () => {
              setMsg('');
              try { const r = await axios.post(`${API_URL}/admin/run-billing-check`, {}); setMsg(`✓ Checked ${r.data.checked} subs · warned ${r.data.warned.length} · suspended ${r.data.suspended.length}`); }
              catch (e) { setMsg(e?.response?.data?.error || 'Check failed.'); }
            }}>Run billing check now</button>
          </div>
        </>
      )}

      {tab === 'transactions' && (
        <>
          <div className="stats-grid" style={{ marginBottom: 18 }}>
            <div className="stat-card"><h3>Total received</h3><p className="stat-value">${Number(totalPaid).toFixed(2)}</p></div>
            <div className="stat-card"><h3>Payments</h3><p className="stat-value">{payments.length}</p></div>
            <div className="stat-card"><h3>Paid</h3><p className="stat-value">{payments.filter(p => p.status === 'paid').length}</p></div>
          </div>
          {payments.length === 0 ? <p>No payments yet.</p> : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Customer</th><th>Domain</th><th>Amount</th><th>Method</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p._id}>
                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>{p.customerEmail}</td>
                    <td>{p.domain || '—'}</td>
                    <td>${Number(p.amount || 0).toFixed(2)}</td>
                    <td>{p.method === 'nicky' ? 'Crypto' : 'Card'}</td>
                    <td><span className={`status ${p.status}`}>{p.status}</span></td>
                    <td>
                      {p.status !== 'paid' && (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={async () => {
                            if (!window.confirm('Mark this payment as PAID and provision the order? Only do this if you confirmed the payment succeeded on the provider side.')) return;
                            try { const r = await axios.post(`${API_URL}/admin/payments/mark-paid`, { paymentId: p._id }); alert(r.data.message || 'Done'); load(); }
                            catch (e) { alert(e?.response?.data?.error || 'Failed'); }
                          }}>
                          Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'domains' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Domain orders</h3>
            <button className="btn btn-secondary" onClick={loadDomainOrders}>Refresh</button>
          </div>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Paid domains register automatically. If one shows <strong>failed</strong>, click Retry to re-register it (charges your reseller balance).</p>
          {domainOrders.length === 0 ? <p>No domain orders yet.</p> : (
            <table className="data-table">
              <thead><tr><th>Date</th><th>Domain</th><th>Years</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {domainOrders.map(o => (
                  <tr key={o._id}>
                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td>{o.domainName}</td>
                    <td>{o.period}</td>
                    <td>${Number(o.price || 0).toFixed(2)}</td>
                    <td><span className={`status ${o.status === 'registered' ? 'active' : o.status === 'failed' ? 'suspended' : 'pending'}`}>{o.status}</span></td>
                    <td>
                      {o.status !== 'registered' && o.status !== 'test_paid' && (
                        <button className="btn btn-secondary" onClick={() => retryDomain(o._id)}>Retry register</button>
                      )}
                      {retryMsg[o._id] && <div style={{ fontSize: 12, marginTop: 4, color: retryMsg[o._id].startsWith('✓') ? '#166534' : '#b42318' }}>{retryMsg[o._id]}</div>}
                      {o.status === 'failed' && o.registrationResult && <div style={{ fontSize: 11, color: '#b42318', marginTop: 4 }}>{o.registrationResult.slice(0, 80)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'subbilling' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Subscription billing (30-day cycle)</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={syncSubBilling}>Sync from Google</button>
              <button className="btn btn-secondary" onClick={recalcDates}>Recalculate dates</button>
              <button className="btn btn-secondary" style={{ color: '#166534', borderColor: '#166534' }} onClick={() => setShowBulk(!showBulk)}>Bulk whitelist paid</button>
              <button className="btn btn-primary" onClick={runSubBilling}>Run check now</button>
            </div>
          </div>

          {showBulk && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>Bulk whitelist paid customers</h4>
              <p style={{ color: '#166534', fontSize: 13, margin: '0 0 10px' }}>
                Paste the domains to whitelist (one per line, or comma-separated). They'll be permanently protected from the billing cycle — never auto-suspended until you remove them.
              </p>
              <textarea value={bulkDomains} onChange={e => setBulkDomains(e.target.value)} placeholder={"customer1.com\ncustomer2.com\ncustomer3.com"} style={{ width: '100%', minHeight: 120, borderRadius: 8, border: '1px solid #bbf7d0', padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', marginBottom: 10 }} />
              <button className="btn btn-primary" onClick={bulkWhitelist}>Whitelist these domains</button>
            </div>
          )}
          <p style={{ color: '#6b7280', fontSize: 14 }}>
            Billing cycles are anchored to <strong>January 1, 2026</strong>, counted in 30-day periods (warn day 25, suspend day 29). Paid customers' cycles count from their last payment instead. The daily background check runs automatically at midnight. Whitelisted accounts are permanently skipped (never suspended).
          </p>
          {subBillingMsg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: subBillingMsg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: subBillingMsg.startsWith('✓') ? '#166534' : '#92600a' }}>{subBillingMsg}</div>}

          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 8px' }}>🧪 Test suspension on one domain</h4>
            <p style={{ color: '#1e40af', fontSize: 13, margin: '0 0 10px' }}>
              Enter a domain you own to confirm the suspend works against Google right now. This affects only that one domain — you can reactivate it immediately after.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={testDomain} onChange={e => setTestDomain(e.target.value)} placeholder="yourtestdomain.com" style={{ flex: 1, minWidth: 220, borderRadius: 8, border: '1px solid #bfdbfe', padding: '10px 12px', fontSize: 14 }} />
              <button className="btn btn-secondary" style={{ color: '#b42318', borderColor: '#b42318' }} onClick={testSuspend}>Test suspend</button>
              <button className="btn btn-secondary" style={{ color: '#166534', borderColor: '#166534' }} onClick={testActivate}>Reactivate</button>
            </div>
          </div>
          {subBilling.length === 0 ? <p>No subscriptions tracked yet. Click "Sync from Google" to load them.</p> : (
            <table className="data-table">
              <thead><tr><th>Domain</th><th>SKU</th><th>Acct</th><th>Purchased</th><th>Next bill (29d)</th><th>Status</th><th>Whitelist</th></tr></thead>
              <tbody>
                {subBilling.map(r => (
                  <tr key={r._id} style={r.whitelisted ? { background: '#f0fdf4' } : undefined}>
                    <td>{r.domain}</td>
                    <td>{r.skuId}</td>
                    <td>{(r.account || 'pk').toUpperCase()}</td>
                    <td>{r.purchaseDate ? new Date(r.purchaseDate).toLocaleDateString() : '—'}</td>
                    <td>{r.nextBillingDate ? new Date(r.nextBillingDate).toLocaleDateString() : '—'}</td>
                    <td><span className={`status ${r.billingStatus === 'active' ? 'active' : r.billingStatus === 'suspended' ? 'suspended' : 'pending'}`}>{r.billingStatus}</span></td>
                    <td>
                      {r.whitelisted ? (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleWhitelist(r._id, false)}>
                          ✓ Whitelisted — remove
                        </button>
                      ) : (
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', color: '#166534', borderColor: '#166534' }} onClick={() => toggleWhitelist(r._id, true)}>
                          Whitelist (renew)
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'renewed' && (
        <>
          <h3 style={{ marginTop: 0 }}>✓ Whitelist</h3>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Whitelisted accounts are <strong>permanently protected</strong> from the billing cycle — they are never auto-suspended, with no time limit. Only an admin can remove an account from the whitelist.</p>
          {(() => {
            const renewed = subBilling.filter(r => r.whitelisted);
            return renewed.length === 0 ? <p>No whitelisted accounts yet. Whitelist an account to add it here.</p> : (
              <table className="data-table">
                <thead><tr><th>Domain</th><th>SKU</th><th>Acct</th><th>Whitelisted on</th><th></th></tr></thead>
                <tbody>
                  {renewed.map(r => (
                    <tr key={r._id} style={{ background: '#f0fdf4' }}>
                      <td>{r.domain}</td>
                      <td>{r.skuId}</td>
                      <td>{(r.account || 'pk').toUpperCase()}</td>
                      <td>{r.whitelistedAt ? new Date(r.whitelistedAt).toLocaleDateString() : '—'}</td>
                      <td><button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => toggleWhitelist(r._id, false)}>Remove from whitelist</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </>
      )}

      {tab === 'suspended' && (
        <>
          <h3 style={{ marginTop: 0 }}>⛔ Suspended Accounts</h3>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Live list of suspended subscriptions fetched directly from Google. Click Reactivate to restore a customer's service.</p>
          {subBillingMsg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: subBillingMsg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: subBillingMsg.startsWith('✓') ? '#166534' : '#92600a' }}>{subBillingMsg}</div>}
          <button className="btn btn-secondary" style={{ marginBottom: 12 }} onClick={loadSuspended}>Refresh from Google</button>
          {suspendedList.length === 0 ? <p>No suspended accounts found in Google.</p> : (
            <table className="data-table">
              <thead><tr><th>Domain</th><th>Subscriptions</th><th>Accounts</th><th>Action</th></tr></thead>
              <tbody>
                {suspendedList.map(s => (
                  <tr key={s.domain} style={{ background: '#fef2f2' }}>
                    <td>{s.domain}</td>
                    <td>{s.subscriptions.map(x => x.skuName || x.skuId).join(', ')}</td>
                    <td>{[...new Set(s.subscriptions.map(x => (x.account || 'pk').toUpperCase()))].join(', ')}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ color: '#166534', borderColor: '#166534', fontSize: 12, padding: '4px 12px' }} onClick={() => reactivateDomain(s)}>
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'unsuspend' && (
        <>
          <h3 style={{ marginTop: 0 }}>Unsuspend a paid customer</h3>
          <p style={{ color: '#6b7280', fontSize: 14 }}>Search and select a suspended domain, then reactivate all of their subscriptions or pick specific ones.</p>
          {subBillingMsg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: subBillingMsg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: subBillingMsg.startsWith('✓') ? '#166534' : '#92600a' }}>{subBillingMsg}</div>}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-secondary" onClick={loadSuspended}>Refresh list</button>
            <button className="btn btn-secondary" style={{ color: '#166534', borderColor: '#166534' }} onClick={() => setShowBulkUnsuspend(!showBulkUnsuspend)}>Bulk unsuspend</button>
          </div>

          {showBulkUnsuspend && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px' }}>Bulk unsuspend by domain</h4>
              <p style={{ color: '#166534', fontSize: 13, margin: '0 0 10px' }}>
                Paste domains (one per line or comma-separated). This reactivates ALL suspended subscriptions for each. Any that fail are listed so you can fix and retry.
              </p>
              <textarea value={bulkUnsuspendDomains} onChange={e => setBulkUnsuspendDomains(e.target.value)} placeholder={"customer1.com\ncustomer2.com"} style={{ width: '100%', minHeight: 110, borderRadius: 8, border: '1px solid #bbf7d0', padding: '10px 12px', fontSize: 14, fontFamily: 'monospace', marginBottom: 10 }} />
              <button className="btn btn-primary" onClick={runBulkUnsuspend} disabled={bulkUnsuspendBusy}>{bulkUnsuspendBusy ? 'Reactivating…' : 'Reactivate all'}</button>

              {bulkUnsuspendResult && bulkUnsuspendResult.summary && (
                <div style={{ marginTop: 14 }}>
                  {bulkUnsuspendResult.summary.reactivated.length > 0 && (
                    <div style={{ fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                      ✓ Fully reactivated {bulkUnsuspendResult.summary.reactivated.length} domain(s): {bulkUnsuspendResult.summary.reactivated.map(d => `${d.domain} (${d.count})`).join(', ')}
                    </div>
                  )}
                  {bulkUnsuspendResult.summary.notFound.length > 0 && (
                    <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 6 }}>
                      No suspended subscriptions found for: {bulkUnsuspendResult.summary.notFound.join(', ')}
                    </div>
                  )}
                  {(bulkUnsuspendResult.summary.partial.length > 0 || bulkUnsuspendResult.summary.failed.length > 0) && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginTop: 8 }}>
                      <strong style={{ color: '#b42318' }}>⚠️ These domains had failures — fix and retry:</strong>
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#b42318' }}>
                        {bulkUnsuspendResult.summary.partial.map((f, i) => (
                          <li key={'p' + i}><strong>{f.domain}</strong> — {f.reactivated} ok, {f.failures.length} failed ({f.failures.map(x => x.error).join('; ')})</li>
                        ))}
                        {bulkUnsuspendResult.summary.failed.map((f, i) => (
                          <li key={'f' + i}><strong>{f.domain}</strong> — all failed ({f.failures.map(x => x.error).join('; ')})</li>
                        ))}
                      </ul>
                      <button className="btn btn-secondary" style={{ marginTop: 10, fontSize: 12 }}
                        onClick={() => setBulkUnsuspendDomains([...bulkUnsuspendResult.summary.partial, ...bulkUnsuspendResult.summary.failed].map(f => f.domain).join('\n'))}>
                        Load failed domains into box to retry
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <input
            value={unsuspendSearch}
            onChange={e => setUnsuspendSearch(e.target.value)}
            placeholder="🔍 Search suspended domain…"
            style={{ width: '100%', borderRadius: 8, border: '1px solid #d8dbe6', padding: '10px 12px', fontSize: 14, marginBottom: 12 }}
          />

          {suspendedList.length === 0 ? <p>No suspended domains found.</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Domain list (filtered) */}
              <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                {suspendedList.filter(s => s.domain.toLowerCase().includes(unsuspendSearch.trim().toLowerCase())).length === 0 ? (
                  <div style={{ padding: '14px', color: '#6b7280', fontSize: 13 }}>No domains match "{unsuspendSearch}".</div>
                ) : suspendedList
                  .filter(s => s.domain.toLowerCase().includes(unsuspendSearch.trim().toLowerCase()))
                  .map(s => (
                    <div key={s.domain}
                      onClick={() => { setSelectedDomain(s); setSelectedSubs([]); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: selectedDomain?.domain === s.domain ? '#eff6ff' : '#fff' }}>
                      <strong>{s.domain}</strong>
                      <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>{s.subscriptions.length} sub(s)</span>
                    </div>
                  ))}
              </div>

              {/* Selected domain's subscriptions */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                {!selectedDomain ? <p style={{ color: '#6b7280' }}>Select a domain to see its suspended subscriptions.</p> : (
                  <>
                    <h4 style={{ marginTop: 0 }}>{selectedDomain.domain}</h4>
                    {selectedDomain.subscriptions.map(sub => (
                      <label key={sub.subscriptionId || sub.skuId} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', fontSize: 14 }}>
                        <input type="checkbox" checked={selectedSubs.some(x => x.skuId === sub.skuId && x.account === sub.account)}
                          onChange={e => { if (e.target.checked) setSelectedSubs([...selectedSubs, sub]); else setSelectedSubs(selectedSubs.filter(x => !(x.skuId === sub.skuId && x.account === sub.account))); }} />
                        <span>{sub.skuName || sub.skuId} <span style={{ color: '#6b7280', fontSize: 12 }}>({(sub.account || 'pk').toUpperCase()})</span></span>
                      </label>
                    ))}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary" onClick={() => doUnsuspend(false)}>Unsuspend selected</button>
                      <button className="btn btn-secondary" style={{ color: '#166534', borderColor: '#166534' }} onClick={() => doUnsuspend(true)}>Unsuspend ALL for this domain</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
// Shared theme tokens for the customer portal (matches portal.gnbmentor.com)
const TEAL = '#0F766E';
const TEAL_DARK = '#115E56';
const INK = '#1f2937';
const MUTE = '#6b7280';

const CustomerPortal = () => {
  const { user, logout } = useAuth();
  const brand = useBranding();
  // Restore the section from the URL hash so a refresh keeps you on the same page.
  const initialSection = (typeof window !== 'undefined' && window.location.hash)
    ? window.location.hash.replace('#', '') : 'overview';
  const [section, setSectionState] = useState(initialSection || 'overview');
  const [payBanner, setPayBanner] = useState('');

  // Wrap setSection so changing pages also updates the URL hash.
  const setSection = (s) => {
    setSectionState(s);
    if (typeof window !== 'undefined') window.location.hash = s;
  };

  // Keep section in sync if the user uses browser back/forward.
  useEffect(() => {
    const onHash = () => {
      const s = window.location.hash.replace('#', '') || 'overview';
      setSectionState(s);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // GLOBAL payment-return handler: runs no matter which page the customer lands on
  // after checkout (they return to "/?payment=success&pid=..." which loads Overview).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payStatus = params.get('payment');
    const pid = params.get('pid');
    if (payStatus === 'cancelled') {
      setPayBanner('Payment was cancelled. You can try again anytime.');
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    if (payStatus === 'success' && pid) {
      setPayBanner('✓ Payment received — confirming and setting up your order…');
      let attempt = 0;
      const poll = async () => {
        try {
          const r = await axios.get(`${API_URL}/customer/payment-status/${pid}`);
          if (r.data.paid) {
            setPayBanner('✓ Payment confirmed — your order is being set up. Thank you!');
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
          if (r.data.cancelled) {
            setPayBanner('This payment was cancelled. You can order again anytime.');
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
          attempt++;
          if (attempt < 30) { setPayBanner('Confirming your payment… (this can take a moment for crypto)'); setTimeout(poll, 8000); }
          else { setPayBanner('Your payment is still confirming. Your order will activate automatically once confirmed — check back shortly or contact support.'); window.history.replaceState({}, '', window.location.pathname); }
        } catch (_) {
          attempt++;
          if (attempt < 30) setTimeout(poll, 8000);
          else { setPayBanner('We couldn\'t confirm the payment automatically. If you paid, your order will activate soon — contact support if needed.'); window.history.replaceState({}, '', window.location.pathname); }
        }
      };
      poll();
    }
  }, []);

  const navItems = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'dashboard', label: 'My subscriptions', icon: '📚' },
    { key: 'order', label: 'New subscription', icon: '✨' },
    { key: 'import', label: 'Import Workspace', icon: '📥' },
    { key: 'domains', label: 'Domains', icon: '🌐' },
    { key: 'ssl', label: 'SSL certificates', icon: '🔒' },
    { key: 'hosting', label: 'Hosting', icon: '🖥' },
    { key: 'voice', label: 'Google Voice', icon: '📞' },
    { key: 'addons', label: 'Add-ons', icon: '🧩' },
    { key: 'payments', label: 'Payments', icon: '💳' },
    { key: 'support', label: 'Support', icon: '🎫' },
    { key: 'settings', label: 'Account settings', icon: '⚙' },
  ];

  const name = user?.username || (user?.businessEmail || '').split('@')[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8f7', color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {brand.logoDataUrl
            ? <img src={brand.logoDataUrl} alt={brand.brandName} style={{ maxHeight: 38, maxWidth: 180 }} />
            : <>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(brand.brandName || 'G')[0]}</div>
              <strong style={{ fontSize: 18, color: TEAL }}>{brand.brandName || 'GNB MENTOR LLC'}</strong>
            </>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: MUTE }}>Welcome, <strong style={{ color: INK }}>{name}</strong></span>
          <span style={{ background: '#e6f4f1', color: TEAL, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>Customer</span>
          <button onClick={logout} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: INK }}>Logout</button>
        </div>
      </header>

      <div className="cp-layout" style={{ display: 'flex', gap: 24, padding: 24, maxWidth: 1200, margin: '0 auto', alignItems: 'flex-start' }}>
        {/* Sidebar card */}
        <aside className="cp-sidebar" style={{ width: 240, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700, padding: '6px 12px' }}>ACCOUNT</div>
          {navItems.map((it) => {
            const active = section === it.key;
            return (
              <button key={it.key} onClick={() => setSection(it.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  padding: '12px 14px', marginTop: 6, borderRadius: 12, cursor: 'pointer', border: 'none',
                  background: active ? TEAL : 'transparent',
                  color: active ? '#fff' : INK, fontSize: 15, fontWeight: active ? 600 : 500,
                }}>
                <span>{it.icon}</span>{it.label}
              </button>
            );
          })}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {payBanner && (
            <div style={{ background: payBanner.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: payBanner.startsWith('✓') ? '#166534' : '#92600a', borderRadius: 12, padding: '14px 18px', marginBottom: 18, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{payBanner}</span>
              <button onClick={() => setPayBanner('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit' }}>×</button>
            </div>
          )}
          {section === 'overview' && <CustomerOverview onNavigate={setSection} />}
          {section === 'dashboard' && <CustomerSubscriptions />}
          {section === 'order' && <WorkspaceOrderFlow />}
          {section === 'import' && <CustomerWorkspaceImport />}
          {section === 'domains' && <CustomerDomains />}
          {section === 'ssl' && <CustomerSsl />}
          {section === 'hosting' && <CustomerHosting />}
          {section === 'voice' && <CustomerVoice />}
          {section === 'addons' && <CustomerAddons />}
          {section === 'payments' && <CustomerPayments />}
          {section === 'support' && <CustomerSupport />}
          {section === 'settings' && <CustomerSettings />}
        </main>
      </div>
    </div>
  );
};

// Customer Overview — stat cards + recent subscriptions (matches screenshot)
const CustomerOverview = ({ onNavigate }) => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [domains, setDomains] = useState([]);
  const [hosting, setHosting] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    (async () => {
      try { const res = await axios.get(`${API_URL}/customer/my-subscriptions`); setData(res.data); }
      catch (_) { setData({ subscriptions: [] }); }
      try { const dr2 = await axios.get(`${API_URL}/customer/my-domains`); setDomains(dr2.data?.domains || []); }
      catch (_) { }
      try { const h = await axios.get(`${API_URL}/customer/nc/hosting/orders`); setHosting(h.data?.orders || []); }
      catch (_) { }
      finally { setLoading(false); }
      try { const dr = await axios.get(`${API_URL}/workspace-orders/draft`); setDraft(dr.data.draft || null); }
      catch (_) { }
    })();
  }, []);

  const discardDraft = async () => {
    if (!window.confirm('Discard your saved order in progress?')) return;
    try { await axios.delete(`${API_URL}/workspace-orders/draft`); setDraft(null); } catch (_) { }
  };

  const name = user?.username || (user?.businessEmail || '').split('@')[0];
  const subs = data?.subscriptions || [];
  // Only count ACTIVE subscriptions for the headline counts (exclude suspended/pending/abandoned).
  const activeSubs = subs.filter(s => (s.status || '').toUpperCase() === 'ACTIVE');
  const active = activeSubs.length;
  const suspended = subs.filter(s => (s.status || '').toUpperCase() === 'SUSPENDED').length;
  // Only count fully registered domains (exclude failed / pending-checkout).
  const activeDomains = domains.filter(d => d.status === 'registered' || d.status === 'test_paid');
  const activeHosting = hosting.filter(h => h.status === 'active' || h.status === 'test_paid');

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
  const pill = (color, bg) => ({ background: bg, color, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 });

  return (
    <div>
      <h1 style={{ fontSize: 32, margin: '0 0 6px', color: INK }}>Welcome back, {name}</h1>
      <p style={{ color: MUTE, margin: '0 0 24px' }}>Your Workspace orders, payments, and mailboxes in one place.</p>

      {draft && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, color: '#92600a', marginBottom: 4 }}>⏳ You have an unfinished order</div>
            <div style={{ color: '#92600a', fontSize: 14 }}>
              {draft.draftData?.form?.domain ? `For ${draft.draftData.form.domain}. ` : ''}Pick up right where you left off — your details are saved.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onNavigate('order')} style={{ border: 'none', background: TEAL, color: '#fff', borderRadius: 999, padding: '10px 22px', cursor: 'pointer', fontWeight: 700 }}>Resume order</button>
            <button onClick={discardDraft} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 999, padding: '10px 18px', cursor: 'pointer', color: '#92600a' }}>Discard</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="grid-2">
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>WORKSPACE</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: INK, margin: '6px 0' }}>{loading ? '…' : active}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Active subscriptions</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>HOSTING</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: TEAL, margin: '6px 0' }}>{loading ? '…' : activeHosting.length}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Active plans</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>DOMAINS</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: INK, margin: '6px 0' }}>{loading ? '…' : activeDomains.length}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Registered</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>SUSPENDED</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: suspended ? '#b42318' : MUTE, margin: '6px 0' }}>{loading ? '…' : suspended}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Need attention</div>
        </div>
      </div>

      <div style={{ ...card, padding: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ margin: 0 }}>Recent subscriptions</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onNavigate('payments')} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 999, padding: '8px 18px', cursor: 'pointer', color: INK }}>Payments</button>
            <button onClick={() => onNavigate('order')} style={{ border: 'none', background: TEAL, color: '#fff', borderRadius: 999, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>New subscription</button>
          </div>
        </div>
        {loading ? <div style={{ padding: 24 }}>Loading…</div> : subs.length === 0 ? (
          <div style={{ padding: 24, color: MUTE }}>No subscriptions yet. Click <strong>New subscription</strong> to order Workspace.</div>
        ) : subs.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: i < subs.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
            <div>
              <div style={{ fontWeight: 700, color: INK }}>{s.domain}</div>
              <div style={{ color: MUTE, fontSize: 14 }}>{s.skuName} · {s.seats ?? 1} seat{(s.seats ?? 1) === 1 ? '' : 's'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={(s.status === 'ACTIVE') ? pill('#166534', '#dcfce7') : (s.status === 'SUSPENDED') ? pill('#b42318', '#fde8e8') : pill('#92600a', '#fef3c7')}>
                {s.status === 'ACTIVE' ? 'Active' : s.status === 'SUSPENDED' ? 'Suspended' : (s.status || 'Pending')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Customer Payments page (placeholder until Stripe is wired in Step 2)
const CustomerPayments = () => {
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

  const load = async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        axios.get(`${API_URL}/workspace-orders`),
        axios.get(`${API_URL}/customer/payments`).catch(() => ({ data: { payments: [] } })),
      ]);
      setOrders(o.data || []);
      setPayments(p.data.payments || []);
    } catch (_) { } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    // Payment-return verification is handled globally in CustomerPortal now,
    // so it works regardless of which page the customer lands on after checkout.
  }, []);

  // Poll the backend, which checks Nicky's real status API. Marks paid only when Nicky says "Finished".
  const verifyPayment = async (pid, attempt) => {
    try {
      const r = await axios.get(`${API_URL}/customer/payment-status/${pid}`);
      if (r.data.paid) {
        setMsg('✓ Payment confirmed — your order is being set up. Thank you!');
        load();
        return;
      }
      if (r.data.cancelled) {
        setMsg('This payment was cancelled. You can place the order again anytime.');
        return;
      }
      // Crypto can take a few minutes to confirm. Poll every 8s for up to ~4 minutes.
      if (attempt < 30) {
        setMsg('Waiting for your crypto payment to confirm on the network… (this can take a few minutes)');
        setTimeout(() => verifyPayment(pid, attempt + 1), 8000);
      } else {
        setMsg('Your payment is still confirming. Once the network confirms it, your order activates automatically — check "My subscriptions" shortly, or contact support if it doesn\'t appear.');
      }
    } catch (_) {
      if (attempt < 30) setTimeout(() => verifyPayment(pid, attempt + 1), 8000);
      else setMsg('We couldn\'t confirm the payment automatically. If you paid, your order will activate once confirmed — contact support if needed.');
    }
  };

  const pay = async (orderId, method) => {
    setBusy(orderId + method); setMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/checkout`, { orderId, method });
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl; // redirect to Stripe or Nicky hosted checkout
      } else {
        setMsg('Could not start checkout.');
      }
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Could not start checkout.');
    } finally { setBusy(''); }
  };

  const paidOrderIds = new Set(payments.filter(p => p.status === 'paid').map(p => String(p.orderId)));

  if (loading) return <div className="loading">Loading your payments…</div>;

  return (
    <div>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>💳 Payments</h1>
      <p style={{ color: MUTE, margin: '0 0 20px' }}>Pay for your orders by card or crypto.</p>

      {msg && <div style={{ background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a', padding: '12px 16px', borderRadius: 10, marginBottom: 20 }}>{msg}</div>}

      <h3>Orders awaiting payment</h3>
      {orders.filter(o => !paidOrderIds.has(String(o._id))).length === 0 ? (
        <div style={{ ...card, color: MUTE }}>No orders awaiting payment.</div>
      ) : orders.filter(o => !paidOrderIds.has(String(o._id))).map(o => (
        <div key={o._id} style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{o.organization?.domain}</div>
              <div style={{ color: MUTE, fontSize: 14 }}>Order {o.orderNumber} · {o.plan?.name} · {o.seats} seat{o.seats === 1 ? '' : 's'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <strong style={{ fontSize: 20 }}>${Number(o.monthlyTotal || 0).toFixed(2)}</strong>
              <button onClick={() => pay(o._id, 'stripe')} disabled={!!busy}
                style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
                {busy === o._id + 'stripe' ? '…' : '💳 Pay by card'}
              </button>
              <button onClick={() => pay(o._id, 'nicky')} disabled={!!busy}
                style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 18px', fontWeight: 600, cursor: 'pointer' }}>
                {busy === o._id + 'nicky' ? '…' : '🪙 Pay with crypto'}
              </button>
            </div>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 28 }}>Payment history</h3>
      {payments.length === 0 ? (
        <div style={{ ...card, color: MUTE }}>No payments yet.</div>
      ) : (
        <div style={card}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
            <tbody>
              {payments.map(p => (
                <tr key={p._id}>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>${Number(p.amount || 0).toFixed(2)}</td>
                  <td>{p.method === 'nicky' ? 'Crypto' : 'Card'}</td>
                  <td><span className={`status ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Customer: their own subscriptions
// Customer: domain search + availability (DomainNameAPI)
const CustomerDomains = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Verification panel
  const [vDomain, setVDomain] = useState('');
  const [vMethod, setVMethod] = useState('txt');
  const [vData, setVData] = useState(null);
  const [vMsg, setVMsg] = useState('');
  const [vLoading, setVLoading] = useState(false);

  // Domain registration (pay first)
  const [regBusy, setRegBusy] = useState(false);
  const [regMsg, setRegMsg] = useState('');

  // My domains
  const [myDomains, setMyDomains] = useState([]);
  const [renewBusy, setRenewBusy] = useState('');
  const [manageDomain, setManageDomain] = useState(null);

  // Transfer in
  const [xferDomain, setXferDomain] = useState('');
  const [xferEpp, setXferEpp] = useState('');
  const [xferBusy, setXferBusy] = useState(false);
  const [xferMsg, setXferMsg] = useState('');
  const [transfers, setTransfers] = useState([]);

  // SSL
  const [sslProducts, setSslProducts] = useState([]);
  const [sslOrders, setSslOrders] = useState([]);
  const [sslPick, setSslPick] = useState('');
  const [sslYears, setSslYears] = useState(1);
  const [sslForDomain, setSslForDomain] = useState('');
  const [sslBusy, setSslBusy] = useState(false);
  const [sslMsg, setSslMsg] = useState('');

  const loadSsl = async () => {
    try {
      const [p, o] = await Promise.all([
        axios.get(`${API_URL}/customer/nc/ssl`).catch(() => null),
        axios.get(`${API_URL}/customer/nc/ssl/orders`).catch(() => null),
      ]);
      if (p?.data?.products) { setSslProducts(p.data.products); if (!sslPick && p.data.products[0]) setSslPick(p.data.products[0].name); }
      if (o?.data?.orders) setSslOrders(o.data.orders);
    } catch (_) { }
  };
  useEffect(() => { loadSsl(); }, []);

  const buySsl = async (method) => {
    if (!sslPick) { setSslMsg('Choose an SSL product.'); return; }
    setSslBusy(true); setSslMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/nc/ssl/buy`, { productType: sslPick, years: sslYears, forDomain: sslForDomain, method });
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else setSslMsg('Could not start checkout.');
    } catch (e) { setSslMsg(e?.response?.data?.error || 'Could not start SSL purchase.'); }
    finally { setSslBusy(false); }
  };

  const loadTransfers = async () => {
    try { const r = await axios.get(`${API_URL}/customer/domains/transfers`); setTransfers(r.data.transfers || []); }
    catch (_) { }
  };
  useEffect(() => { loadTransfers(); }, []);

  const startTransfer = async (method) => {
    const dom = xferDomain.toLowerCase().trim();
    if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setXferMsg('Enter a full domain like example.com'); return; }
    if (!xferEpp.trim()) { setXferMsg('Enter the EPP / Auth code from your current registrar.'); return; }
    setXferBusy(true); setXferMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/domains/transfer`, { domainName: dom, eppCode: xferEpp.trim(), method });
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else setXferMsg('Could not start transfer checkout.');
    } catch (e) { setXferMsg(e?.response?.data?.error || 'Could not start transfer.'); }
    finally { setXferBusy(false); }
  };

  useEffect(() => {
    (async () => {
      try { const r = await axios.get(`${API_URL}/customer/my-domains`); setMyDomains(r.data.domains || []); }
      catch (_) { }
    })();
  }, []);

  const renewDomain = async (d, method) => {
    setRenewBusy(d.id); setRegMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/domains/renew`, { domainName: d.domainName, period: 1, method });
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else setRegMsg('Could not start renewal checkout.');
    } catch (e) { setRegMsg(e?.response?.data?.error || 'Could not start renewal.'); }
    finally { setRenewBusy(''); }
  };

  const [buyingDomain, setBuyingDomain] = useState('');
  const buyDomain = async (method, domainObj) => {
    const d = domainObj || result;
    if (!d?.available && !d?.domain) return;
    const domainName = d.domain || d.domainName;
    const price = d.price;
    setBuyingDomain(domainName); setRegBusy(true); setRegMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/domains/register`, {
        domainName, period: 1, price, method,
      });
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl; // pay first; domain registers on payment
      } else {
        setRegMsg('Could not start checkout.');
      }
    } catch (e) { setRegMsg(e?.response?.data?.error || 'Could not start checkout.'); }
    finally { setRegBusy(false); setBuyingDomain(''); }
  };

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

  const search = async () => {
    setError(''); setResult(null);
    const dom = query.toLowerCase().trim();
    if (!dom) { setError('Enter a domain or a name to search.'); return; }
    // Allow either a full domain (example.com) or a bare name (example) for multi-TLD search.
    if (dom.includes('.') && !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setError('Enter a valid domain like example.com, or just a name.'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/customer/domains/search`, { domainName: dom });
      setResult(res.data);
    } catch (e) { setError(e?.response?.data?.error || 'Search failed.'); }
    finally { setLoading(false); }
  };

  const checkVerify = async () => {
    setVMsg('');
    const dom = vDomain.toLowerCase().trim();
    if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setVMsg('Enter a full domain like example.com'); return; }
    setVLoading(true);
    try {
      const res = await axios.post(`${API_URL}/customer/domains/verify-check`, { domain: dom, method: vMethod });
      setVData(res.data);
      setVMsg(res.data.verified ? '✓ Domain verified! You can proceed with your Workspace plan.' : 'Not verified yet — add the record below, wait a few minutes for DNS, then Check again.');
    } catch (e) { setVMsg(e?.response?.data?.error || 'Check failed.'); }
    finally { setVLoading(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>🌐 Domains</h1>
      <p style={{ color: MUTE, margin: '0 0 20px' }}>Search for a domain, or verify a domain you already own.</p>

      <div style={{ ...card, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Find a domain</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search(); }}
            placeholder="Type a name (e.g. mybusiness) or a full domain"
            style={{ flex: 1, height: 46, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px', fontSize: 16 }}
          />
          <button onClick={search} disabled={loading}
            style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '0 24px', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {error && <div style={{ color: '#b42318', marginTop: 10, fontSize: 14 }}>{error}</div>}

        {result && result.results && (
          <div style={{ marginTop: 16 }}>
            {result.results.map((r, i) => (
              <div key={i} style={{ background: r.available ? '#f0f7f5' : '#fafafa', borderRadius: 12, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, opacity: r.available ? 1 : 0.7 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{r.domain}</span>
                  {r.isPremium && <span style={{ marginLeft: 8, fontSize: 11, background: '#fde68a', color: '#92600a', padding: '2px 8px', borderRadius: 999 }}>Premium</span>}
                  <div style={{ color: r.available ? '#166534' : '#b45309', fontWeight: 600, fontSize: 13 }}>{r.available ? '✓ Available' : '✗ Taken'}</div>
                </div>
                {r.available && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 18, color: TEAL }}>{r.price != null ? `$${Number(r.price).toFixed(2)}/yr` : ''}</strong>
                    <button onClick={() => buyDomain('stripe', r)} disabled={regBusy}
                      style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      {regBusy && buyingDomain === r.domain ? '…' : '💳 Buy'}
                    </button>
                    <button onClick={() => buyDomain('nicky', r)} disabled={regBusy}
                      style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      🪙
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {regMsg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: regMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: regMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{regMsg}</div>}
      </div>

      <div style={{ ...card }}>
        <h3 style={{ marginTop: 0 }}>My domains</h3>
        {myDomains.length === 0 ? (
          <p style={{ color: MUTE }}>You haven't registered any domains yet. Search above to get one.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: MUTE }}>
              <th style={{ padding: '8px 0' }}>Domain</th><th>Status</th><th>Expires</th><th></th>
            </tr></thead>
            <tbody>
              {myDomains.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 0', fontWeight: 600 }}>{d.domainName}</td>
                  <td>
                    <span style={{ color: d.status === 'registered' ? '#166534' : d.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>
                      {d.status === 'registered' ? '✓ Active' : d.status === 'failed' ? 'Failed' : d.status === 'pending' ? 'Processing' : d.status}
                    </span>
                    {d.status === 'failed' && d.error && <div style={{ fontSize: 12, color: '#b42318' }}>{d.error}</div>}
                  </td>
                  <td>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {d.status === 'registered' && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => setManageDomain(d.domainName)}
                          style={{ background: '#fff', color: INK, border: '1px solid #d8dbe6', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                          ⚙ Manage
                        </button>
                        <button onClick={() => renewDomain(d, 'stripe')} disabled={renewBusy === d.id}
                          style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                          {renewBusy === d.id ? '…' : 'Renew (card)'}
                        </button>
                        <button onClick={() => renewDomain(d, 'nicky')} disabled={renewBusy === d.id}
                          style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                          🪙
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {manageDomain && <DomainManagePanel domain={manageDomain} onClose={() => setManageDomain(null)} />}

      <div style={{ ...card, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Transfer a domain in</h3>
        <p style={{ color: MUTE, fontSize: 14 }}>Move a domain you own at another registrar into your account here. You'll need to <strong>unlock</strong> the domain at your current registrar and get its <strong>EPP / Auth code</strong>. Transfers include 1 year and usually take 5–7 days.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input value={xferDomain} onChange={e => setXferDomain(e.target.value)} placeholder="yourdomain.com"
            style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px' }} />
          <input value={xferEpp} onChange={e => setXferEpp(e.target.value)} placeholder="EPP / Auth code"
            style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => startTransfer('stripe')} disabled={xferBusy}
            style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
            {xferBusy ? '…' : '💳 Transfer (pay by card)'}
          </button>
          <button onClick={() => startTransfer('nicky')} disabled={xferBusy}
            style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
            {xferBusy ? '…' : '🪙 Transfer (crypto)'}
          </button>
        </div>
        {xferMsg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: xferMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: xferMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{xferMsg}</div>}

        {transfers.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h4 style={{ margin: '0 0 8px' }}>Transfer status</h4>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: MUTE }}><th style={{ padding: '6px 0' }}>Domain</th><th>Status</th><th>Started</th></tr></thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{t.domainName}</td>
                    <td><span style={{ color: t.status === 'completed' ? '#166534' : t.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>
                      {t.status === 'completed' ? '✓ Completed' : t.status === 'failed' ? 'Failed' : t.status === 'submitted' ? (t.transferStatus || 'In progress') : 'Processing'}
                    </span>{t.status === 'failed' && t.note && <div style={{ fontSize: 12, color: '#b42318' }}>{t.note}</div>}</td>
                    <td>{t.submittedAt ? new Date(t.submittedAt).toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>SSL certificates</h3>
        <p style={{ color: MUTE, fontSize: 14 }}>Secure your website with an SSL certificate (HTTPS padlock). After purchase, you'll activate it with a CSR for your domain.</p>
        {sslProducts.length === 0 ? (
          <p style={{ color: MUTE }}>No SSL products are available right now. Please check back later.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 1.5fr', gap: 10, marginBottom: 10 }}>
              <select value={sslPick} onChange={e => setSslPick(e.target.value)} style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px' }}>
                {sslProducts.map(p => <option key={p.name} value={p.name}>{p.name} — ${Number(p.price).toFixed(2)}/yr</option>)}
              </select>
              <select value={sslYears} onChange={e => setSslYears(Number(e.target.value))} style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 8px' }}>
                {[1, 2].map(y => <option key={y} value={y}>{y} yr</option>)}
              </select>
              <input value={sslForDomain} onChange={e => setSslForDomain(e.target.value)} placeholder="for domain (optional)" style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => buySsl('stripe')} disabled={sslBusy} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>{sslBusy ? '…' : '💳 Buy SSL (card)'}</button>
              <button onClick={() => buySsl('nicky')} disabled={sslBusy} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>{sslBusy ? '…' : '🪙 Buy SSL (crypto)'}</button>
            </div>
          </>
        )}
        {sslMsg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: sslMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: sslMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{sslMsg}</div>}

        {sslOrders.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h4 style={{ margin: '0 0 8px' }}>Your SSL certificates</h4>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: MUTE }}><th style={{ padding: '6px 0' }}>Product</th><th>For</th><th>Status</th></tr></thead>
              <tbody>
                {sslOrders.map(o => (
                  <tr key={o.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{o.productType}</td>
                    <td>{o.forDomain || '—'}</td>
                    <td><span style={{ color: o.status === 'purchased' ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>
                      {o.status === 'purchased' ? '✓ Purchased' : o.status === 'failed' ? 'Failed' : o.status === 'test_paid' ? 'Test' : 'Processing'}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
const DomainManagePanel = ({ domain, onClose }) => {
  const [tab, setTab] = useState('dns'); // 'dns' | 'nameservers' | 'verification'
  const [hosts, setHosts] = useState([]);
  const [usingNcDns, setUsingNcDns] = useState(true);
  const [ns, setNs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [customNs, setCustomNs] = useState(['', '']);
  // Verification + contacts
  const [verif, setVerif] = useState(null);
  const [contact, setContact] = useState(null);
  const [vLoading, setVLoading] = useState(false);

  const loadVerification = async () => {
    setVLoading(true); setMsg('');
    try {
      const [vRes, cRes] = await Promise.all([
        axios.get(`${API_URL}/customer/domains/${domain}/verification`).catch(() => null),
        axios.get(`${API_URL}/customer/domains/${domain}/contacts`).catch(() => null),
      ]);
      if (vRes?.data) setVerif(vRes.data);
      if (cRes?.data?.contact) setContact(cRes.data.contact);
    } catch (_) { }
    finally { setVLoading(false); }
  };

  const resendVerification = async () => {
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/customer/domains/${domain}/resend-verification`);
      setMsg('✓ Verification email re-sent. Check the registrant inbox and click the link.');
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not resend verification.'); }
    finally { setSaving(false); }
  };

  const saveContacts = async () => {
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/customer/domains/${domain}/contacts`, { contact });
      setMsg('✓ Contact details updated. Namecheap may send a new verification email.');
      loadVerification();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not update contacts.'); }
    finally { setSaving(false); }
  };

  const load = async () => {
    setLoading(true); setMsg('');
    try {
      const [dnsRes, nsRes] = await Promise.all([
        axios.get(`${API_URL}/customer/domains/${domain}/dns`).catch(e => ({ error: e })),
        axios.get(`${API_URL}/customer/domains/${domain}/nameservers`).catch(e => ({ error: e })),
      ]);
      if (dnsRes.data) { setHosts(dnsRes.data.hosts || []); setUsingNcDns(dnsRes.data.usingNamecheapDns); }
      if (nsRes.data) { setNs(nsRes.data.nameservers || []); }
    } catch (e) { setMsg('Could not load DNS settings.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [domain]);

  const addRecord = () => setHosts([...hosts, { name: '@', type: 'A', address: '', ttl: 1800, mxPref: 10 }]);

  // Email presets — add the right MX records in one click.
  const addGoogleEmail = () => {
    // Modern Google Workspace uses a single MX host. (Older setups used 5 hosts.)
    const withoutMx = hosts.filter(h => h.type !== 'MX');
    const googleMx = [{ name: '@', type: 'MX', address: 'smtp.google.com', mxPref: 1, ttl: 3600 }];
    setHosts([...withoutMx, ...googleMx]);
    setMsg('Google Workspace MX record added. Click "Save DNS records" to apply.');
  };
  const addGoogleEmailLegacy = () => {
    const withoutMx = hosts.filter(h => h.type !== 'MX');
    const legacy = [
      { name: '@', type: 'MX', address: 'aspmx.l.google.com', mxPref: 1, ttl: 3600 },
      { name: '@', type: 'MX', address: 'alt1.aspmx.l.google.com', mxPref: 5, ttl: 3600 },
      { name: '@', type: 'MX', address: 'alt2.aspmx.l.google.com', mxPref: 5, ttl: 3600 },
      { name: '@', type: 'MX', address: 'alt3.aspmx.l.google.com', mxPref: 10, ttl: 3600 },
      { name: '@', type: 'MX', address: 'alt4.aspmx.l.google.com', mxPref: 10, ttl: 3600 },
    ];
    setHosts([...withoutMx, ...legacy]);
    setMsg('Google Workspace (5-record) MX set added. Click "Save DNS records" to apply.');
  };
  const addCustomMx = () => {
    setHosts([...hosts, { name: '@', type: 'MX', address: 'mail.yourprovider.com', mxPref: 10, ttl: 3600 }]);
  };
  const updateRecord = (i, field, val) => { const h = [...hosts]; h[i] = { ...h[i], [field]: val }; setHosts(h); };
  const removeRecord = (i) => setHosts(hosts.filter((_, idx) => idx !== i));

  const saveDns = async () => {
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/customer/domains/${domain}/dns`, { hosts });
      setMsg('✓ DNS records saved. Changes can take a few minutes to propagate.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save DNS records.'); }
    finally { setSaving(false); }
  };

  const saveCustomNs = async () => {
    const valid = customNs.filter(n => n.trim());
    if (valid.length < 2) { setMsg('Enter at least 2 nameservers.'); return; }
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/customer/domains/${domain}/nameservers`, { nameservers: valid });
      setMsg('✓ Custom nameservers set. This can take time to propagate.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not set nameservers.'); }
    finally { setSaving(false); }
  };

  const useDefaultNs = async () => {
    if (!window.confirm('Reset to Namecheap default nameservers? This restores default DNS.')) return;
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/customer/domains/${domain}/nameservers`, { useDefault: true });
      setMsg('✓ Reset to Namecheap default nameservers.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not reset nameservers.'); }
    finally { setSaving(false); }
  };

  const requestTransferOut = async () => {
    if (!window.confirm(`Request transfer-out instructions for ${domain}? We'll email you the steps.`)) return;
    setSaving(true); setMsg('');
    try {
      const r = await axios.post(`${API_URL}/customer/domains/${domain}/transfer-out`);
      setMsg('✓ ' + (r.data.message || 'Transfer-out instructions emailed.'));
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not request transfer-out.'); }
    finally { setSaving(false); }
  };

  const inp = { borderRadius: 8, border: '1px solid #d8dbe6', padding: '7px 10px', fontSize: 14 };
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', zIndex: 1000, overflowY: 'auto' };
  const modal = { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 760, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Manage {domain}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: MUTE }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setTab('dns')} style={{ background: tab === 'dns' ? TEAL : '#fff', color: tab === 'dns' ? '#fff' : INK, border: '1px solid ' + (tab === 'dns' ? TEAL : '#d8dbe6'), borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>DNS Records</button>
          <button onClick={() => setTab('nameservers')} style={{ background: tab === 'nameservers' ? TEAL : '#fff', color: tab === 'nameservers' ? '#fff' : INK, border: '1px solid ' + (tab === 'nameservers' ? TEAL : '#d8dbe6'), borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Nameservers</button>
          <button onClick={() => { setTab('verification'); loadVerification(); }} style={{ background: tab === 'verification' ? TEAL : '#fff', color: tab === 'verification' ? '#fff' : INK, border: '1px solid ' + (tab === 'verification' ? TEAL : '#d8dbe6'), borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>Verification</button>
        </div>

        {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a', fontSize: 14 }}>{msg}</div>}

        {loading ? <p>Loading…</p> : tab === 'dns' ? (
          <div>
            {!usingNcDns && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#92600a' }}>
                This domain is using custom nameservers, so these records may not apply. Switch to Namecheap default nameservers (Nameservers tab) to manage DNS here.
              </div>
            )}
            <p style={{ color: MUTE, fontSize: 13 }}>Add, edit, or remove DNS records. Common types: A (IP address), CNAME (alias), MX (mail), TXT (verification).</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 2fr 70px 36px', gap: 8, fontSize: 12, fontWeight: 700, color: MUTE, marginBottom: 6 }}>
              <div>Host</div><div>Type</div><div>Value</div><div>TTL</div><div></div>
            </div>
            {hosts.map((h, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 2fr 70px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input style={inp} value={h.name || ''} onChange={e => updateRecord(i, 'name', e.target.value)} placeholder="@" />
                <select style={inp} value={h.type} onChange={e => updateRecord(i, 'type', e.target.value)}>
                  {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'URL'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={inp} value={h.address || ''} onChange={e => updateRecord(i, 'address', e.target.value)} placeholder="value / IP / target" />
                <input style={inp} value={h.ttl || 1800} onChange={e => updateRecord(i, 'ttl', e.target.value)} />
                <button onClick={() => removeRecord(i)} style={{ background: '#fef2f2', color: '#b42318', border: 'none', borderRadius: 8, padding: '7px', cursor: 'pointer' }}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={addRecord} style={{ background: '#fff', color: INK, border: '1px solid #d8dbe6', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>+ Add record</button>
              <button onClick={saveDns} disabled={saving} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save DNS records'}</button>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 4px' }}>📧 Email setup (MX records)</h4>
              <p style={{ color: MUTE, fontSize: 13, marginTop: 0 }}>Add mail records in one click, then Save.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={addGoogleEmail} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Set up Google Workspace email</button>
                <button onClick={addCustomMx} style={{ background: '#fff', color: INK, border: '1px solid #d8dbe6', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>+ Custom mail server</button>
              </div>
              <p style={{ color: MUTE, fontSize: 12, marginTop: 8 }}>
                This adds Google's single MX record (works for current Workspace accounts). Older accounts that need the legacy 5-record set can{' '}
                <button onClick={addGoogleEmailLegacy} style={{ background: 'none', border: 'none', color: TEAL, cursor: 'pointer', padding: 0, fontSize: 12, textDecoration: 'underline' }}>use the 5-record set instead</button>.
              </p>
            </div>
          </div>
        ) : tab === 'nameservers' ? (
          <div>
            <p style={{ color: MUTE, fontSize: 13 }}>Current nameservers:</p>
            <ul style={{ fontSize: 14 }}>{ns.length ? ns.map((n, i) => <li key={i}><code>{n}</code></li>) : <li>Using Namecheap default</li>}</ul>

            <div style={{ background: '#f6f8f7', borderRadius: 10, padding: 16, marginTop: 16 }}>
              <h4 style={{ marginTop: 0 }}>Use custom nameservers</h4>
              {customNs.map((n, i) => (
                <input key={i} style={{ ...inp, width: '100%', marginBottom: 8 }} value={n} onChange={e => { const c = [...customNs]; c[i] = e.target.value; setCustomNs(c); }} placeholder={`ns${i + 1}.example.com`} />
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setCustomNs([...customNs, ''])} style={{ background: '#fff', border: '1px solid #d8dbe6', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>+ Add</button>
                <button onClick={saveCustomNs} disabled={saving} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontWeight: 700, cursor: 'pointer' }}>Set custom nameservers</button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <button onClick={useDefaultNs} disabled={saving} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '8px 18px', fontWeight: 700, cursor: 'pointer' }}>
                Reset to Namecheap default nameservers
              </button>
              <p style={{ color: MUTE, fontSize: 12, marginTop: 6 }}>If you don't change nameservers, your domain stays on Namecheap's default DNS automatically.</p>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eee' }}>
              <h4 style={{ margin: '0 0 6px' }}>Transfer this domain away</h4>
              <p style={{ color: MUTE, fontSize: 12, marginTop: 0 }}>Moving to another registrar? We'll email you the steps and send your EPP/auth code on request.</p>
              <button onClick={requestTransferOut} disabled={saving} style={{ background: '#fff', color: '#b45309', border: '1px solid #f5c97f', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>
                Request transfer-out instructions
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h4 style={{ marginTop: 0 }}>Registrant contact & verification</h4>
            <p style={{ color: MUTE, fontSize: 13 }}>ICANN requires valid, verified registrant contact details. Keep these accurate to avoid your domain being suspended.</p>

            {verif && (
              <div style={{ background: verif.emailVerified ? '#dcfce7' : '#fffbeb', border: '1px solid ' + (verif.emailVerified ? '#bbf7d0' : '#fde68a'), borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <strong style={{ color: verif.emailVerified ? '#166534' : '#92600a' }}>
                  {verif.emailVerified === true ? '✓ Registrant email verified' : verif.emailVerified === false ? '⚠️ Registrant email NOT verified' : 'Verification status unknown'}
                </strong>
                {verif.emailVerified === false && (
                  <div style={{ marginTop: 8 }}>
                    <button onClick={resendVerification} disabled={saving} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, cursor: 'pointer' }}>
                      {saving ? '…' : 'Resend verification email'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {contact ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['address', 'Address'], ['city', 'City'], ['state', 'State/Province'], ['zip', 'Postal code'], ['country', 'Country (2-letter)']].map(([k, label]) => (
                  <div key={k}>
                    <label style={{ fontSize: 12, color: MUTE }}>{label}</label>
                    <input style={{ ...inp, width: '100%' }} value={contact[k] || ''} onChange={e => setContact({ ...contact, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
            ) : <p>Loading contact details…</p>}
            <button onClick={saveContacts} disabled={saving} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', marginTop: 14 }}>
              {saving ? 'Saving…' : 'Save contact details'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const CustomerSubscriptions = () => {
  const [data, setData] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [subRes, domRes] = await Promise.all([
          axios.get(`${API_URL}/customer/my-subscriptions`).catch((e) => ({ error: e })),
          axios.get(`${API_URL}/customer/my-domains`).catch(() => ({ data: { domains: [] } })),
        ]);
        if (subRes.error) {
          const raw = subRes.error?.response?.data?.error || '';
          // Hide confusing raw Google errors (e.g. "transfer token does not exist") — show a friendly message.
          if (/transfer token|does not exist|not found|no customer/i.test(raw)) setError('');
          else setError(raw || '');
        }
        else setData(subRes.data);
        setDomains(domRes.data?.domains || []);
      } catch (e) { setError(e?.response?.data?.error || 'Could not load your subscriptions.'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="loading">Loading your subscriptions…</div>;

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString() : '—';
  const fmtD = (d) => d ? new Date(d).toLocaleDateString() : '—';
  const hasSubs = data?.subscriptions && data.subscriptions.length > 0;
  const hasDomains = domains.length > 0;

  return (
    <div className="section">
      <h2>📊 My Subscriptions</h2>
      {error && <div style={{ background: '#fff7ed', color: '#9a3412', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

      {/* Google Workspace subscriptions */}
      <h3 style={{ marginTop: 8 }}>Google Workspace</h3>
      {data?.domain && <p style={{ color: '#5b6075', marginTop: 0 }}>Domain: <strong>{data.domain}</strong>{data.account ? ` · ${data.account.toUpperCase()} account` : ''}</p>}
      {!hasSubs ? (
        <div style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 18, marginBottom: 24 }}>
          <p style={{ margin: 0 }}>{data?.note || "No Workspace subscription yet."} Use <strong>New subscription</strong> to get started or <strong>Import Workspace</strong> to transfer an existing one.</p>
        </div>
      ) : (
        <table className="data-table" style={{ marginBottom: 24 }}>
          <thead><tr><th>Product</th><th>Plan</th><th>Seats</th><th>Status</th><th>Started</th><th>Renews</th></tr></thead>
          <tbody>
            {data.subscriptions.map((s, i) => (
              <tr key={i}>
                <td>{s.skuName}</td>
                <td>{s.planName || '—'}</td>
                <td>{s.seats ?? '—'}</td>
                <td><span className={`status ${(s.status || '').toLowerCase()}`}>{s.status}</span></td>
                <td>{fmtDate(s.creationTime)}</td>
                <td>{fmtDate(s.renewalDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Purchased domains */}
      <h3>Domains</h3>
      {!hasDomains ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 12, padding: 18 }}>
          <p style={{ margin: 0 }}>No domains yet. Browse the <strong>Domains</strong> tab to register one.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Domain</th><th>Order #</th><th>Status</th><th>Registered</th><th>Renews</th></tr></thead>
          <tbody>
            {domains.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.domainName}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.orderNumber || '—'}</td>
                <td><span className={`status ${(d.status || '').toLowerCase()}`}>{d.status === 'registered' ? 'Active' : d.status === 'test_paid' ? 'Test' : d.status === 'failed' ? 'Failed' : d.status}</span>{d.status === 'failed' && d.error && <div style={{ fontSize: 12, color: '#b42318' }}>{d.error}</div>}</td>
                <td>{fmtD(d.registeredAt || d.createdAt)}</td>
                <td>{fmtD(d.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Customer: Google Voice info + guidance (number assignment happens in their Admin console)
// ==================== CUSTOMER: SSL ====================
const CustomerSsl = () => {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState('');
  const [years, setYears] = useState(1);
  const [forDomain, setForDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, o] = await Promise.all([
        axios.get(`${API_URL}/customer/nc/ssl`).catch(() => ({ data: { products: [] } })),
        axios.get(`${API_URL}/customer/nc/ssl/orders`).catch(() => ({ data: { orders: [] } })),
      ]);
      setProducts(p.data.products || []);
      if (p.data.products?.length && !sel) setSel(p.data.products[0].name);
      setOrders(o.data.orders || []);
    } catch (_) { }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const buy = async (method) => {
    if (!sel) { setMsg('Choose an SSL product.'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/nc/ssl/buy`, { productType: sel, years, forDomain: forDomain.trim(), method });
      if (res.data.checkoutUrl) window.location.href = res.data.checkoutUrl;
      else setMsg('Could not start checkout.');
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not start purchase.'); }
    finally { setBusy(false); }
  };

  const card = { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
  if (loading) return <div style={card}>Loading SSL products…</div>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>SSL certificates</h1>
      <p style={{ color: MUTE, marginTop: 0 }}>Secure your website with HTTPS. After purchase, we'll help you activate the certificate on your domain.</p>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Buy a certificate</h3>
        {products.length === 0 ? (
          <p style={{ color: MUTE }}>SSL products aren't available right now. Please check back later or contact support.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: MUTE }}>Product</label>
                <select value={sel} onChange={e => setSel(e.target.value)} style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px' }}>
                  {products.map(p => <option key={p.name} value={p.name}>{p.name} — ${Number(p.price).toFixed(2)}/yr</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: MUTE }}>Years</label>
                <select value={years} onChange={e => setYears(Number(e.target.value))} style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px' }}>
                  {[1, 2].map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: MUTE }}>For domain (optional)</label>
                <input value={forDomain} onChange={e => setForDomain(e.target.value)} placeholder="example.com" style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => buy('stripe')} disabled={busy} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '💳 Buy by card'}</button>
              <button onClick={() => buy('nicky')} disabled={busy} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '🪙 Buy with crypto'}</button>
            </div>
            {msg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: msg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: msg.startsWith('✓') ? '#166534' : '#b42318' }}>{msg}</div>}
          </>
        )}
      </div>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>My SSL orders</h3>
        {orders.length === 0 ? <p style={{ color: MUTE }}>No SSL orders yet.</p> : (
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: MUTE }}><th style={{ padding: '6px 0' }}>Product</th><th>Domain</th><th>Status</th><th>Note</th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{o.productType}</td>
                  <td>{o.forDomain || '—'}</td>
                  <td><span style={{ color: (o.status === 'active' || o.status === 'purchased') ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>
                    {o.status === 'purchased' ? 'Purchased' : o.status === 'active' ? '✓ Active' : o.status === 'failed' ? 'Failed' : o.status === 'pending' ? 'Processing' : o.status}
                  </span></td>
                  <td style={{ color: MUTE, fontSize: 13 }}>{o.activationNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ==================== CUSTOMER: ADD-ONS ====================
const CustomerAddons = () => {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [domains, setDomains] = useState(null); // null = not loaded; [] = none
  const [picking, setPicking] = useState(null); // the addon being purchased
  const [chosenDomain, setChosenDomain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await axios.get(`${API_URL}/customer/addons`); setAddons(r.data.addons || []); }
      catch (_) { }
      finally { setLoading(false); }
    })();
  }, []);

  // When the customer clicks Buy, load their eligible Workspace domains and open the picker.
  const startPurchase = async (a) => {
    setMsg('');
    if (!a.purchasable) { setMsg(`"${a.name}" isn't available for self-service purchase yet. Please contact support.`); return; }
    setPicking(a); setChosenDomain('');
    try {
      const r = await axios.get(`${API_URL}/customer/addon-domains`);
      const list = r.data.domains || [];
      setDomains(list);
      if (list.length === 1) setChosenDomain(list[0].domain);
    } catch (e) { setDomains([]); }
  };

  const checkout = async (method) => {
    if (!chosenDomain) { setMsg('Please choose a domain.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await axios.post(`${API_URL}/customer/addons/purchase`, { skuId: picking.skuId, domain: chosenDomain, method });
      if (r.data.checkoutUrl) window.location.href = r.data.checkoutUrl;
      else setMsg('Could not start checkout.');
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not start purchase.'); }
    finally { setBusy(false); }
  };

  const TEAL = '#0F766E';
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🧩 Add-ons</h2>
      <p style={{ color: '#6b7280' }}>Enhance your Google Workspace with add-ons like Gemini AI, AppSheet, Cloud Identity, and more. Add-ons attach to a domain that already has an active Workspace plan.</p>

      {msg && <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a' }}>{msg}</div>}

      {loading ? <p>Loading add-ons…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }} className="grid-2">
          {addons.map(a => (
            <div key={a.skuId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{a.name}</h3>
              <div style={{ color: a.purchasable ? TEAL : '#9ca3af', fontWeight: 700, fontSize: 18 }}>
                {a.purchasable ? `$${a.price}/user/mo` : 'Contact support'}
              </div>
              <button className="btn btn-primary" style={{ marginTop: 'auto', opacity: a.purchasable ? 1 : 0.6 }} onClick={() => startPurchase(a)}>
                {a.purchasable ? 'Buy' : 'Contact support'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Domain selection modal */}
      {picking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }} onClick={() => !busy && setPicking(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add {picking.name}</h3>
            {domains === null ? (
              <p style={{ color: '#6b7280' }}>Checking your Workspace domains…</p>
            ) : domains.length === 0 ? (
              <div>
                <div style={{ background: '#fef2f2', color: '#b42318', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  Please purchase a Google Workspace plan first. Add-ons require an active Workspace subscription — they don't work on their own.
                </div>
                <button className="btn btn-secondary" onClick={() => setPicking(null)}>Close</button>
              </div>
            ) : (
              <>
                <p style={{ color: '#6b7280', marginTop: 0 }}>Choose the Workspace domain to add this to. It will be billed on that domain's account.</p>
                <select value={chosenDomain} onChange={e => setChosenDomain(e.target.value)} style={{ width: '100%', height: 46, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px', marginBottom: 8 }}>
                  <option value="">Select a domain…</option>
                  {domains.map(d => <option key={d.domain} value={d.domain}>{d.domain} ({d.account.toUpperCase()})</option>)}
                </select>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', margin: '10px 0', fontSize: 14 }}>
                  {picking.name} — <strong style={{ color: TEAL }}>${picking.price}/user/mo</strong> <span style={{ color: '#6b7280' }}>+ tax</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => checkout('stripe')} disabled={busy || !chosenDomain} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '💳 Pay by card'}</button>
                  <button onClick={() => checkout('nicky')} disabled={busy || !chosenDomain} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '🪙 Crypto'}</button>
                  <button onClick={() => setPicking(null)} disabled={busy} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const CustomerVoice = () => {
  const { user } = useAuth();
  return (
    <div className="section">
      <h2>📞 Google Voice</h2>
      <div style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <p style={{ marginTop: 0 }}>
          Google Voice adds business phone numbers to your Workspace. Voice is available in supported countries
          (US, Canada, UK, and parts of Europe). One Voice subscription per account.
        </p>
        <p style={{ marginBottom: 0, color: '#5b6075' }}>
          To request Voice for your domain, please open a support ticket and our team will provision it for you.
        </p>
      </div>

      <div style={{ background: '#fffbea', border: '1px solid #fde68a', borderRadius: 12, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>📋 After Voice is active: assign your phone numbers</h3>
        <p>Once your Voice subscription is active, phone numbers are assigned in <strong>your own Google Admin console</strong> (this step is required by Google and can't be done from this portal):</p>
        <ol style={{ lineHeight: 1.8 }}>
          <li>Go to your Google Admin console</li>
          <li>Open <strong>Apps → Google Workspace → Google Voice</strong></li>
          <li>Add a <strong>Voice location</strong> (service address — required for emergency calling)</li>
          <li>Assign a <strong>Voice license</strong> to each user</li>
          <li>Assign or request a <strong>phone number</strong> for each user</li>
        </ol>
        <a href="https://admin.google.com/ac/apps/voice" target="_blank" rel="noreferrer"
          className="btn btn-primary" style={{ display: 'inline-block', marginTop: 8, textDecoration: 'none' }}>
          Open Google Admin console →
        </a>
        <p style={{ marginBottom: 0, marginTop: 12, fontSize: 13, color: '#92600a' }}>
          Need help? <a href="https://knowledge.workspace.google.com/admin/voice/assign-voice-numbers-to-users" target="_blank" rel="noreferrer">Google's guide to assigning numbers</a>.
        </p>
      </div>
    </div>
  );
};

// Customer: support tickets
const CustomerSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ subject: '', message: '', priority: 'normal' });
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');

  const load = async () => {
    setLoading(true);
    try { const res = await axios.get(`${API_URL}/customer/tickets`); setTickets(res.data.tickets || []); }
    catch (_) { } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.subject || !form.message) { setMsg('Please enter a subject and message.'); return; }
    try {
      await axios.post(`${API_URL}/customer/tickets`, form);
      setForm({ subject: '', message: '', priority: 'normal' }); setMsg('✓ Ticket submitted.');
      load();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not submit ticket.'); }
  };

  const sendReply = async (id) => {
    if (!reply) return;
    try { await axios.post(`${API_URL}/customer/tickets/${id}/reply`, { message: reply }); setReply(''); load(); }
    catch (_) { }
  };

  return (
    <div className="section">
      <h2>🎫 Support</h2>

      <div style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Open a new ticket</h3>
        <input placeholder="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 10 }} />
        <textarea placeholder="Describe your issue…" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
          style={{ width: '100%', minHeight: 90, borderRadius: 8, border: '1px solid #d8dbe6', padding: 10, marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
            style={{ height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px' }}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </select>
          <button className="btn btn-primary" onClick={submit}>Submit ticket</button>
          {msg && <span style={{ fontSize: 14, color: msg.startsWith('✓') ? '#166534' : '#b42318' }}>{msg}</span>}
        </div>
      </div>

      <h3>My tickets</h3>
      {loading ? <p>Loading…</p> : tickets.length === 0 ? <p>No tickets yet.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map(t => (
            <div key={t._id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{t.subject}</strong>
                <span className={`status ${t.status}`}>{t.status.replace('_', ' ')}</span>
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 8 }}
                onClick={() => setOpenId(openId === t._id ? null : t._id)}>
                {openId === t._id ? 'Hide' : 'View conversation'}
              </button>
              {openId === t._id && (
                <div style={{ marginTop: 12 }}>
                  {t.messages.map((m, i) => (
                    <div key={i} style={{
                      marginBottom: 8, padding: '8px 12px', borderRadius: 8,
                      background: m.fromRole === 'admin' ? '#eef2ff' : '#f3f4f6'
                    }}>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
                        {m.fromRole === 'admin' ? 'Support' : 'You'} • {new Date(m.createdAt).toLocaleString()}
                      </div>
                      <div>{m.body}</div>
                    </div>
                  ))}
                  {t.status !== 'closed' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input placeholder="Type a reply…" value={reply} onChange={e => setReply(e.target.value)}
                        style={{ flex: 1, height: 38, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px' }} />
                      <button className="btn btn-primary" onClick={() => sendReply(t._id)}>Reply</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Customer: account settings (username/email, password)
const CustomerSettings = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState({ username: user?.username || '', businessEmail: user?.businessEmail || '' });
  const [pMsg, setPMsg] = useState('');
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });
  const [pwdMsg, setPwdMsg] = useState('');

  const saveProfile = async () => {
    setPMsg('');
    try { await axios.patch(`${API_URL}/customer/profile`, profile); setPMsg('✓ Saved.'); }
    catch (e) { setPMsg(e?.response?.data?.error || 'Could not save.'); }
  };
  const changePwd = async () => {
    setPwdMsg('');
    try { const r = await axios.post(`${API_URL}/customer/change-password`, pwd); setPwdMsg('✓ ' + (r.data.message || 'Password changed.')); setPwd({ currentPassword: '', newPassword: '' }); }
    catch (e) { setPwdMsg(e?.response?.data?.error || 'Could not change password.'); }
  };

  return (
    <div className="section">
      <h2>⚙ Account Settings</h2>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Username</label>
        <input value={profile.username} onChange={e => setProfile({ ...profile, username: e.target.value })}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Email</label>
        <input value={profile.businessEmail} onChange={e => setProfile({ ...profile, businessEmail: e.target.value })}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 12 }} />
        <button className="btn btn-primary" onClick={saveProfile}>Save profile</button>
        {pMsg && <span style={{ marginLeft: 10, fontSize: 14, color: pMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{pMsg}</span>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Change password</h3>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Current password</label>
        <input type="password" value={pwd.currentPassword} onChange={e => setPwd({ ...pwd, currentPassword: e.target.value })}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 12 }} />
        <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>New password</label>
        <input type="password" value={pwd.newPassword} onChange={e => setPwd({ ...pwd, newPassword: e.target.value })}
          style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 10px', marginBottom: 12 }} />
        <button className="btn btn-primary" onClick={changePwd}>Change password</button>
        {pwdMsg && <span style={{ marginLeft: 10, fontSize: 14, color: pwdMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{pwdMsg}</span>}
      </div>
    </div>
  );
};


// ==================== PUBLIC LANDING PAGE ====================
const LandingPage = () => {
  const brand = useBranding();
  const [plans, setPlans] = useState([]);
  const [dq, setDq] = useState('');
  const [dResult, setDResult] = useState(null);
  const [dLoading, setDLoading] = useState(false);
  const [dError, setDError] = useState('');
  useEffect(() => {
    (async () => {
      try { const res = await axios.get(`${API_URL}/products`); setPlans(res.data.workspace || []); } catch (_) { }
    })();
  }, []);

  const T = '#0F766E', TD = '#115E56', INKL = '#1f2937', MUTEL = '#6b7280';
  const go = (p) => { window.location.href = p; };

  const searchDomain = async () => {
    setDError(''); setDResult(null);
    const dom = dq.toLowerCase().trim();
    if (!dom) { setDError('Enter a name or domain to search.'); return; }
    if (dom.includes('.') && !/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setDError('Enter a valid domain like yourbusiness.com, or just a name.'); return; }
    setDLoading(true);
    try {
      const res = await axios.post(`${API_URL}/public/domains/search`, { domainName: dom });
      setDResult(res.data);
    } catch (e) { setDError(e?.response?.data?.error || 'Search failed.'); }
    finally { setDLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#ffffff 0%,#f0f7f5 60%,#eef4fb 100%)', fontFamily: 'Inter, system-ui, sans-serif', color: INKL }}>
      {/* Nav */}
      <header className="landing-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {brand.logoDataUrl
            ? <img src={brand.logoDataUrl} alt={brand.brandName} style={{ maxHeight: 44, maxWidth: 200 }} />
            : <>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{(brand.brandName || 'G')[0]}</div>
              <strong style={{ fontSize: 22, color: T }}>{brand.brandName || 'GNB MENTOR LLC'}</strong>
            </>}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => go('/login')} style={{ background: 'transparent', border: 'none', color: INKL, fontSize: 16, cursor: 'pointer', padding: '10px 16px' }}>↪ Login</button>
          <button onClick={() => go('/register')} style={{ background: T, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>+ Sign Up</button>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero" style={{ display: 'flex', gap: 40, padding: '40px 40px 60px', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 999, padding: '8px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 24 }}>
            <span style={{ display: 'flex', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#3b82f6' }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#ef4444' }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#f59e0b' }} />
              <span style={{ width: 8, height: 8, borderRadius: 99, background: '#22c55e' }} />
            </span>
            <strong style={{ fontSize: 14 }}>Business email & apps in one place</strong>
          </div>
          <h1 className="hero-title" style={{ fontSize: 56, lineHeight: 1.05, margin: '0 0 20px', fontWeight: 800 }}>
            Get <span style={{ color: T }}>professional email</span> for your team
          </h1>
          <p style={{ fontSize: 18, color: MUTEL, lineHeight: 1.6, margin: '0 0 28px', maxWidth: 520 }}>
            The same Gmail, Calendar, Drive, and Meet experience you know — set up for your company domain. Choose how many mailboxes you need, pay online, and follow simple steps to go live.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            <div style={tag(T)}><span style={{ fontWeight: 700 }}>G</span> Search & Workspace</div>
            <div style={tag(T)}>📞 Voice & calling</div>
            <div style={tag(T)}>📧 Gmail, Meet & Drive</div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button onClick={() => go('/register')} style={{ background: T, color: '#fff', border: 'none', borderRadius: 12, padding: '16px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>See plans & prices ↓</button>
            <button onClick={() => go('/register')} style={{ background: '#fff', color: INKL, border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 28px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>Create a free account</button>
          </div>
        </div>

        {/* What you get card */}
        <div className="landing-card" style={{ flex: '0 0 440px', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 22 }}>What you get</h3>
          <p style={{ color: MUTEL, margin: '0 0 24px' }}>Popular apps for work — explained in plain English.</p>
          {[
            ['📧', 'Gmail', 'on your own domain — like you@yourbusiness.com'],
            ['🎥', 'Google Meet', 'for video meetings with teammates and clients'],
            ['📁', 'Drive', 'to store and share files, plus Calendar to stay organized'],
          ].map(([ic, t, d], i) => (
            <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{ic}</div>
              <div><strong>{t}</strong> <span style={{ color: MUTEL }}>{d}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* Business email + domain search */}
      <section className="landing-band" style={{ background: '#fff', padding: '64px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, margin: '0 0 14px', fontWeight: 800 }}>Get a professional business email</h2>
          <p style={{ fontSize: 18, color: MUTEL, lineHeight: 1.6, margin: '0 0 28px' }}>
            Create a custom email address connected to your domain to build instant trust and look credible from the get go.
          </p>
          <p style={{ fontWeight: 600, margin: '0 0 14px' }}>Start by finding the right domain — type a name or a full domain</p>
          <div className="domain-search-row" style={{ display: 'flex', gap: 10, maxWidth: 560, margin: '0 auto' }}>
            <input
              value={dq}
              onChange={e => setDq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchDomain(); }}
              placeholder="mybusiness  or  mybusiness.com"
              style={{ flex: 1, height: 52, borderRadius: 12, border: '1px solid #d8dbe6', padding: '0 16px', fontSize: 16 }}
            />
            <button onClick={searchDomain} disabled={dLoading}
              style={{ background: T, color: '#fff', border: 'none', borderRadius: 12, padding: '0 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              {dLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {dError && <div style={{ color: '#b42318', marginTop: 12 }}>{dError}</div>}
          {dResult && dResult.results && (
            <div style={{ marginTop: 20, maxWidth: 560, margin: '20px auto 0' }}>
              {dResult.results.map((r, i) => (
                <div key={i} style={{ background: r.available ? '#f0f7f5' : '#fafafa', borderRadius: 12, padding: '14px 18px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, opacity: r.available ? 1 : 0.65 }}>
                  <div style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{r.domain}</span>
                    {r.isPremium && <span style={{ marginLeft: 8, fontSize: 11, background: '#fde68a', color: '#92600a', padding: '2px 8px', borderRadius: 999 }}>Premium</span>}
                    <div style={{ color: r.available ? '#166534' : '#b45309', fontWeight: 600, fontSize: 13 }}>{r.available ? '✓ Available' : '✗ Taken'}</div>
                  </div>
                  {r.available && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <strong style={{ fontSize: 18, color: T }}>{r.price != null ? `$${Number(r.price).toFixed(2)}/yr` : ''}</strong>
                      <button onClick={() => go('/register')}
                        style={{ background: T, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
                        Get started
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Plans */}
      <section style={{ padding: '20px 40px 80px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, textAlign: 'center', margin: '0 0 8px' }}>Plans & prices</h2>
        <p style={{ textAlign: 'center', color: MUTEL, margin: '0 0 40px' }}>Pick the Workspace plan that fits your team.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 24 }}>
          {plans.length === 0 ? (
            <p style={{ textAlign: 'center', color: MUTEL, gridColumn: '1/-1' }}>Loading plans…</p>
          ) : plans.map((p) => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 20, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #eef2f1' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>{p.name}</h3>
              <div style={{ fontSize: 36, fontWeight: 800, color: T }}>${p.monthlyPrice}<span style={{ fontSize: 15, color: MUTEL, fontWeight: 400 }}>/user/mo</span></div>
              {p.features && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 24px', color: MUTEL }}>
                  {p.features.slice(0, 5).map((f, i) => <li key={i} style={{ padding: '4px 0' }}>✓ {f}</li>)}
                </ul>
              )}
              <button onClick={() => go('/register')} style={{ width: '100%', background: T, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Get started</button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="landing-band" style={{ background: T, color: '#fff', padding: '64px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 44, margin: '0 0 12px', fontWeight: 800 }}>Ready when you are</h2>
        <p style={{ fontSize: 18, opacity: 0.95, margin: '0 0 32px' }}>Sign up to save your orders, or browse plans first — whatever is easier for you.</p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => go('/register')} style={{ background: '#fff', color: T, border: 'none', borderRadius: 12, padding: '16px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Compare plans</button>
          <button onClick={() => go('/login')} style={{ background: 'transparent', color: '#fff', border: '2px solid rgba(255,255,255,0.7)', borderRadius: 12, padding: '16px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Sign in</button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#10241f', color: '#cbd5d1', padding: '48px 40px 32px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {brand.logoDataUrl
                ? <img src={brand.logoDataUrl} alt={brand.brandName} style={{ maxHeight: 40, maxWidth: 180, background: '#fff', padding: 6, borderRadius: 8 }} />
                : <>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: T, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{(brand.brandName || 'G')[0]}</div>
                  <strong style={{ color: '#fff', fontSize: 18 }}>{brand.brandName || 'GNB MENTOR LLC'}</strong>
                </>}
            </div>
            <p style={{ maxWidth: 320, lineHeight: 1.6, color: '#9fb4ae' }}>
              Google Workspace for your domain — simple ordering, secure payment, and support while you get set up.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: '#7e948e', fontWeight: 700, marginBottom: 14 }}>EXPLORE</div>
            {[['Plans & pricing', '/register'], ['Why choose us', '/'], ['Create account', '/register'], ['Sign in', '/login']].map(([t, h]) => (
              <div key={t} style={{ marginBottom: 12 }}>
                <a href={h} style={{ color: '#cbd5d1', textDecoration: 'none' }}>{t}</a>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1, color: '#7e948e', fontWeight: 700, marginBottom: 14 }}>ACCOUNT</div>
            <div style={{ marginBottom: 12 }}><a href="/login" style={{ color: '#cbd5d1', textDecoration: 'none' }}>Customer portal</a></div>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '32px auto 0', paddingTop: 24, borderTop: '1px solid #1e3a33', color: '#7e948e', fontSize: 14 }}>
          © {new Date().getFullYear()} GNB MENTOR LLC · Google Workspace Reseller
        </div>
      </footer>
    </div>
  );
};

function tag(T) {
  return { display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #eef2f1', borderRadius: 14, padding: '12px 18px', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' };
}


// ==================== MAIN APP ====================
function App() {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const isAuthPath = path.startsWith('/login') || path.startsWith('/register') || isAdminPath;

  if (!token) {
    // Logged-out: show the public landing page on the main URL,
    // and the login form on /login, /register, or /admin.
    if (isAuthPath) {
      return <LoginPage adminMode={isAdminPath} startTab={path.startsWith('/register') ? 'register' : 'login'} />;
    }
    return <LandingPage />;
  }

  const role = user?.role || 'customer';

  // Admin portal lives at /admin and requires admin role
  if (isAdminPath) {
    if (role === 'admin') return <Dashboard />;
    // Non-admins can't access /admin
    return (
      <div className="loading" style={{ padding: 40, textAlign: 'center' }}>
        This area is for administrators only.{' '}
        <a href="/" style={{ color: '#2563eb' }}>Go to your portal</a>
      </div>
    );
  }

  // Main URL: admins see admin dashboard; customers see the customer portal
  return role === 'admin' ? <Dashboard /> : <CustomerPortal />;
}

// ==================== STAGE 1: WORKSPACE ORDER FLOW ====================
const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
  ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
  ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
  ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
  ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
  ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
];

function WorkspaceOrderFlow() {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState(null);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [seats, setSeats] = useState(1);
  const [planType, setPlanType] = useState('flexible');
  const [orderOpts, setOrderOpts] = useState({ flexibleEnabled: true, annualEnabled: false });
  const [form, setForm] = useState({
    organizationName: '', domain: '', desiredAdminUsername: '', tempPassword: '',
    country: 'United States', streetAddress: '', streetAddress2: '', city: '', state: '', zip: '',
    firstName: '', lastName: '', email: '', alternateEmail: '', phone: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [orderDone, setOrderDone] = useState(null);
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState('');
  const [provisionSuccess, setProvisionSuccess] = useState(false);
  const [loginInfo, setLoginInfo] = useState(null);
  const [domainStatus, setDomainStatus] = useState({ state: 'idle', message: '' }); // idle|checking|available|taken|invalid
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const streetInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/products`);
        setPlans(res.data.workspace || []);
        if (res.data.workspace && res.data.workspace.length) {
          setSelectedPlanId(res.data.workspace[0].id);
        }
      } catch (e) {
        setPlansError('Could not load plans. Please try again shortly.');
      }
      // Which payment plans does the admin allow?
      try {
        const opt = await axios.get(`${API_URL}/order-options`);
        if (opt.data) {
          setOrderOpts(opt.data);
          // Default to flexible if allowed, else annual.
          if (!opt.data.flexibleEnabled && opt.data.annualEnabled) setPlanType('annual');
        }
      } catch (_) { }
      // Load any saved draft so the customer can resume an interrupted order.
      try {
        const dr = await axios.get(`${API_URL}/workspace-orders/draft`);
        if (dr.data.draft && dr.data.draft.draftData) {
          const d = dr.data.draft.draftData;
          if (d.form) setForm((prev) => ({ ...prev, ...d.form }));
          if (d.selectedPlanId) setSelectedPlanId(d.selectedPlanId);
          if (d.seats) setSeats(d.seats);
          if (d.planType) setPlanType(d.planType);
          if (d.step) setStep(d.step);
          setDraftLoaded(true);
        }
      } catch (_) { }
    })();
  }, []);

  // Autosave the in-progress order as a draft (debounced) so it survives reload/disconnect.
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    // Don't autosave until plans are loaded and we're past the first render.
    if (!plans) return;
    const t = setTimeout(() => {
      axios.post(`${API_URL}/workspace-orders/draft`, {
        draftData: { form, selectedPlanId, seats, step, planType },
        draftStep: step,
      }).catch(() => { });
    }, 1200);
    return () => clearTimeout(t);
  }, [form, selectedPlanId, seats, step, plans]);

  // Load the Google Maps JavaScript API (with Places) once
  useEffect(() => {
    if (!MAPS_KEY) return;
    if (window.google && window.google.maps && window.google.maps.places) {
      setMapsReady(true);
      return;
    }
    const existing = document.getElementById('gmaps-places-script');
    if (existing) {
      existing.addEventListener('load', () => setMapsReady(true));
      return;
    }
    const script = document.createElement('script');
    script.id = 'gmaps-places-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places&loading=async&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapsReady(true);
    document.body.appendChild(script);
  }, []);

  // Mount the NEW PlaceAutocompleteElement when on step 2 and maps is ready
  useEffect(() => {
    if (step !== 2 || !mapsReady || !streetInputRef.current) return;
    if (autocompleteRef.current) return; // already mounted
    let cancelled = false;

    (async () => {
      try {
        const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');
        if (cancelled) return;

        const el = new PlaceAutocompleteElement({
          componentRestrictions: { country: ALLOWED_COUNTRIES },
        });
        el.style.width = '100%';
        autocompleteRef.current = el;

        // Mount it into our container
        const container = streetInputRef.current;
        container.innerHTML = '';
        container.appendChild(el);

        el.addEventListener('gmp-select', async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({
              fields: ['addressComponents', 'formattedAddress'],
            });
            const comps = place.addressComponents || [];
            const get = (type) =>
              comps.find((c) => (c.types || []).includes(type));
            const streetNumber = get('street_number')?.longText || '';
            const route = get('route')?.longText || '';
            const city =
              get('locality')?.longText ||
              get('sublocality')?.longText ||
              get('postal_town')?.longText || '';
            const stateShort = get('administrative_area_level_1')?.shortText || '';
            const zip = get('postal_code')?.longText || '';
            const street = `${streetNumber} ${route}`.trim();
            setForm((f) => ({
              ...f,
              streetAddress: street || f.streetAddress,
              city,
              state: stateShort,
              zip,
            }));
          } catch (err) {
            console.error('Place select error:', err);
          }
        });
      } catch (err) {
        console.error('Autocomplete init error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [step, mapsReady]);

  // Debounced domain availability check
  useEffect(() => {
    const domain = (form.domain || '').toLowerCase().trim();
    if (!domain) { setDomainStatus({ state: 'idle', message: '' }); return; }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      setDomainStatus({ state: 'invalid', message: 'Enter a valid domain (e.g. example.com).' });
      return;
    }
    setDomainStatus({ state: 'checking', message: 'Checking availability…' });
    const t = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/workspace-orders/check-domain/${encodeURIComponent(domain)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.data.available) {
          setDomainStatus({ state: 'available', message: res.data.message || 'Domain is available.' });
        } else {
          setDomainStatus({ state: 'taken', message: res.data.message || 'This domain is not available.' });
        }
      } catch (e) {
        setDomainStatus({ state: 'invalid', message: 'Could not check domain. Try again.' });
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form.domain]);

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId);
  const monthlyTotal = selectedPlan ? (selectedPlan.monthlyPrice * seats) : 0;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const canContinueStep1 = selectedPlan && seats >= 1;
  const canSubmit =
    form.organizationName &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.domain) &&
    domainStatus.state === 'available' &&
    form.desiredAdminUsername && form.tempPassword.length >= 8 &&
    form.streetAddress && form.city && form.state && /^\d{5}$/.test(form.zip) &&
    form.firstName && form.lastName &&
    /\S+@\S+\.\S+/.test(form.email) && /\S+@\S+\.\S+/.test(form.alternateEmail);

  const placeOrder = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const token = localStorage.getItem('token');
      const payload = {
        type: 'workspace',
        planType,
        plan: { id: selectedPlan.id, name: selectedPlan.name, monthlyPrice: selectedPlan.monthlyPrice },
        seats: Number(seats), monthlyTotal,
        organization: {
          name: form.organizationName, domain: form.domain.toLowerCase(),
          desiredAdminUsername: form.desiredAdminUsername.toLowerCase(), tempPassword: form.tempPassword,
          country: 'US', streetAddress: form.streetAddress, streetAddress2: form.streetAddress2,
          city: form.city, state: form.state, zip: form.zip,
        },
        contact: {
          firstName: form.firstName, lastName: form.lastName, email: form.email,
          alternateEmail: form.alternateEmail, phone: form.phone,
        },
      };
      const res = await axios.post(`${API_URL}/workspace-orders`, payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setOrderDone(res.data); setStep(4);
      // Fetch the domain verification TXT record for this order
      try {
        const vres = await axios.get(`${API_URL}/workspace-orders/${res.data.id}/verification`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setVerification(vres.data);
      } catch (_) { /* verification fetch is non-blocking */ }
    } catch (e) {
      setSubmitError(e?.response?.data?.error || 'Could not place the order. Please check your details and try again.');
    } finally { setSubmitting(false); }
  };

  const confirmVerify = async () => {
    if (!orderDone?.id) return;
    setVerifying(true); setVerifyMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/workspace-orders/${orderDone.id}/verify`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.data.domainVerified) {
        setVerification((v) => ({ ...(v || {}), verified: true, status: res.data.status }));
        setVerifyMsg('Domain marked as verified. You can now add Google Voice.');
      }
    } catch (e) {
      setVerifyMsg(e?.response?.data?.error || 'Could not mark as verified. Try again.');
    } finally { setVerifying(false); }
  };

  const copyTxt = () => {
    if (verification?.txtRecord && navigator.clipboard) {
      navigator.clipboard.writeText(verification.txtRecord);
      setVerifyMsg('TXT record copied to clipboard.');
    }
  };

  const payNow = async (method) => {
    if (!orderDone?.id) return;
    setProvisioning(true); setProvisionMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/customer/checkout`,
        { orderId: orderDone.id, method },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl; // Stripe or Nicky hosted checkout
      } else {
        setProvisionMsg('Could not start checkout.');
      }
    } catch (e) {
      setProvisionMsg(e?.response?.data?.error || 'Could not start checkout.');
    } finally { setProvisioning(false); }
  };

  const provisionOrder = async () => {
    if (!orderDone?.id) return;
    setProvisioning(true); setProvisionMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/workspace-orders/${orderDone.id}/provision`, {}, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.data.success) {
        setProvisionSuccess(true);
        setProvisionMsg(res.data.alreadyProvisioned
          ? 'Already created in Google.'
          : '✓ Customer, admin user, and subscription created in Google!');
        if (res.data.adminEmail) {
          setLoginInfo({ email: res.data.adminEmail, password: form.tempPassword });
        }
      } else {
        setProvisionMsg('Provisioning returned an unexpected response.');
      }
    } catch (e) {
      const d = e?.response?.data;
      setProvisionMsg((d?.error || 'Provisioning failed.') + (d?.step ? ` (step: ${d.step})` : ''));
    } finally { setProvisioning(false); }
  };

  return (
    <div className="wof-wrap">
      <style>{wofStyles}</style>
      {draftLoaded && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          ✓ We restored your previous order details so you can continue where you left off.
        </div>
      )}
      <header className="wof-head">
        <h2>Set up Google Workspace</h2>
        <p>Choose a plan, tell us about your organization, and place your order.</p>
        <ol className="wof-steps">
          <li className={step >= 1 ? 'on' : ''}>Plan</li>
          <li className={step >= 2 ? 'on' : ''}>Organization</li>
          <li className={step >= 3 ? 'on' : ''}>Review</li>
        </ol>
      </header>

      {step === 1 && (
        <section className="wof-card">
          <h3>Choose your plan</h3>
          {plansError && <div className="wof-alert err">{plansError}</div>}
          {!plans && !plansError && <div className="wof-muted">Loading plans…</div>}
          <div className="wof-plans">
            {plans?.map((p) => (
              <button type="button" key={p.id}
                className={`wof-plan ${selectedPlanId === p.id ? 'sel' : ''}`}
                onClick={() => setSelectedPlanId(p.id)}>
                <div className="wof-plan-name">{p.name}</div>
                <div className="wof-plan-price">${Number(p.monthlyPrice).toFixed(2)}<span>/user/mo</span></div>
                {p.features && (
                  <ul className="wof-plan-feats">
                    {p.features.slice(0, 4).map((f, i) => (<li key={i}>{f}</li>))}
                  </ul>
                )}
              </button>
            ))}
          </div>
          <div className="wof-seats">
            <label>Number of user licenses (seats)</label>
            <div className="wof-stepper">
              <button type="button" onClick={() => setSeats(Math.max(1, seats - 1))}>−</button>
              <input type="number" min="1" value={seats}
                onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value || '1', 10)))} />
              <button type="button" onClick={() => setSeats(seats + 1)}>+</button>
            </div>
          </div>

          {(orderOpts.flexibleEnabled && orderOpts.annualEnabled) && (
            <div style={{ margin: '4px 0 8px' }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Payment plan</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="grid-2">
                {[
                  { v: 'flexible', t: 'Flexible', d: 'Monthly, pay-as-you-go. Cancel or change seats anytime.' },
                  { v: 'annual', t: 'Annual', d: '12-month commitment, paid monthly. Often lower per-seat price.' },
                ].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setPlanType(opt.v)}
                    style={{
                      textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      border: planType === opt.v ? '2px solid #0F766E' : '1px solid #d8dbe6',
                      background: planType === opt.v ? '#f0f7f5' : '#fff'
                    }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{opt.t}{planType === opt.v && ' ✓'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{opt.d}</div>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                {planType === 'annual' ? 'Annual: you commit for 12 months; seats can be added but not reduced until renewal.' : 'Flexible: full flexibility, adjust or cancel anytime.'}
              </p>
            </div>
          )}

          <div className="wof-summary">
            <span>{selectedPlan ? selectedPlan.name : '—'} × {seats}</span>
            <strong>${monthlyTotal.toFixed(2)}/mo</strong>
          </div>
          <div className="wof-actions">
            <button type="button" className="wof-btn primary" disabled={!canContinueStep1} onClick={() => setStep(2)}>Continue</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wof-card">
          <h3>Organization information</h3>
          <div className="wof-grid">
            <div className="wof-field"><label>Organization name *</label>
              <input value={form.organizationName} onChange={set('organizationName')} placeholder="Acme Inc." /></div>
            <div className="wof-field"><label>Domain *</label>
              <input value={form.domain} onChange={set('domain')} placeholder="acme.com" />
              {domainStatus.state !== 'idle' && (
                <small className={`wof-domain-status ${domainStatus.state}`}>
                  {domainStatus.state === 'checking' && '⏳ '}
                  {domainStatus.state === 'available' && '✓ '}
                  {(domainStatus.state === 'taken' || domainStatus.state === 'invalid') && '✕ '}
                  {domainStatus.message}
                </small>
              )}
            </div>
          </div>
          <div className="wof-grid">
            <div className="wof-field"><label>Desired admin username *</label>
              <div className="wof-inline">
                <input value={form.desiredAdminUsername} onChange={set('desiredAdminUsername')} placeholder="admin" />
                <span className="wof-suffix">@{form.domain || 'yourdomain.com'}</span>
              </div>
              <small>This becomes the Workspace administrator login.</small>
            </div>
            <div className="wof-field"><label>Temporary password *</label>
              <input type="password" value={form.tempPassword} onChange={set('tempPassword')} placeholder="At least 8 characters" />
              <small>You'll be prompted to change this on first sign-in.</small>
            </div>
          </div>
          <h3 className="wof-subhead">Business address</h3>
          <div className="wof-field"><label>Country *</label><input value="United States" disabled /></div>
          <div className="wof-field">
            <label>Street address *</label>
            <div ref={streetInputRef} className="wof-autocomplete-mount">
              {!MAPS_KEY && (
                <input value={form.streetAddress} onChange={set('streetAddress')} placeholder="Enter your street address" />
              )}
            </div>
            <small>{MAPS_KEY ? 'Start typing and pick your address from the list.' : 'Address suggestions unavailable — enter manually.'}</small>
            {form.streetAddress && (
              <div className="wof-picked">Selected: {form.streetAddress}</div>
            )}
          </div>
          <div className="wof-field"><label>Street address line 2</label>
            <input value={form.streetAddress2} onChange={set('streetAddress2')} placeholder="Suite 400 (optional)" /></div>
          <div className="wof-grid">
            <div className="wof-field"><label>City *</label>
              <input value={form.city} onChange={set('city')} placeholder="Mountain View" /></div>
            <div className="wof-field"><label>State *</label>
              <select value={form.state} onChange={set('state')}>
                <option value="">Please select</option>
                {US_STATES.map(([abbr, name]) => (<option key={abbr} value={abbr}>{name}</option>))}
              </select>
            </div>
          </div>
          <div className="wof-field" style={{ maxWidth: 220 }}><label>ZIP code *</label>
            <input value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
              placeholder="ZIP" inputMode="numeric" /></div>
          <h3 className="wof-subhead">Contact information</h3>
          <p className="wof-muted">Used to create the initial administrator account.</p>
          <div className="wof-grid">
            <div className="wof-field"><label>First name *</label><input value={form.firstName} onChange={set('firstName')} /></div>
            <div className="wof-field"><label>Last name *</label><input value={form.lastName} onChange={set('lastName')} /></div>
          </div>
          <div className="wof-field"><label>Email *</label>
            <input value={form.email} onChange={set('email')} placeholder="you@example.com" /></div>
          <div className="wof-grid">
            <div className="wof-field"><label>Alternate email * (not on your new domain)</label>
              <input value={form.alternateEmail} onChange={set('alternateEmail')} placeholder="you@gmail.com" /></div>
            <div className="wof-field"><label>Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="+1 555 123 4567" /></div>
          </div>
          <div className="wof-actions">
            <button type="button" className="wof-btn ghost" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="wof-btn primary" disabled={!canSubmit} onClick={() => setStep(3)}>Review order</button>
          </div>
          {!canSubmit && <small className="wof-muted">Complete all required (*) fields to continue.</small>}
        </section>
      )}

      {step === 3 && (
        <section className="wof-card">
          <h3>Review your order</h3>
          <div className="wof-review">
            <div className="wof-review-row"><span>Plan</span><strong>{selectedPlan?.name}</strong></div>
            <div className="wof-review-row"><span>Seats</span><strong>{seats}</strong></div>
            <div className="wof-review-row"><span>Monthly total</span><strong>${monthlyTotal.toFixed(2)}/mo</strong></div>
            <hr />
            <div className="wof-review-row"><span>Organization</span><strong>{form.organizationName}</strong></div>
            <div className="wof-review-row"><span>Domain</span><strong>{form.domain}</strong></div>
            <div className="wof-review-row"><span>Admin</span><strong>{form.desiredAdminUsername}@{form.domain}</strong></div>
            <div className="wof-review-row"><span>Address</span><strong>{form.streetAddress}, {form.city}, {form.state} {form.zip}</strong></div>
            <div className="wof-review-row"><span>Contact</span><strong>{form.firstName} {form.lastName} · {form.email}</strong></div>
          </div>
          <div className="wof-note">
            After you place this order, you'll verify your domain at admin.google.com, then add Google Voice. We'll guide you through it.
          </div>
          {submitError && <div className="wof-alert err">{submitError}</div>}
          <div className="wof-actions">
            <button type="button" className="wof-btn ghost" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="wof-btn primary" disabled={submitting} onClick={placeOrder}>
              {submitting ? 'Placing order…' : 'Place order'}
            </button>
          </div>
        </section>
      )}

      {step === 4 && orderDone && (
        <section className="wof-card">
          <div className="wof-done">
            <div className="wof-check">✓</div>
            <h3>Order placed</h3>
            <p>Your Google Workspace order for <strong>{form.domain}</strong> has been received.</p>
            {orderDone.orderNumber && <p className="wof-muted">Order number: {orderDone.orderNumber}</p>}
          </div>

          <div className="wof-verify">
            <h4>Next — Complete your payment</h4>
            <p className="wof-muted">
              Pay for <strong>{form.domain}</strong> ({form.plan?.name || 'your plan'}, {form.seats} seat{form.seats === 1 ? '' : 's'}).
              As soon as your payment is confirmed, your Google Workspace is set up automatically and we'll show your
              admin sign-in details.
            </p>
            {provisionMsg && <div className="wof-verify-msg">{provisionMsg}</div>}
            <div className="wof-actions" style={{ gap: 12 }}>
              <button type="button" className="wof-btn primary" onClick={() => payNow('stripe')} disabled={provisioning}>
                {provisioning ? 'Starting…' : '💳 Pay by card'}
              </button>
              <button type="button" className="wof-btn" onClick={() => payNow('nicky')} disabled={provisioning}>
                {provisioning ? 'Starting…' : '🪙 Pay with crypto'}
              </button>
            </div>
            <p className="wof-muted" style={{ fontSize: 13, marginTop: 12 }}>
              After payment you'll return here. Your Workspace (admin account + subscription) is created automatically —
              then you'll finish by verifying your domain inside your Google Admin console to activate Gmail.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

const wofStyles = `
.wof-wrap{max-width:760px;margin:0 auto;padding:8px;color:#1a1a2e}
.wof-head h2{margin:0 0 4px}
.wof-head p{margin:0 0 14px;color:#5b6075}
.wof-steps{display:flex;gap:8px;list-style:none;padding:0;margin:0 0 18px;counter-reset:s}
.wof-steps li{flex:1;text-align:center;font-size:13px;color:#9aa0b5;padding:8px 4px;border-radius:8px;background:#f1f2f7;counter-increment:s}
.wof-steps li::before{content:counter(s) ". "}
.wof-steps li.on{background:#2563eb;color:#fff}
.wof-card{background:#fff;border:1px solid #e7e9f0;border-radius:14px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.wof-card h3{margin:0 0 14px}
.wof-subhead{margin-top:22px!important}
.wof-muted{color:#7a809a;font-size:13px}
.wof-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.wof-plan{text-align:left;border:2px solid #e7e9f0;background:#fff;border-radius:12px;padding:14px;cursor:pointer;transition:.15s}
.wof-plan:hover{border-color:#b9c4ef}
.wof-plan.sel{border-color:#2563eb;background:#f5f8ff}
.wof-plan-name{font-weight:600;margin-bottom:6px}
.wof-plan-price{font-size:22px;font-weight:700}
.wof-plan-price span{font-size:12px;font-weight:500;color:#7a809a;margin-left:2px}
.wof-plan-feats{margin:10px 0 0;padding-left:16px;color:#5b6075;font-size:12px}
.wof-seats{margin:20px 0 0}
.wof-seats label{display:block;font-size:13px;margin-bottom:6px;font-weight:500}
.wof-stepper{display:inline-flex;align-items:center;border:1px solid #d8dbe6;border-radius:10px;overflow:hidden}
.wof-stepper button{width:42px;height:42px;border:0;background:#f1f2f7;font-size:20px;cursor:pointer}
.wof-stepper input{width:80px;height:42px;border:0;text-align:center;font-size:16px;border-left:1px solid #e7e9f0;border-right:1px solid #e7e9f0}
.wof-summary{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding:14px 16px;background:#f5f8ff;border-radius:10px}
.wof-summary strong{font-size:18px}
.wof-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:560px){.wof-grid{grid-template-columns:1fr}}
.wof-field{margin-bottom:14px;display:flex;flex-direction:column}
.wof-field label{font-size:13px;font-weight:500;margin-bottom:6px}
.wof-field input,.wof-field select{height:42px;border:1px solid #d8dbe6;border-radius:10px;padding:0 12px;font-size:14px;background:#fff}
.wof-field input:disabled{background:#f1f2f7;color:#7a809a}
.wof-field small{margin-top:5px;color:#7a809a;font-size:12px}
.wof-inline{display:flex;gap:8px;align-items:center}
.wof-inline input{flex:1}
.wof-suffix{color:#5b6075;font-size:14px;white-space:nowrap}
.wof-zipmsg{color:#2563eb!important}
.wof-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.wof-btn{height:44px;padding:0 20px;border-radius:10px;border:1px solid transparent;font-size:14px;font-weight:600;cursor:pointer}
.wof-btn.primary{background:#2563eb;color:#fff}
.wof-btn.primary:disabled{background:#aab6e8;cursor:not-allowed}
.wof-btn.ghost{background:#fff;border-color:#d8dbe6;color:#1a1a2e}
.wof-alert{padding:10px 12px;border-radius:8px;font-size:13px;margin:12px 0}
.wof-alert.err{background:#fdecec;color:#b42318}
.wof-review{background:#f8f9fc;border-radius:10px;padding:16px}
.wof-review-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px}
.wof-review-row span{color:#7a809a}
.wof-review hr{border:0;border-top:1px solid #e7e9f0;margin:10px 0}
.wof-note{margin-top:16px;background:#fff8e6;border:1px solid #ffe5a3;border-radius:10px;padding:12px;font-size:13px;color:#6b5a1e}
.wof-done{text-align:center}
.wof-check{width:54px;height:54px;border-radius:50%;background:#16a34a;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.wof-next{text-align:left;margin-top:18px;background:#f8f9fc;border-radius:10px;padding:16px}
.wof-next h4{margin:0 0 8px}
.wof-next ol{margin:0;padding-left:18px;color:#5b6075;font-size:14px}
.wof-next a{color:#2563eb}
.pac-container{z-index:100000!important;border-radius:10px;margin-top:2px;box-shadow:0 6px 24px rgba(16,24,40,.18);font-family:inherit}
.pac-item{padding:8px 12px;cursor:pointer}
.wof-autocomplete-mount{width:100%}
.wof-autocomplete-mount gmp-place-autocomplete{width:100%}
.wof-autocomplete-mount input{height:42px;border:1px solid #d8dbe6;border-radius:10px;padding:0 12px;font-size:14px;width:100%}
.wof-picked{margin-top:6px;font-size:13px;color:#16a34a}
.wof-verify{margin-top:22px;border-top:1px solid #e7e9f0;padding-top:20px}
.wof-verify h4{margin:0 0 8px}
.wof-verify-steps{margin:10px 0;padding-left:20px;color:#5b6075;font-size:14px;line-height:1.7}
.wof-verify-steps a{color:#2563eb}
.wof-txt{display:flex;gap:8px;align-items:center;background:#f8f9fc;border:1px solid #e7e9f0;border-radius:10px;padding:10px 12px;margin:8px 0}
.wof-txt code{flex:1;font-size:12px;word-break:break-all;color:#1a1a2e}
.wof-verify-msg{margin:10px 0;font-size:13px;color:#2563eb;background:#f5f8ff;border-radius:8px;padding:8px 12px}
.wof-verified-ok{margin-top:22px;border-top:1px solid #e7e9f0;padding-top:20px;text-align:center}
.wof-verify-badge{display:inline-block;background:#dcfce7;color:#166534;font-weight:600;padding:8px 16px;border-radius:999px;margin-bottom:8px}
.wof-domain-status.checking{color:#7a809a!important}
.wof-domain-status.available{color:#16a34a!important}
.wof-domain-status.taken,.wof-domain-status.invalid{color:#b42318!important}
.wof-finish{margin-top:14px;text-align:left;background:#f5fbf6;border:1px solid #cdeccd;border-radius:10px;padding:14px 16px}
.wof-finish h4{margin:0 0 8px;color:#166534}
.wof-creds{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.wof-cred-row{display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid #cdeccd;border-radius:8px;padding:8px 12px}
.wof-cred-row span{font-size:13px;color:#5b6075}
.wof-cred-row code{font-size:14px;font-weight:600;color:#1a1a2e;word-break:break-all}
`;


// ==================== ROOT RENDER ====================
// ==================== ADMIN: BRANDING (logo + favicon) ====================
const AdminBrandingSection = () => {
  const { refresh } = useBranding();
  const [brandName, setBrandName] = useState('');
  const [brandColor, setBrandColor] = useState('#0F766E');
  const [logo, setLogo] = useState('');
  const [favicon, setFavicon] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/branding`);
        if (r.data) { setBrandName(r.data.brandName || ''); setBrandColor(r.data.brandColor || '#0F766E'); setLogo(r.data.logoDataUrl || ''); setFavicon(r.data.faviconDataUrl || ''); }
      } catch (_) { }
    })();
  }, []);

  const fileToDataUrl = (file, maxKB, cb) => {
    if (!file) return;
    if (file.size > maxKB * 1024) { setMsg(`That file is too large. Please use an image under ${maxKB}KB.`); return; }
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API_URL}/admin/branding`, { brandName, brandColor, logoDataUrl: logo, faviconDataUrl: favicon });
      setMsg('✓ Branding saved. Refresh the page to see the new favicon.');
      if (refresh) refresh();
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not save branding.'); }
    finally { setSaving(false); }
  };

  const box = { background: '#fff', borderRadius: 14, padding: 24, border: '1px solid #e5e7eb', maxWidth: 680 };
  const label = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🎨 Branding</h2>
      <p style={{ color: '#6b7280' }}>Upload your logo and favicon, set your brand name and color. These appear across the portal.</p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, maxWidth: 680, background: msg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: msg.startsWith('✓') ? '#166534' : '#92600a' }}>{msg}</div>}

      <div style={box}>
        <div style={{ marginBottom: 18 }}>
          <label style={label}>Brand name</label>
          <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="GNB MENTOR LLC"
            style={{ width: '100%', height: 42, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 12px' }} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={label}>Brand color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ width: 48, height: 42, border: '1px solid #d8dbe6', borderRadius: 8, cursor: 'pointer' }} />
            <input value={brandColor} onChange={e => setBrandColor(e.target.value)} style={{ flex: 1, height: 42, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 12px' }} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={label}>Logo (PNG/JPG/SVG, under 500KB)</label>
          {logo && <div style={{ marginBottom: 8 }}><img src={logo} alt="logo" style={{ maxHeight: 60, maxWidth: 240, background: '#f8fafc', padding: 6, borderRadius: 8 }} /></div>}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={e => fileToDataUrl(e.target.files[0], 500, setLogo)} />
          {logo && <button onClick={() => setLogo('')} style={{ marginLeft: 10, background: '#fef2f2', color: '#b42318', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Remove</button>}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={label}>Favicon (PNG/ICO, small, under 100KB)</label>
          {favicon && <div style={{ marginBottom: 8 }}><img src={favicon} alt="favicon" style={{ width: 32, height: 32, background: '#f8fafc', padding: 4, borderRadius: 6 }} /></div>}
          <input type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml" onChange={e => fileToDataUrl(e.target.files[0], 100, setFavicon)} />
          {favicon && <button onClick={() => setFavicon('')} style={{ marginLeft: 10, background: '#fef2f2', color: '#b42318', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Remove</button>}
        </div>

        <button onClick={save} disabled={saving} style={{ background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </div>
  );
};

// Global responsive styles — injected once. Makes the portal adapt to phones/tablets.
const ResponsiveStyles = () => (
  <style>{`
    /* ===== Tablet & below ===== */
    @media (max-width: 860px) {
      /* Customer portal: sidebar becomes a wrapping button row on top */
      .cp-layout { flex-direction: column !important; padding: 14px !important; gap: 14px !important; }
      .cp-sidebar { width: 100% !important; display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
      .cp-sidebar > button { flex: 1 1 auto !important; min-width: 120px !important; }
      /* Admin dashboard: sidebar to top bar */
      .dashboard { flex-direction: column !important; }
      .sidebar { width: 100% !important; height: auto !important; position: static !important; }
      .sidebar-menu { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
      .sidebar-menu > li { flex: 1 1 auto !important; }
      .dashboard-content { padding: 16px !important; }
      table { display: block !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
      /* Landing: reduce big paddings, let the card go full width below the text */
      .landing-nav { padding: 14px 20px !important; flex-wrap: wrap !important; gap: 10px !important; }
      .landing-hero { padding: 24px 20px 40px !important; gap: 24px !important; }
      .landing-card { flex: 1 1 100% !important; }
      .landing-band { padding: 44px 20px !important; }
    }
    /* ===== Phones ===== */
    @media (max-width: 600px) {
      h1 { font-size: 30px !important; }
      h2 { font-size: 24px !important; }
      .hero-title { font-size: 32px !important; line-height: 1.1 !important; }
      .landing-nav { padding: 12px 16px !important; }
      .landing-hero { padding: 20px 16px 32px !important; }
      .landing-band { padding: 36px 16px !important; }
      .landing-card { padding: 22px !important; border-radius: 18px !important; }
      /* Search box + button stack on very small screens */
      .domain-search-row { flex-direction: column !important; }
      .domain-search-row > * { width: 100% !important; }
    }
    /* ===== Universal niceties ===== */
    img { max-width: 100%; height: auto; }
    input, select, textarea, button { max-width: 100%; box-sizing: border-box; }
    html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
    body { overflow-x: hidden; }
    * { -webkit-tap-highlight-color: transparent; }
    button { cursor: pointer; }
    /* Subtle button hover lift for a more modern feel */
    button:hover { filter: brightness(0.97); }
  `}</style>
);

// ==================== CUSTOMER: IMPORT GOOGLE WORKSPACE (transfer) ====================
const CustomerWorkspaceImport = () => {
  const [domain, setDomain] = useState('');
  const [info, setInfo] = useState(null);       // our token + partner id
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [seats, setSeats] = useState(1);
  const [planType, setPlanType] = useState('flexible');
  const [opts, setOpts] = useState({ flexibleEnabled: true, annualEnabled: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const [i, p, o, t] = await Promise.all([
        axios.get(`${API_URL}/customer/workspace/transfer-info`).catch(() => null),
        axios.get(`${API_URL}/products`).catch(() => null),
        axios.get(`${API_URL}/order-options`).catch(() => null),
        axios.get(`${API_URL}/customer/workspace/transfers`).catch(() => null),
      ]);
      if (i?.data) setInfo(i.data);
      if (p?.data?.workspace) { setPlans(p.data.workspace); if (p.data.workspace[0]) setPlanId(p.data.workspace[0].id); }
      if (o?.data) { setOpts(o.data); if (!o.data.flexibleEnabled && o.data.annualEnabled) setPlanType('annual'); }
      if (t?.data) setTransfers(t.data.transfers || []);
    } catch (_) { }
  };
  useEffect(() => { load(); }, []);

  const copyToken = () => { if (info?.token) { navigator.clipboard?.writeText(info.token); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  const submit = async (method) => {
    const dom = domain.toLowerCase().trim();
    if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setMsg('Enter a valid domain like example.com'); return; }
    if (!planId) { setMsg('Choose the plan you are currently using.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await axios.post(`${API_URL}/customer/workspace/transfer`, { domain: dom, planId, seats: Number(seats), planType, method });
      if (r.data.checkoutUrl) window.location.href = r.data.checkoutUrl;
      else setMsg('Could not start checkout.');
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not start transfer.'); }
    finally { setBusy(false); }
  };

  const selectedPlan = plans.find(p => p.id === planId);
  const monthly = selectedPlan ? Number(selectedPlan.monthlyPrice) * Math.max(1, Number(seats) || 1) : 0;

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18 };
  const inp = { width: '100%', height: 46, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px', fontSize: 15 };
  const stepRow = { display: 'flex', gap: 12, marginBottom: 14 };
  const num = { flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>📥 Import your Google Workspace</h2>
      <p style={{ color: MUTE }}>Already using Google Workspace? Move billing & management to us. Your users, email, and data stay exactly the same.</p>

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Step 1 — Grant us permission in your Google Admin</h3>
        {!info?.configured ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', color: '#92600a' }}>
            Transfer isn't set up yet. Please contact support to get your transfer token.
          </div>
        ) : (
          <>
            <div style={stepRow}><div style={num}>1</div><div>Sign in to <a href="https://admin.google.com" target="_blank" rel="noreferrer" style={{ color: TEAL }}>admin.google.com</a> as a Super Admin.</div></div>
            <div style={stepRow}><div style={num}>2</div><div>Open <a href="https://admin.google.com/TransferToken" target="_blank" rel="noreferrer" style={{ color: TEAL }}>admin.google.com/TransferToken</a>. Enter your domain{info.partnerId ? <> and our Partner ID <strong>{info.partnerId}</strong></> : ''}, agree to terms.</div></div>
            <div style={stepRow}><div style={num}>3</div><div>
              Paste <strong>our transfer token</strong> below and submit it in your Google Admin to authorize us:
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <code style={{ background: '#f1f5f4', padding: '8px 14px', borderRadius: 8, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{info.token}</code>
                <button onClick={copyToken} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copied ✓' : 'Copy token'}</button>
              </div>
            </div></div>
            <div style={stepRow}><div style={num}>4</div><div>Once you've authorized us in Google Admin, complete Step 2 below — pick your plan and pay. The transfer finishes instantly.</div></div>
          </>
        )}
      </div>

      {info?.configured && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Step 2 — Your domain & plan</h3>
          <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Your domain</label><input style={inp} value={domain} onChange={e => setDomain(e.target.value)} placeholder="yourcompany.com" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }} className="grid-2">
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>Plan you're using</label>
                <select style={inp} value={planId} onChange={e => setPlanId(e.target.value)}>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${Number(p.monthlyPrice).toFixed(2)}/seat/mo</option>)}
                </select>
              </div>
              <div><label style={{ fontSize: 13, fontWeight: 600 }}>Seats</label><input type="number" min="1" style={inp} value={seats} onChange={e => setSeats(Math.max(1, parseInt(e.target.value || '1', 10)))} /></div>
            </div>
            {(opts.flexibleEnabled && opts.annualEnabled) && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Payment plan</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[['flexible', 'Flexible (monthly)'], ['annual', 'Annual (monthly pay)']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setPlanType(v)} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', border: planType === v ? `2px solid ${TEAL}` : '1px solid #d8dbe6', background: planType === v ? '#f0f7f5' : '#fff', fontWeight: 600 }}>{l}{planType === v ? ' ✓' : ''}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 15 }}>
            Monthly total: <strong style={{ color: TEAL, fontSize: 18 }}>${monthly.toFixed(2)}</strong> <span style={{ color: MUTE, fontSize: 13 }}>+ tax (for {seats} seat{seats == 1 ? '' : 's'})</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => submit('stripe')} disabled={busy} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '💳 Pay & complete transfer'}</button>
            <button onClick={() => submit('nicky')} disabled={busy} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer' }}>{busy ? '…' : '🪙 Pay with crypto'}</button>
          </div>
          {msg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: msg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: msg.startsWith('✓') ? '#166534' : '#b42318' }}>{msg}</div>}
        </div>
      )}

      {transfers.length > 0 && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Transfer history</h3>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: MUTE }}><th style={{ padding: '6px 0' }}>Domain</th><th>Plan</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{t.domain}</td>
                  <td>{t.planName || '—'}</td>
                  <td><span style={{ color: t.status === 'completed' ? '#166534' : t.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{t.status === 'completed' ? '✓ Completed' : t.status === 'failed' ? 'Failed' : t.status === 'test_paid' ? 'Test' : 'Processing'}</span>{t.status === 'failed' && t.note && <div style={{ fontSize: 12, color: '#b42318' }}>{t.note}</div>}</td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== CUSTOMER: HOSTING ====================
const CustomerHosting = () => {
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [forDomain, setForDomain] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const [p, o] = await Promise.all([
        axios.get(`${API_URL}/customer/nc/hosting`).catch(() => null),
        axios.get(`${API_URL}/customer/nc/hosting/orders`).catch(() => null),
      ]);
      if (p?.data?.plans) setPlans(p.data.plans);
      if (o?.data?.orders) setOrders(o.data.orders);
    } catch (_) { }
  };
  useEffect(() => { load(); }, []);

  const buy = async (plan, method) => {
    setBusy(plan.planId); setMsg('');
    try {
      const r = await axios.post(`${API_URL}/customer/nc/hosting/buy`, { planId: plan.planId, forDomain: forDomain.trim(), method });
      if (r.data.checkoutUrl) window.location.href = r.data.checkoutUrl;
      else setMsg('Could not start checkout.');
    } catch (e) { setMsg(e?.response?.data?.error || 'Could not start checkout.'); }
    finally { setBusy(''); }
  };

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 18 };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>🖥 Web Hosting</h2>
      <p style={{ color: MUTE }}>Fast, reliable hosting for your website. Pick a plan to get started.</p>

      {plans.length === 0 ? (
        <div style={card}><p style={{ color: MUTE, margin: 0 }}>No hosting plans are available right now. Please check back later.</p></div>
      ) : (
        <>
          <div style={{ ...card }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Domain for this hosting (optional)</label>
            <input value={forDomain} onChange={e => setForDomain(e.target.value)} placeholder="yourdomain.com"
              style={{ width: '100%', maxWidth: 360, height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px', marginTop: 6, display: 'block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }} className="grid-2">
            {plans.map(p => (
              <div key={p.planId} style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb' }}>
                <h3 style={{ margin: '0 0 4px' }}>{p.name}</h3>
                <div style={{ fontSize: 28, fontWeight: 800, color: TEAL }}>${Number(p.price).toFixed(2)}<span style={{ fontSize: 14, color: MUTE, fontWeight: 400 }}>/{p.billingCycle === 'monthly' ? 'mo' : 'yr'}</span></div>
                {p.description && <p style={{ color: MUTE, fontSize: 14 }}>{p.description}</p>}
                {p.features && p.features.length > 0 && (
                  <ul style={{ paddingLeft: 18, fontSize: 14, color: '#374151' }}>{p.features.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}</ul>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button onClick={() => buy(p, 'stripe')} disabled={busy === p.planId} style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>{busy === p.planId ? '…' : 'Buy (card)'}</button>
                  <button onClick={() => buy(p, 'nicky')} disabled={busy === p.planId} style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 8, padding: '9px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>🪙</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {msg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#fde8e8', color: '#b42318' }}>{msg}</div>}

      {orders.length > 0 && (
        <div style={{ ...card, marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>Your hosting</h3>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: MUTE }}><th style={{ padding: '6px 0' }}>Plan</th><th>For</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 600 }}>{o.planName}</td>
                  <td>{o.forDomain || '—'}</td>
                  <td><span style={{ color: o.status === 'active' ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{o.status === 'active' ? '✓ Active' : o.status === 'failed' ? 'Failed' : o.status === 'test_paid' ? 'Test' : 'Processing'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== ADMIN: CREATE & PROVISION WORKSPACE (no payment) + TRACK ORDERS ====================
const AdminOrderWorkspace = () => {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({
    domain: '', planId: '', seats: 1, planType: 'flexible', account: '',
    orgName: '', firstName: '', lastName: '', email: '', alternateEmail: '', phone: '',
    country: 'United States', streetAddress: '', streetAddress2: '', city: '', state: '', zip: '',
    desiredAdminUsername: 'admin', tempPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Order tracking
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState([]);
  const [retryBusy, setRetryBusy] = useState('');

  const loadPlans = async () => {
    try { const r = await axios.get(`${API_URL}/products`); if (r.data?.workspace) { setPlans(r.data.workspace); if (r.data.workspace[0]) setForm(f => ({ ...f, planId: r.data.workspace[0].id })); } } catch (_) { }
  };
  const loadOrders = async () => {
    try { const r = await axios.get(`${API_URL}/admin/workspace-orders${q ? `?q=${encodeURIComponent(q)}` : ''}`); setOrders(r.data.orders || []); } catch (_) { }
  };
  // Domain order tracking
  const [domQ, setDomQ] = useState('');
  const [domOrders, setDomOrders] = useState([]);
  const [domRetryBusy, setDomRetryBusy] = useState('');
  const [domMsg, setDomMsg] = useState('');
  const loadDomOrders = async () => {
    try { const r = await axios.get(`${API_URL}/admin/domain-orders${domQ ? `?q=${encodeURIComponent(domQ)}` : ''}`); setDomOrders(r.data.orders || []); } catch (_) { }
  };
  const retryDom = async (orderNumber) => {
    setDomRetryBusy(orderNumber); setDomMsg('');
    try {
      const r = await axios.post(`${API_URL}/admin/domain-order-retry`, { orderNumber });
      setDomMsg('✓ ' + orderNumber + ' → ' + (r.data.status || 'done'));
      loadDomOrders();
    } catch (e) { setDomMsg('✗ ' + orderNumber + ': ' + (e?.response?.data?.error || 'error')); }
    finally { setDomRetryBusy(''); }
  };
  useEffect(() => { loadPlans(); loadOrders(); loadDomOrders(); }, []);

  const set = (k, v) => setForm({ ...form, [k]: v });

  const submit = async () => {
    if (!form.domain || !form.planId || !form.seats) { setMsg('Domain, plan, and seats are required.'); return; }
    setBusy(true); setMsg('');
    try {
      const payload = {
        organization: { domain: form.domain.toLowerCase().trim(), name: form.orgName, country: form.country, streetAddress: form.streetAddress, streetAddress2: form.streetAddress2, city: form.city, state: form.state, zip: form.zip, desiredAdminUsername: form.desiredAdminUsername, tempPassword: form.tempPassword },
        contact: { firstName: form.firstName, lastName: form.lastName, email: form.email, alternateEmail: form.alternateEmail, phone: form.phone },
        plan: plans.find(p => p.id === form.planId),
        seats: Number(form.seats),
        planType: form.planType,
        account: form.account || undefined,
        monthlyTotal: (plans.find(p => p.id === form.planId)?.monthlyPrice || 0) * Number(form.seats),
      };
      const r = await axios.post(`${API_URL}/admin/workspace-orders/provision`, payload);
      setMsg('✓ ' + (r.data.message || 'Workspace provisioned.') + ` (Order ${r.data.orderNumber})` + (r.data.provisionNote ? ` — Note: ${r.data.provisionNote}` : ''));
      loadOrders();
    } catch (e) { setMsg('✗ ' + (e?.response?.data?.error || 'Provisioning failed.')); }
    finally { setBusy(false); }
  };

  const retry = async (orderNumber) => {
    setRetryBusy(orderNumber); setMsg('');
    try {
      const r = await axios.post(`${API_URL}/admin/workspace-order-reprovision`, { orderNumber });
      setMsg('✓ Re-provisioned ' + orderNumber + (r.data?.result?.message ? ` — ${r.data.result.message}` : ''));
      loadOrders();
    } catch (e) { setMsg('✗ Retry failed for ' + orderNumber + ': ' + (e?.response?.data?.error || 'error')); }
    finally { setRetryBusy(''); }
  };

  const box = { background: '#fff', borderRadius: 14, padding: 20, border: '1px solid #e5e7eb', marginBottom: 20 };
  const inp = { width: '100%', height: 42, borderRadius: 8, border: '1px solid #d8dbe6', padding: '0 12px', boxSizing: 'border-box' };
  const lab = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 };

  return (
    <div className="section">
      <h2>✨ Create Google Workspace (no payment)</h2>
      <p style={{ color: '#5b6075' }}>Fill the form and submit — the Workspace is created in Google immediately. No checkout required.</p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: msg.startsWith('✓') ? '#166534' : '#b42318' }}>{msg}</div>}

      <div style={box}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="grid-2">
          <div><label style={lab}>Domain *</label><input style={inp} value={form.domain} onChange={e => set('domain', e.target.value)} placeholder="redvi.shop" /></div>
          <div><label style={lab}>Reseller account</label>
            <select style={inp} value={form.account} onChange={e => set('account', e.target.value)}>
              <option value="">Auto (by order routing)</option>
              <option value="pk">Pakistan</option>
              <option value="usa">USA</option>
            </select>
          </div>
          <div><label style={lab}>Plan *</label>
            <select style={inp} value={form.planId} onChange={e => set('planId', e.target.value)}>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${Number(p.monthlyPrice).toFixed(2)}/seat/mo</option>)}
            </select>
          </div>
          <div><label style={lab}>Seats *</label><input type="number" min="1" style={inp} value={form.seats} onChange={e => set('seats', e.target.value)} /></div>
          <div><label style={lab}>Plan type</label>
            <select style={inp} value={form.planType} onChange={e => set('planType', e.target.value)}>
              <option value="flexible">Flexible (monthly)</option>
              <option value="annual">Annual (monthly pay)</option>
            </select>
          </div>
          <div><label style={lab}>Organization name</label><input style={inp} value={form.orgName} onChange={e => set('orgName', e.target.value)} /></div>
          <div><label style={lab}>Admin first name</label><input style={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} /></div>
          <div><label style={lab}>Admin last name</label><input style={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} /></div>
          <div><label style={lab}>Contact email</label><input style={inp} value={form.email} onChange={e => set('email', e.target.value)} placeholder="owner@redvi.shop" /></div>
          <div><label style={lab}>Alternate email</label><input style={inp} value={form.alternateEmail} onChange={e => set('alternateEmail', e.target.value)} placeholder="recovery email" /></div>
          <div><label style={lab}>Phone</label><input style={inp} value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div><label style={lab}>Admin username</label><input style={inp} value={form.desiredAdminUsername} onChange={e => set('desiredAdminUsername', e.target.value)} placeholder="admin" /></div>
          <div><label style={lab}>Temp password (optional)</label><input style={inp} value={form.tempPassword} onChange={e => set('tempPassword', e.target.value)} placeholder="auto-generated if blank" /></div>
          <div><label style={lab}>Country</label>
            <select style={inp} value={form.country} onChange={e => set('country', e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Address lookup (Google Maps)</label>
            <AddressAutocomplete onPick={({ street, city, state, zip }) => setForm(f => ({ ...f, streetAddress: street || f.streetAddress, city: city || f.city, state: state || f.state, zip: zip || f.zip }))} />
          </div>
          <div><label style={lab}>Street address</label><input style={inp} value={form.streetAddress} onChange={e => set('streetAddress', e.target.value)} /></div>
          <div><label style={lab}>Street address 2 (optional)</label><input style={inp} value={form.streetAddress2} onChange={e => set('streetAddress2', e.target.value)} /></div>
          <div><label style={lab}>City</label><input style={inp} value={form.city} onChange={e => set('city', e.target.value)} /></div>
          <div><label style={lab}>State</label><input style={inp} value={form.state} onChange={e => set('state', e.target.value)} /></div>
          <div><label style={lab}>ZIP</label><input style={inp} value={form.zip} onChange={e => set('zip', e.target.value)} /></div>
        </div>
        <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ marginTop: 16 }}>{busy ? 'Provisioning…' : 'Submit & create Workspace'}</button>
      </div>

      <h2>📋 Track & retry orders</h2>
      <p style={{ color: '#5b6075' }}>Search by order number (e.g. WS-1782543824372) or domain. Retry provisioning for orders that were paid but not created.</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input style={{ ...inp, maxWidth: 360 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadOrders(); }} placeholder="WS-... or domain.com" />
        <button onClick={loadOrders} className="btn btn-secondary">Search</button>
      </div>

      {orders.length === 0 ? <p style={{ color: '#9ca3af' }}>No orders found.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}>
              <th style={{ padding: '8px 0' }}>Order #</th><th>Domain</th><th>Plan</th><th>Acct</th><th>Status</th><th>In Google</th><th></th>
            </tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.orderNumber} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 13 }}>{o.orderNumber}</td>
                  <td style={{ fontWeight: 600 }}>{o.domain}</td>
                  <td>{o.planName} ({o.seats})</td>
                  <td>{o.account}</td>
                  <td><span style={{ color: o.status === 'provisioned' ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{o.status}</span>{o.provisionNote && <div style={{ fontSize: 11, color: '#b45309' }}>{o.provisionNote}</div>}</td>
                  <td>{o.googleProvisioned ? '✓' : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => retry(o.orderNumber)} disabled={retryBusy === o.orderNumber} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                      {retryBusy === o.orderNumber ? '…' : 'Retry provision'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>🌐 Domain orders</h2>
      <p style={{ color: '#5b6075' }}>Search domain purchases by order number (DM-...) or domain. Retry registration for orders that were paid but not registered.</p>
      {domMsg && <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, background: domMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: domMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{domMsg}</div>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input style={{ ...inp, maxWidth: 360 }} value={domQ} onChange={e => setDomQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') loadDomOrders(); }} placeholder="DM-... or domain.com" />
        <button onClick={loadDomOrders} className="btn btn-secondary">Search</button>
      </div>
      {domOrders.length === 0 ? <p style={{ color: '#9ca3af' }}>No domain orders found.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#6b7280' }}>
              <th style={{ padding: '8px 0' }}>Order #</th><th>Domain</th><th>Years</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {domOrders.map(o => (
                <tr key={o.orderNumber} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: 13 }}>{o.orderNumber}</td>
                  <td style={{ fontWeight: 600 }}>{o.domainName}</td>
                  <td>{o.period}</td>
                  <td><span style={{ color: o.status === 'registered' ? '#166534' : o.status === 'failed' ? '#b42318' : '#b45309', fontWeight: 600 }}>{o.status}</span>{o.error && <div style={{ fontSize: 11, color: '#b42318' }}>{o.error}</div>}</td>
                  <td style={{ textAlign: 'right' }}>
                    {o.status !== 'registered' && (
                      <button onClick={() => retryDom(o.orderNumber)} disabled={domRetryBusy === o.orderNumber} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
                        {domRetryBusy === o.orderNumber ? '…' : 'Retry register'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default function Root() {
  return (
    <BrandingProvider>
      <ResponsiveStyles />
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrandingProvider>
  );
}
