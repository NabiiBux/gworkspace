/**
 * Google Workspace Reseller Portal - Frontend
 * Complete React Application
 */

import React, { useState, useEffect, useContext, createContext } from 'react';
import axios from 'axios';
import './App.css';

// API Config
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token is still valid
    }
    setLoading(false);
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
const LoginPage = () => {
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('login');
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
    businessEmail: '',
    password: '',
    phone: '',
    country: '',
    address: '',
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
          <button
            className={`tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            Register
          </button>
        </div>

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
                <label>Company Name</label>
                <input
                  type="text"
                  value={registerForm.companyName}
                  onChange={(e) =>
                    setRegisterForm({
                      ...registerForm,
                      companyName: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Business Email</label>
                <input
                  type="email"
                  value={registerForm.businessEmail}
                  onChange={(e) =>
                    setRegisterForm({
                      ...registerForm,
                      businessEmail: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={registerForm.phone}
                  onChange={(e) =>
                    setRegisterForm({
                      ...registerForm,
                      phone: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Country</label>
                <input
                  type="text"
                  value={registerForm.country}
                  onChange={(e) =>
                    setRegisterForm({
                      ...registerForm,
                      country: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                value={registerForm.address}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, address: e.target.value })
                }
                required
              />
            </div>

            <div className="form-group">
              <label>Tax ID</label>
              <input
                type="text"
                value={registerForm.taxId}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, taxId: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={registerForm.password}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, password: e.target.value })
                }
                required
              />
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
              className={`menu-item ${activeSection === 'subscriptions' ? 'active' : ''}`}
              onClick={() => setActiveSection('subscriptions')}
            >
              🔄 Subscriptions
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'users' ? 'active' : ''}`}
              onClick={() => setActiveSection('users')}
            >
              👥 Users
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'invoices' ? 'active' : ''}`}
              onClick={() => setActiveSection('invoices')}
            >
              📄 Invoices
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === 'domains' ? 'active' : ''}`}
              onClick={() => setActiveSection('domains')}
            >
              🌐 Domains
            </button>
          </li>
        </ul>

        <button onClick={logout} className="btn btn-logout">
          🚪 Logout
        </button>
      </nav>

      <main className="dashboard-content">
        {activeSection === 'overview' && <OverviewSection stats={stats} />}
        {activeSection === 'products' && <ProductsSection />}
        {activeSection === 'orders' && <OrdersSection />}
        {activeSection === 'subscriptions' && <SubscriptionsSection />}
        {activeSection === 'users' && <UsersSection />}
        {activeSection === 'invoices' && <InvoicesSection />}
        {activeSection === 'domains' && <DomainsSection />}
      </main>
    </div>
  );
};

