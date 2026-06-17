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

// Auth Context
const AuthContext = createContext();

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
  const [activeTab, setActiveTab] = useState(startTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🚀 Google Workspace Portal</h1>
          <p>Reseller Management Platform</p>
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
              <label>Business Email</label>
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
              <input
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                required
              />
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
                <input type="password" value={registerForm.password} required
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
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
  const [activeSection, setActiveSection] = useState('overview');
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
              className={`menu-item ${activeSection === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveSection('orders')}
            >
              🛒 Orders
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'subs-pk' ? 'active' : ''}`}
              onClick={() => setActiveSection('subs-pk')}
            >
              🇵🇰 Pakistan Workspace
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'subs-usa' ? 'active' : ''}`}
              onClick={() => setActiveSection('subs-usa')}
            >
              🇺🇸 USA Voice
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
        </ul>

        <button onClick={logout} className="btn btn-logout">
          🚪 Logout
        </button>
      </nav>

      <main className="dashboard-content">
        {activeSection === 'overview' && <OverviewSection stats={stats} />}
        {activeSection === 'order-workspace' && <WorkspaceOrderFlow />}
        {activeSection === 'products' && <ProductsSection />}
        {activeSection === 'orders' && <OrdersSection />}
        {activeSection === 'subs-pk' && <SubscriptionsSection account="PK" />}
        {activeSection === 'subs-usa' && <SubscriptionsSection account="USA" />}
        {activeSection === 'customers' && <AdminCustomersSection />}
        {activeSection === 'tickets' && <AdminTicketsSection />}
        {activeSection === 'payments' && <AdminPaymentsSection />}
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

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Customers (Google)</h3>
          <p className="stat-value">{live ? live.totalCustomers : '…'}</p>
        </div>

        <div className="stat-card">
          <h3>Active Subscriptions</h3>
          <p className="stat-value">{live ? live.activeSubscriptions : '…'}</p>
        </div>

        <div className="stat-card">
          <h3>Total Seats</h3>
          <p className="stat-value">{live ? live.totalSeats : '…'}</p>
        </div>

        <div className="stat-card">
          <h3>All Subscriptions</h3>
          <p className="stat-value">{live ? live.totalSubscriptions : '…'}</p>
        </div>

        <div className="stat-card">
          <h3>Suspended</h3>
          <p className="stat-value">{live ? live.suspendedSubscriptions : '…'}</p>
        </div>

        <div className="stat-card">
          <h3>Reseller Code</h3>
          <p className="stat-value code">{stats.customerInfo.resellerCode}</p>
        </div>
      </div>

      <div className="recent-orders">
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
const ProductsSection = () => {
  const [plans, setPlans] = useState(null);
  const [editing, setEditing] = useState(null); // plan being edited (or 'new')
  const [form, setForm] = useState({ planId: '', category: 'workspace', name: '', monthlyPrice: 0, skuId: '', features: '', active: true, sortOrder: 0 });
  const [msg, setMsg] = useState('');

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

      <button className="btn btn-primary" onClick={startNew} style={{ marginBottom: 16 }}>+ Add product</button>

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

  const title = isUSA ? '🇺🇸 USA Voice Subscriptions' : '🇵🇰 Pakistan Workspace Subscriptions';

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

  if (loading) return <div className="loading">Loading customers…</div>;

  return (
    <div className="section">
      <h2>👥 Customers</h2>
      {error && <div style={{ background: '#fde8e8', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      <p style={{ color: '#5b6075' }}>{customers.length} registered customer{customers.length === 1 ? '' : 's'}</p>
      {customers.length === 0 ? <p>No customers have registered yet.</p> : (
        <table className="data-table">
          <thead><tr><th>Username</th><th>Email</th><th>Domain</th><th>Reg. IP</th><th>Last login IP</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id}>
                <td>{c.username || '—'}</td>
                <td>{c.email}</td>
                <td>{c.domain || '—'}</td>
                <td style={{ fontSize: 12 }}>{c.registrationIp || '—'}</td>
                <td style={{ fontSize: 12 }}>{c.lastLoginIp || '—'}</td>
                <td><span className={`status ${c.status}`}>{c.status}</span></td>
                <td>
                  <button className="btn btn-secondary" onClick={() => resetPassword(c.id)}>Reset password</button>
                  {resetMsg[c.id] && <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>{resetMsg[c.id]}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        stripePublishableTest: s.stripePublishableTest,
        stripePublishableLive: s.stripePublishableLive,
        feeEnabled: s.feeEnabled,
        feeFixed: s.feeFixed,
        feePercent: s.feePercent,
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
              <thead><tr><th>Date</th><th>Customer</th><th>Domain</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p._id}>
                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td>{p.customerEmail}</td>
                    <td>{p.domain || '—'}</td>
                    <td>${Number(p.amount || 0).toFixed(2)}</td>
                    <td>{p.method === 'nicky' ? 'Crypto' : 'Card'}</td>
                    <td><span className={`status ${p.status}`}>{p.status}</span></td>
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
    </div>
  );
};


// ==================== CUSTOMER PORTAL ====================
// Shared theme tokens for the customer portal (matches portal.gnbmentor.com)
const TEAL = '#0F766E';
const TEAL_DARK = '#115E56';
const INK = '#1f2937';
const MUTE = '#6b7280';

const CustomerPortal = () => {
  const { user, logout } = useAuth();
  const [section, setSection] = useState('overview');

  const navItems = [
    { key: 'overview', label: 'Overview', icon: '🏠' },
    { key: 'dashboard', label: 'My subscriptions', icon: '📚' },
    { key: 'order', label: 'New subscription', icon: '✨' },
    { key: 'domains', label: 'Domains', icon: '🌐' },
    { key: 'voice', label: 'Google Voice', icon: '📞' },
    { key: 'payments', label: 'Payments', icon: '💳' },
    { key: 'support', label: 'Support', icon: '🎫' },
    { key: 'settings', label: 'Account settings', icon: '⚙️' },
  ];

  const name = user?.username || (user?.businessEmail || '').split('@')[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f6f8f7', color: INK, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top bar */}
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>A</div>
          <strong style={{ fontSize: 18, color: TEAL }}>Artisan Drywall LLC</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: MUTE }}>Welcome, <strong style={{ color: INK }}>{name}</strong></span>
          <span style={{ background: '#e6f4f1', color: TEAL, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>Customer</span>
          <button onClick={logout} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: INK }}>Logout</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 24, padding: 24, maxWidth: 1200, margin: '0 auto', alignItems: 'flex-start' }}>
        {/* Sidebar card */}
        <aside style={{ width: 240, background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0 }}>
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
          {section === 'overview' && <CustomerOverview onNavigate={setSection} />}
          {section === 'dashboard' && <CustomerSubscriptions />}
          {section === 'order' && <WorkspaceOrderFlow />}
          {section === 'domains' && <CustomerDomains />}
          {section === 'voice' && <CustomerVoice />}
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const res = await axios.get(`${API_URL}/customer/my-subscriptions`); setData(res.data); }
      catch (_) { setData({ subscriptions: [] }); }
      finally { setLoading(false); }
    })();
  }, []);

  const name = user?.username || (user?.businessEmail || '').split('@')[0];
  const subs = data?.subscriptions || [];
  const active = subs.filter(s => s.status === 'ACTIVE').length;
  const pending = subs.filter(s => s.status !== 'ACTIVE').length;

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
  const pill = (color, bg) => ({ background: bg, color, padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600 });

  return (
    <div>
      <h1 style={{ fontSize: 32, margin: '0 0 6px', color: INK }}>Welcome back, {name}</h1>
      <p style={{ color: MUTE, margin: '0 0 24px' }}>Your Workspace orders, payments, and mailboxes in one place.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>SUBSCRIPTIONS</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: INK, margin: '6px 0' }}>{loading ? '…' : subs.length}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Total orders</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>ACTIVE</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: TEAL, margin: '6px 0' }}>{loading ? '…' : active}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Live Workspace</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: MUTE, fontWeight: 700 }}>NEEDS PAYMENT</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: '#b45309', margin: '6px 0' }}>{loading ? '…' : pending}</div>
          <div style={{ color: MUTE, fontSize: 14 }}>Awaiting checkout</div>
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
              <span style={s.status === 'ACTIVE' ? pill('#166534', '#dcfce7') : pill('#92600a', '#fef3c7')}>{s.status === 'ACTIVE' ? 'Active' : 'Pending'}</span>
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
    // If returning from checkout, show a message
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') setMsg('✓ Payment received — thank you! It may take a moment to confirm.');
    if (params.get('payment') === 'cancelled') setMsg('Payment was cancelled. You can try again anytime.');
  }, []);

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

  const buyDomain = async (method) => {
    if (!result?.available) return;
    setRegBusy(true); setRegMsg('');
    try {
      const res = await axios.post(`${API_URL}/customer/domains/register`, {
        domainName: result.domainName, period: 1, price: result.price, method,
      });
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl; // pay first; domain registers on payment
      } else {
        setRegMsg('Could not start checkout.');
      }
    } catch (e) { setRegMsg(e?.response?.data?.error || 'Could not start checkout.'); }
    finally { setRegBusy(false); }
  };

  const card = { background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };

  const search = async () => {
    setError(''); setResult(null);
    const dom = query.toLowerCase().trim();
    if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setError('Enter a full domain like example.com'); return; }
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
            placeholder="yourbusiness.com"
            style={{ flex: 1, height: 46, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px', fontSize: 16 }}
          />
          <button onClick={search} disabled={loading}
            style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '0 24px', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {error && <div style={{ color: '#b42318', marginTop: 10, fontSize: 14 }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16, background: '#f0f7f5', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{result.domainName}</div>
              <div style={{ color: result.available ? '#166534' : '#b45309', fontWeight: 600 }}>{result.available ? '✓ Available' : '✗ Not available'}</div>
            </div>
            {result.available && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 20, color: TEAL }}>${Number(result.price).toFixed(2)}/yr</strong>
                <button onClick={() => buyDomain('stripe')} disabled={regBusy}
                  style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
                  {regBusy ? '…' : '💳 Buy by card'}
                </button>
                <button onClick={() => buyDomain('nicky')} disabled={regBusy}
                  style={{ background: '#fff', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: 10, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>
                  {regBusy ? '…' : '🪙 Buy with crypto'}
                </button>
              </div>
            )}
          </div>
        )}
        {regMsg && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: regMsg.startsWith('✓') ? '#dcfce7' : '#fde8e8', color: regMsg.startsWith('✓') ? '#166534' : '#b42318' }}>{regMsg}</div>}
      </div>

      {/* Verification panel */}
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Verify a domain you own</h3>
        <p style={{ color: MUTE, fontSize: 14 }}>To use Google Workspace on your own domain, verify you own it. Choose TXT or CNAME, add the record at your DNS provider, then click Check.</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input value={vDomain} onChange={e => setVDomain(e.target.value)} placeholder="yourbusiness.com"
            style={{ flex: 1, minWidth: 200, height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 14px' }} />
          <select value={vMethod} onChange={e => setVMethod(e.target.value)} style={{ height: 44, borderRadius: 10, border: '1px solid #d8dbe6', padding: '0 12px' }}>
            <option value="txt">TXT record</option>
            <option value="cname">CNAME record</option>
          </select>
          <button onClick={checkVerify} disabled={vLoading}
            style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 10, padding: '0 22px', fontWeight: 700, cursor: 'pointer' }}>
            {vLoading ? 'Checking…' : 'Check'}
          </button>
        </div>
        {vMsg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: vMsg.startsWith('✓') ? '#dcfce7' : '#fef3c7', color: vMsg.startsWith('✓') ? '#166534' : '#92600a' }}>{vMsg}</div>}
        {vData && !vData.verified && (
          <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
            <h4 style={{ marginTop: 0 }}>Add this {vData.method.toUpperCase()} record at your DNS provider:</h4>
            {vData.method === 'cname' ? (
              <table style={{ width: '100%', fontSize: 14 }}><tbody>
                <tr><td style={{ color: MUTE, padding: '4px 0' }}>Type</td><td><strong>CNAME</strong></td></tr>
                <tr><td style={{ color: MUTE }}>Host / Name</td><td><code>{vData.cnameHost}</code></td></tr>
                <tr><td style={{ color: MUTE }}>Value / Target</td><td><code>{vData.cnameValue}</code></td></tr>
              </tbody></table>
            ) : (
              <table style={{ width: '100%', fontSize: 14 }}><tbody>
                <tr><td style={{ color: MUTE, padding: '4px 0' }}>Type</td><td><strong>TXT</strong></td></tr>
                <tr><td style={{ color: MUTE }}>Host / Name</td><td><code>@ (root)</code></td></tr>
                <tr><td style={{ color: MUTE }}>Value</td><td><code style={{ wordBreak: 'break-all' }}>{vData.txtRecord}</code></td></tr>
              </tbody></table>
            )}
            <p style={{ color: MUTE, fontSize: 13, marginBottom: 0, marginTop: 10 }}>DNS changes can take a few minutes (sometimes up to an hour). Add the record, wait, then click Check again.</p>
          </div>
        )}
      </div>
    </div>
  );
};



const CustomerSubscriptions = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/customer/my-subscriptions`);
        setData(res.data);
      } catch (e) { setError(e?.response?.data?.error || 'Could not load your subscriptions.'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="loading">Loading your subscriptions…</div>;

  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString() : '—';

  return (
    <div className="section">
      <h2>📊 My Subscriptions</h2>
      {error && <div style={{ background: '#fde8e8', color: '#b42318', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}
      {data?.domain && <p style={{ color: '#5b6075' }}>Domain: <strong>{data.domain}</strong></p>}
      {(!data?.subscriptions || data.subscriptions.length === 0) ? (
        <div style={{ background: '#f5f8ff', border: '1px solid #dbe4ff', borderRadius: 12, padding: 20 }}>
          <p style={{ margin: 0 }}>You don't have any subscriptions yet. Use <strong>Order Workspace</strong> to get started.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Product</th><th>Plan</th><th>Seats</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>
            {data.subscriptions.map((s, i) => (
              <tr key={i}>
                <td>{s.skuName}</td>
                <td>{s.planName || '—'}</td>
                <td>{s.seats ?? '—'}</td>
                <td><span className={`status ${(s.status || '').toLowerCase()}`}>{s.status}</span></td>
                <td>{fmtDate(s.creationTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Customer: Google Voice info + guidance (number assignment happens in their Admin console)
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
      <h2>⚙️ Account Settings</h2>
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
    if (!/^[a-z0-9-]+\.[a-z.]{2,}$/.test(dom)) { setDError('Enter a full domain like yourbusiness.com'); return; }
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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>A</div>
          <strong style={{ fontSize: 22, color: T }}>Artisan Drywall LLC</strong>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => go('/login')} style={{ background: 'transparent', border: 'none', color: INKL, fontSize: 16, cursor: 'pointer', padding: '10px 16px' }}>↪ Login</button>
          <button onClick={() => go('/register')} style={{ background: T, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>+ Sign Up</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ display: 'flex', gap: 40, padding: '40px 40px 60px', maxWidth: 1200, margin: '0 auto', flexWrap: 'wrap', alignItems: 'center' }}>
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
          <h1 style={{ fontSize: 56, lineHeight: 1.05, margin: '0 0 20px', fontWeight: 800 }}>
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
        <div style={{ flex: '0 0 440px', background: '#fff', borderRadius: 24, padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.08)' }}>
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
      <section style={{ background: '#fff', padding: '64px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 38, margin: '0 0 14px', fontWeight: 800 }}>Get a professional business email</h2>
          <p style={{ fontSize: 18, color: MUTEL, lineHeight: 1.6, margin: '0 0 28px' }}>
            Create a custom email address connected to your domain to build instant trust and look credible from the get go.
          </p>
          <p style={{ fontWeight: 600, margin: '0 0 14px' }}>Start by finding the right domain for your business email</p>
          <div style={{ display: 'flex', gap: 10, maxWidth: 560, margin: '0 auto' }}>
            <input
              value={dq}
              onChange={e => setDq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchDomain(); }}
              placeholder="yourbusiness.com"
              style={{ flex: 1, height: 52, borderRadius: 12, border: '1px solid #d8dbe6', padding: '0 16px', fontSize: 16 }}
            />
            <button onClick={searchDomain} disabled={dLoading}
              style={{ background: T, color: '#fff', border: 'none', borderRadius: 12, padding: '0 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              {dLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {dError && <div style={{ color: '#b42318', marginTop: 12 }}>{dError}</div>}
          {dResult && (
            <div style={{ marginTop: 20, background: '#f0f7f5', borderRadius: 14, padding: 20, maxWidth: 560, margin: '20px auto 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{dResult.domainName}</div>
                <div style={{ color: dResult.available ? '#166534' : '#b45309', fontWeight: 600 }}>
                  {dResult.available ? '✓ Available' : '✗ Taken'}
                </div>
              </div>
              {dResult.available && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <strong style={{ fontSize: 20, color: T }}>${Number(dResult.price).toFixed(2)}/yr</strong>
                  <button onClick={() => go('/register')}
                    style={{ background: T, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 22px', fontWeight: 700, cursor: 'pointer' }}>
                    Get started
                  </button>
                </div>
              )}
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
      <section style={{ background: T, color: '#fff', padding: '64px 40px', textAlign: 'center' }}>
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
              <div style={{ width: 36, height: 36, borderRadius: 9, background: T, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A</div>
              <strong style={{ color: '#fff', fontSize: 18 }}>Artisan Drywall LLC</strong>
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
          © {new Date().getFullYear()} Artisan Drywall LLC · Google Workspace Reseller
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
    })();
  }, []);

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
export default function Root() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}