/**
 * Google Workspace Reseller Portal - Frontend
 * Complete React Application
 */

import React, { useState, useEffect, useContext, createContext } from "react";
import axios from "axios";
import "./App.css";

// API Config
const API_URL = process.env.REACT_APP_API_URL || "https://gworkspace-production.up.railway.app/api";
const MAPS_KEY =
  process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
  "AIzaSyBHlDoxHwgDkm-ZU3_B0Qed0zjS13vcaPw";

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      // Verify token is still valid
    }
    setLoading(false);
  }, [token]);

  const login = (email, token, userData) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem("token", token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    delete axios.defaults.headers.common["Authorization"];
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
  const [activeTab, setActiveTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login Form
  const [loginForm, setLoginForm] = useState({
    businessEmail: "",
    password: "",
  });

  // Register Form
  const [registerForm, setRegisterForm] = useState({
    companyName: "",
    businessEmail: "",
    password: "",
    phone: "",
    country: "",
    address: "",
    taxId: "",
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(`${API_URL}/auth/login`, loginForm);
      const { token, customer } = response.data;
      login(customer.businessEmail, token, customer);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await axios.post(
        `${API_URL}/auth/register`,
        registerForm,
      );
      const { token, customer } = response.data;
      login(customer.businessEmail, token, customer);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
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
            className={`tab ${activeTab === "login" ? "active" : ""}`}
            onClick={() => setActiveTab("login")}
          >
            Login
          </button>
          <button
            className={`tab ${activeTab === "register" ? "active" : ""}`}
            onClick={() => setActiveTab("register")}
          >
            Register
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {activeTab === "login" && (
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

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        )}

        {activeTab === "register" && (
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

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Creating Account..." : "Create Account"}
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
  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/dashboard`);
      setStats(response.data);
    } catch (error) {
      console.error("Error fetching dashboard:", error);
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
              className={`menu-item ${activeSection === "overview" ? "active" : ""}`}
              onClick={() => setActiveSection("overview")}
            >
              📈 Overview
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "order-workspace" ? "active" : ""}`}
              onClick={() => setActiveSection("order-workspace")}
            >
              ✨ Order Workspace
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "products" ? "active" : ""}`}
              onClick={() => setActiveSection("products")}
            >
              📦 Products
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "orders" ? "active" : ""}`}
              onClick={() => setActiveSection("orders")}
            >
              🛒 Orders
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "subscriptions" ? "active" : ""}`}
              onClick={() => setActiveSection("subscriptions")}
            >
              🔄 Subscriptions
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "users" ? "active" : ""}`}
              onClick={() => setActiveSection("users")}
            >
              👥 Users
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "invoices" ? "active" : ""}`}
              onClick={() => setActiveSection("invoices")}
            >
              📄 Invoices
            </button>
          </li>
          <li>
            <button
              className={`menu-item ${activeSection === "domains" ? "active" : ""}`}
              onClick={() => setActiveSection("domains")}
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
        {activeSection === "overview" && <OverviewSection stats={stats} />}
        {activeSection === "order-workspace" && <WorkspaceOrderFlow />}
        {activeSection === "products" && <ProductsSection />}
        {activeSection === "orders" && <OrdersSection />}
        {activeSection === "subscriptions" && <SubscriptionsSection />}
        {activeSection === "users" && <UsersSection />}
        {activeSection === "invoices" && <InvoicesSection />}
        {activeSection === "domains" && <DomainsSection />}
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
                  <span className={`status ${order.status}`}>
                    {order.status}
                  </span>
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
      console.error("Error fetching products:", error);
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
                  onClick={() => addToCart(product, "workspace")}
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
                  onClick={() => addToCart(product, "voice")}
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
                  onClick={() => addToCart(product, "addon")}
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
                      onChange={(e) =>
                        updateQuantity(idx, parseInt(e.target.value))
                      }
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
                    .reduce(
                      (sum, item) => sum + item.monthlyPrice * item.quantity,
                      0,
                    )
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
  const [paymentMethod, setPaymentMethod] = useState("stripe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setLoading(true);
    setError("");

    try {
      const orderItems = items.map((item) => ({
        productType: item.productType,
        productName: item.name,
        quantity: item.quantity,
        monthlyPrice: item.monthlyPrice,
        totalPrice: item.monthlyPrice * item.quantity,
      }));

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );

      const response = await axios.post(`${API_URL}/orders`, {
        items: orderItems,
        paymentMethod,
      });

      alert(
        `Order placed successfully! Order #${response.data.order.orderNumber}`,
      );
      setShowModal(false);
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.error || "Checkout failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => setShowModal(true)}
        style={{ width: "100%" }}
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
                {loading ? "Processing..." : "Complete Order"}
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
      console.error("Error fetching orders:", error);
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
                  <span className={`status ${order.status}`}>
                    {order.status}
                  </span>
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
      console.error("Error fetching subscriptions:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSeats = async (id, newSeats) => {
    try {
      await axios.patch(`${API_URL}/subscriptions/${id}`, { seats: newSeats });
      fetchSubscriptions();
      alert("Subscription updated!");
    } catch (error) {
      alert("Failed to update subscription");
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
                  <strong>Next Billing:</strong>{" "}
                  {new Date(sub.nextBillingDate).toLocaleDateString()}
                </p>
              </div>

              <div className="subscription-actions">
                <input
                  type="number"
                  min="1"
                  value={sub.seats}
                  onChange={(e) =>
                    updateSeats(sub._id, parseInt(e.target.value))
                  }
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
    firstName: "",
    lastName: "",
    email: "",
    voiceNumber: "",
    forwardingNumber: "",
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/users`, newUser);
      setNewUser({
        firstName: "",
        lastName: "",
        email: "",
        voiceNumber: "",
        forwardingNumber: "",
      });
      setShowAddUser(false);
      fetchUsers();
      alert("User created successfully!");
    } catch (error) {
      alert("Failed to create user");
    }
  };

  const handleDeleteUser = async (id) => {
    if (window.confirm("Are you sure?")) {
      try {
        await axios.delete(`${API_URL}/users/${id}`);
        fetchUsers();
        alert("User disabled!");
      } catch (error) {
        alert("Failed to delete user");
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
                <td>{user.voiceNumber || "-"}</td>
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
      console.error("Error fetching invoices:", error);
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
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    try {
      const response = await axios.get(`${API_URL}/domains`);
      setDomains(response.data);
    } catch (error) {
      console.error("Error fetching domains:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/domains`, { domainName: newDomain });
      setNewDomain("");
      setShowAddDomain(false);
      fetchDomains();
      alert("Domain added! Follow the verification steps.");
    } catch (error) {
      alert("Failed to add domain");
    }
  };

  const handleVerify = async (id) => {
    try {
      await axios.post(`${API_URL}/domains/${id}/verify`);
      fetchDomains();
      alert("Domain verified!");
    } catch (error) {
      alert("Verification failed. Please check DNS records.");
    }
  };

  if (loading) return <div className="loading">Loading domains...</div>;

  return (
    <div className="section">
      <div className="section-header">
        <h2>🌐 Domains</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddDomain(true)}
        >
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
                Status:{" "}
                <span className={domain.verified ? "verified" : "pending"}>
                  {domain.verified ? "✓ Verified" : "⏳ Pending"}
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