// ==================== OVERVIEW SECTION ====================
const OverviewSection = ({ stats }) => {
  if (!stats) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Dashboard Overview</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Active Orders</h3>
          <p className="stat-value">{stats.orders}</p>
        </div>

        <div className="stat-card">
          <h3>Active Subscriptions</h3>
          <p className="stat-value">{stats.activeSubscriptions}</p>
        </div>

        <div className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-value">{stats.totalUsers}</p>
        </div>

        <div className="stat-card">
          <h3>Total Revenue</h3>
          <p className="stat-value">${stats.totalRevenue.toFixed(2)}</p>
        </div>

        <div className="stat-card">
          <h3>Pending Invoices</h3>
          <p className="stat-value">{stats.pendingInvoices}</p>
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
  const [products, setProducts] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_URL}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const addToCart = (product, type) => {
    setSelectedProducts([
      ...selectedProducts,
      { ...product, productType: type, quantity: 1 },
    ]);
  };

  const removeFromCart = (index) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  const updateQuantity = (index, quantity) => {
    const updated = [...selectedProducts];
    updated[index].quantity = Math.max(1, quantity);
    setSelectedProducts(updated);
  };

  if (!products) return <div className="loading">Loading products...</div>;

  return (
    <div className="section">
      <h2>📦 Google Workspace Products</h2>

      <div className="products-container">
        <div className="products-list">
          <h3>Google Workspace Plans</h3>
          <div className="product-grid">
            {products.workspace.map((product) => (
              <div key={product.id} className="product-card">
                <h4>{product.name}</h4>
                <p className="price">${product.monthlyPrice}/month</p>
                <ul className="features">
                  {product.features.map((feature, idx) => (
                    <li key={idx}>✓ {feature}</li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  onClick={() => addToCart(product, 'workspace')}
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>

          <h3>Google Voice</h3>
          <div className="product-grid">
            {products.voice.map((product) => (
              <div key={product.id} className="product-card">
                <h4>{product.name}</h4>
                <p className="price">${product.monthlyPrice}/month</p>
                <ul className="features">
                  {product.features.map((feature, idx) => (
                    <li key={idx}>✓ {feature}</li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  onClick={() => addToCart(product, 'voice')}
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>

          <h3>Add-ons</h3>
          <div className="product-grid">
            {products.addons.map((product) => (
              <div key={product.id} className="product-card">
                <h4>{product.name}</h4>
                <p className="price">${product.monthlyPrice}/month</p>
                <p className="description">{product.description}</p>
                <button
                  className="btn btn-primary"
                  onClick={() => addToCart(product, 'addon')}
                >
                  Add to Cart
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="shopping-cart">
          <h3>🛒 Shopping Cart</h3>
          {selectedProducts.length === 0 ? (
            <p className="empty-cart">Your cart is empty</p>
          ) : (
            <>
              <div className="cart-items">
                {selectedProducts.map((item, idx) => (
                  <div key={idx} className="cart-item">
                    <div>
                      <h5>{item.name}</h5>
                      <p>${item.monthlyPrice}/month</p>
                    </div>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(idx, parseInt(e.target.value))}
                    />
                    <button
                      className="btn-remove"
                      onClick={() => removeFromCart(idx)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="cart-summary">
                <p className="total">
                  Total: $
                  {selectedProducts
                    .reduce((sum, item) => sum + item.monthlyPrice * item.quantity, 0)
                    .toFixed(2)}
                  /month
                </p>
                <CheckoutModal items={selectedProducts} />
              </div>
            </>
          )}
        </div>
      </div>
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

      /*const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);*/

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

// ==================== SUBSCRIPTIONS SECTION ====================
const SubscriptionsSection = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const response = await axios.get(`${API_URL}/subscriptions`);
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSeats = async (id, newSeats) => {
    try {
      await axios.patch(`${API_URL}/subscriptions/${id}`, { seats: newSeats });
      fetchSubscriptions();
      alert('Subscription updated!');
    } catch (error) {
      alert('Failed to update subscription');
    }
  };

  if (loading) return <div className="loading">Loading subscriptions...</div>;

  return (
    <div className="section">
      <h2>🔄 Subscriptions</h2>

      {subscriptions.length === 0 ? (
        <p>No active subscriptions.</p>
      ) : (
        <div className="subscriptions-grid">
          {subscriptions.map((sub) => (
            <div key={sub._id} className="subscription-card">
              <div className="subscription-header">
                <h4>{sub.plan}</h4>
                <span className={`status ${sub.status}`}>{sub.status}</span>
              </div>

              <div className="subscription-details">
                <p>
                  <strong>Type:</strong> {sub.type}
                </p>
                <p>
                  <strong>Seats:</strong> {sub.seats}
                </p>
                <p>
                  <strong>Price:</strong> ${sub.monthlyPrice}/month
                </p>
                <p>
                  <strong>Next Billing:</strong>{' '}
                  {new Date(sub.nextBillingDate).toLocaleDateString()}
                </p>
              </div>

              <div className="subscription-actions">
                <input
                  type="number"
                  min="1"
                  value={sub.seats}
                  onChange={(e) => updateSeats(sub._id, parseInt(e.target.value))}
                  className="input-small"
                />
                <button className="btn btn-primary">Update Seats</button>
              </div>
            </div>
          ))}
        </div>
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

// ==================== MAIN APP ====================
function App() {
  const { token, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return token ? <Dashboard /> : <LoginPage />;
}

// ==================== ROOT RENDER ====================
export default function Root() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