// ==================== STAGE 1: WORKSPACE ORDER FLOW ====================
const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
  ["DC", "District of Columbia"],
];

function WorkspaceOrderFlow() {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState(null);
  const [plansError, setPlansError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [seats, setSeats] = useState(1);
  const [form, setForm] = useState({
    organizationName: "",
    domain: "",
    desiredAdminUsername: "",
    tempPassword: "",
    country: "United States",
    streetAddress: "",
    streetAddress2: "",
    city: "",
    state: "",
    zip: "",
    firstName: "",
    lastName: "",
    email: "",
    alternateEmail: "",
    phone: "",
  });
  const [zipLoading, setZipLoading] = useState(false);
  const [zipMsg, setZipMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [orderDone, setOrderDone] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/products`);
        setPlans(res.data.workspace || []);
        if (res.data.workspace && res.data.workspace.length) {
          setSelectedPlanId(res.data.workspace[0].id);
        }
      } catch (e) {
        setPlansError("Could not load plans. Please try again shortly.");
      }
    })();
  }, []);

  const selectedPlan = plans?.find((p) => p.id === selectedPlanId);
  const monthlyTotal = selectedPlan ? selectedPlan.monthlyPrice * seats : 0;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const lookupZip = async () => {
    const zip = form.zip.trim();
    if (!/^\d{5}$/.test(zip)) {
      setZipMsg("Enter a valid 5-digit US ZIP code.");
      return;
    }
    if (!MAPS_KEY) {
      setZipMsg("Address lookup is not configured yet (missing Maps key).");
      return;
    }
    setZipLoading(true);
    setZipMsg("");
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:${zip}|country:US&key=${MAPS_KEY}`;
      const res = await axios.get(url);
      if (res.data.status !== "OK" || !res.data.results.length) {
        setZipMsg("No address found for that ZIP. You can type it manually.");
        setZipLoading(false);
        return;
      }
      const comps = res.data.results[0].address_components;
      const get = (type) => comps.find((c) => c.types.includes(type));
      const city =
        get("locality")?.long_name ||
        get("sublocality")?.long_name ||
        get("postal_town")?.long_name ||
        "";
      const stateShort = get("administrative_area_level_1")?.short_name || "";
      setForm((f) => ({ ...f, city, state: stateShort }));
      setZipMsg("Address details filled from ZIP. Add your street address.");
    } catch (e) {
      setZipMsg("Lookup failed. You can type the address manually.");
    } finally {
      setZipLoading(false);
    }
  };

  const canContinueStep1 = selectedPlan && seats >= 1;
  const canSubmit =
    form.organizationName &&
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.domain) &&
    form.desiredAdminUsername &&
    form.tempPassword.length >= 8 &&
    form.streetAddress &&
    form.city &&
    form.state &&
    /^\d{5}$/.test(form.zip) &&
    form.firstName &&
    form.lastName &&
    /\S+@\S+\.\S+/.test(form.email) &&
    /\S+@\S+\.\S+/.test(form.alternateEmail);

  const placeOrder = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const token = localStorage.getItem("token");
      const payload = {
        type: "workspace",
        plan: {
          id: selectedPlan.id,
          name: selectedPlan.name,
          monthlyPrice: selectedPlan.monthlyPrice,
        },
        seats: Number(seats),
        monthlyTotal,
        organization: {
          name: form.organizationName,
          domain: form.domain.toLowerCase(),
          desiredAdminUsername: form.desiredAdminUsername.toLowerCase(),
          tempPassword: form.tempPassword,
          country: "US",
          streetAddress: form.streetAddress,
          streetAddress2: form.streetAddress2,
          city: form.city,
          state: form.state,
          zip: form.zip,
        },
        contact: {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          alternateEmail: form.alternateEmail,
          phone: form.phone,
        },
      };
      const res = await axios.post(`${API_URL}/workspace-orders`, payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setOrderDone(res.data);
      setStep(4);
    } catch (e) {
      setSubmitError(
        e?.response?.data?.error ||
        "Could not place the order. Please check your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wof-wrap">
      <style>{wofStyles}</style>
      <header className="wof-head">
        <h2>Set up Google Workspace</h2>
        <p>
          Choose a plan, tell us about your organization, and place your order.
        </p>
        <ol className="wof-steps">
          <li className={step >= 1 ? "on" : ""}>Plan</li>
          <li className={step >= 2 ? "on" : ""}>Organization</li>
          <li className={step >= 3 ? "on" : ""}>Review</li>
        </ol>
      </header>

      {step === 1 && (
        <section className="wof-card">
          <h3>Choose your plan</h3>
          {plansError && <div className="wof-alert err">{plansError}</div>}
          {!plans && !plansError && (
            <div className="wof-muted">Loading plans…</div>
          )}
          <div className="wof-plans">
            {plans?.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`wof-plan ${selectedPlanId === p.id ? "sel" : ""}`}
                onClick={() => setSelectedPlanId(p.id)}
              >
                <div className="wof-plan-name">{p.name}</div>
                <div className="wof-plan-price">
                  ${Number(p.monthlyPrice).toFixed(2)}
                  <span>/user/mo</span>
                </div>
                {p.features && (
                  <ul className="wof-plan-feats">
                    {p.features.slice(0, 4).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </button>
            ))}
          </div>
          <div className="wof-seats">
            <label>Number of user licenses (seats)</label>
            <div className="wof-stepper">
              <button
                type="button"
                onClick={() => setSeats(Math.max(1, seats - 1))}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                value={seats}
                onChange={(e) =>
                  setSeats(Math.max(1, parseInt(e.target.value || "1", 10)))
                }
              />
              <button type="button" onClick={() => setSeats(seats + 1)}>
                +
              </button>
            </div>
          </div>
          <div className="wof-summary">
            <span>
              {selectedPlan ? selectedPlan.name : "—"} × {seats}
            </span>
            <strong>${monthlyTotal.toFixed(2)}/mo</strong>
          </div>
          <div className="wof-actions">
            <button
              type="button"
              className="wof-btn primary"
              disabled={!canContinueStep1}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wof-card">
          <h3>Organization information</h3>
          <div className="wof-grid">
            <div className="wof-field">
              <label>Organization name *</label>
              <input
                value={form.organizationName}
                onChange={set("organizationName")}
                placeholder="Acme Inc."
              />
            </div>
            <div className="wof-field">
              <label>Domain *</label>
              <input
                value={form.domain}
                onChange={set("domain")}
                placeholder="acme.com"
              />
            </div>
          </div>
          <div className="wof-grid">
            <div className="wof-field">
              <label>Desired admin username *</label>
              <div className="wof-inline">
                <input
                  value={form.desiredAdminUsername}
                  onChange={set("desiredAdminUsername")}
                  placeholder="admin"
                />
                <span className="wof-suffix">
                  @{form.domain || "yourdomain.com"}
                </span>
              </div>
              <small>This becomes the Workspace administrator login.</small>
            </div>
            <div className="wof-field">
              <label>Temporary password *</label>
              <input
                type="password"
                value={form.tempPassword}
                onChange={set("tempPassword")}
                placeholder="At least 8 characters"
              />
              <small>You'll be prompted to change this on first sign-in.</small>
            </div>
          </div>
          <h3 className="wof-subhead">Business address</h3>
          <div className="wof-grid">
            <div className="wof-field">
              <label>Country *</label>
              <input value="United States" disabled />
            </div>
            <div className="wof-field">
              <label>ZIP code *</label>
              <div className="wof-inline">
                <input
                  value={form.zip}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      zip: e.target.value.replace(/\D/g, "").slice(0, 5),
                    })
                  }
                  placeholder="e.g. 94043"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="wof-btn ghost"
                  onClick={lookupZip}
                  disabled={zipLoading}
                >
                  {zipLoading ? "Looking up…" : "Auto-fill"}
                </button>
              </div>
              {zipMsg && <small className="wof-zipmsg">{zipMsg}</small>}
            </div>
          </div>
          <div className="wof-field">
            <label>Street address *</label>
            <input
              value={form.streetAddress}
              onChange={set("streetAddress")}
              placeholder="123 Main St"
            />
          </div>
          <div className="wof-field">
            <label>Street address line 2</label>
            <input
              value={form.streetAddress2}
              onChange={set("streetAddress2")}
              placeholder="Suite 400 (optional)"
            />
          </div>
          <div className="wof-grid">
            <div className="wof-field">
              <label>City *</label>
              <input
                value={form.city}
                onChange={set("city")}
                placeholder="Mountain View"
              />
            </div>
            <div className="wof-field">
              <label>State *</label>
              <select value={form.state} onChange={set("state")}>
                <option value="">Please select</option>
                {US_STATES.map(([abbr, name]) => (
                  <option key={abbr} value={abbr}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <h3 className="wof-subhead">Contact information</h3>
          <p className="wof-muted">
            Used to create the initial administrator account.
          </p>
          <div className="wof-grid">
            <div className="wof-field">
              <label>First name *</label>
              <input value={form.firstName} onChange={set("firstName")} />
            </div>
            <div className="wof-field">
              <label>Last name *</label>
              <input value={form.lastName} onChange={set("lastName")} />
            </div>
          </div>
          <div className="wof-field">
            <label>Email *</label>
            <input
              value={form.email}
              onChange={set("email")}
              placeholder="you@example.com"
            />
          </div>
          <div className="wof-grid">
            <div className="wof-field">
              <label>Alternate email * (not on your new domain)</label>
              <input
                value={form.alternateEmail}
                onChange={set("alternateEmail")}
                placeholder="you@gmail.com"
              />
            </div>
            <div className="wof-field">
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={set("phone")}
                placeholder="+1 555 123 4567"
              />
            </div>
          </div>
          <div className="wof-actions">
            <button
              type="button"
              className="wof-btn ghost"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="wof-btn primary"
              disabled={!canSubmit}
              onClick={() => setStep(3)}
            >
              Review order
            </button>
          </div>
          {!canSubmit && (
            <small className="wof-muted">
              Complete all required (*) fields to continue.
            </small>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="wof-card">
          <h3>Review your order</h3>
          <div className="wof-review">
            <div className="wof-review-row">
              <span>Plan</span>
              <strong>{selectedPlan?.name}</strong>
            </div>
            <div className="wof-review-row">
              <span>Seats</span>
              <strong>{seats}</strong>
            </div>
            <div className="wof-review-row">
              <span>Monthly total</span>
              <strong>${monthlyTotal.toFixed(2)}/mo</strong>
            </div>
            <hr />
            <div className="wof-review-row">
              <span>Organization</span>
              <strong>{form.organizationName}</strong>
            </div>
            <div className="wof-review-row">
              <span>Domain</span>
              <strong>{form.domain}</strong>
            </div>
            <div className="wof-review-row">
              <span>Admin</span>
              <strong>
                {form.desiredAdminUsername}@{form.domain}
              </strong>
            </div>
            <div className="wof-review-row">
              <span>Address</span>
              <strong>
                {form.streetAddress}, {form.city}, {form.state} {form.zip}
              </strong>
            </div>
            <div className="wof-review-row">
              <span>Contact</span>
              <strong>
                {form.firstName} {form.lastName} · {form.email}
              </strong>
            </div>
          </div>
          <div className="wof-note">
            After you place this order, you'll verify your domain at
            admin.google.com, then add Google Voice. We'll guide you through it.
          </div>
          {submitError && <div className="wof-alert err">{submitError}</div>}
          <div className="wof-actions">
            <button
              type="button"
              className="wof-btn ghost"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="wof-btn primary"
              disabled={submitting}
              onClick={placeOrder}
            >
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </div>
        </section>
      )}

      {step === 4 && orderDone && (
        <section className="wof-card wof-done">
          <div className="wof-check">✓</div>
          <h3>Order placed</h3>
          <p>
            Your Google Workspace order for <strong>{form.domain}</strong> has
            been received.
          </p>
          {orderDone.orderNumber && (
            <p className="wof-muted">Order number: {orderDone.orderNumber}</p>
          )}
          <div className="wof-next">
            <h4>Next steps</h4>
            <ol>
              <li>
                Open{" "}
                <a
                  href="https://admin.google.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  admin.google.com
                </a>{" "}
                in a new tab and verify your domain.
              </li>
              <li>
                Come back here to add a Google Voice subscription (one per
                domain).
              </li>
            </ol>
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
`;

// ==================== ROOT RENDER ====================
export default function Root() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
