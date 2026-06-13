/**
 * Google Workspace Reseller Portal - Admin Panel Component
 * Management features for platform administrators
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminPanel = () => {
  const [adminTab, setAdminTab] = useState('customers');
  const [allCustomers, setAllCustomers] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAdminData();
  }, [adminTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // These endpoints would need to be added to the backend
      if (adminTab === 'customers') {
        // GET /api/admin/customers
      } else if (adminTab === 'orders') {
        // GET /api/admin/orders
      } else if (adminTab === 'analytics') {
        // GET /api/admin/analytics
      } else if (adminTab === 'payments') {
        // GET /api/admin/payments
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>🔐 Admin Panel</h1>
        <p>Platform Management & Analytics</p>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${adminTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setAdminTab('dashboard')}
        >
          📊 Dashboard
        </button>
        <button
          className={`admin-tab ${adminTab === 'customers' ? 'active' : ''}`}
          onClick={() => setAdminTab('customers')}
        >
          👥 Customers
        </button>
        <button
          className={`admin-tab ${adminTab === 'orders' ? 'active' : ''}`}
          onClick={() => setAdminTab('orders')}
        >
          🛒 Orders
        </button>
        <button
          className={`admin-tab ${adminTab === 'payments' ? 'active' : ''}`}
          onClick={() => setAdminTab('payments')}
        >
          💳 Payments
        </button>
        <button
          className={`admin-tab ${adminTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setAdminTab('analytics')}
        >
          📈 Analytics
        </button>
        <button
          className={`admin-tab ${adminTab === 'settings' ? 'active' : ''}`}
          onClick={() => setAdminTab('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      <div className="admin-content">
        {adminTab === 'dashboard' && <AdminDashboard />}
        {adminTab === 'customers' && <AdminCustomers />}
        {adminTab === 'orders' && <AdminOrders />}
        {adminTab === 'payments' && <AdminPayments />}
        {adminTab === 'analytics' && <AdminAnalytics />}
        {adminTab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
};

// ==================== ADMIN DASHBOARD ====================
const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalCustomers: 0,
    activeOrders: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    suspendedAccounts: 0,
    lastUpdated: new Date(),
  });

  useEffect(() => {
    // Fetch admin dashboard stats
    // GET /api/admin/dashboard
  }, []);

  return (
    <div className="section">
      <h2>Dashboard Overview</h2>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <h3>Total Customers</h3>
          <p className="admin-stat-large">{stats.totalCustomers}</p>
          <small>Active reseller accounts</small>
        </div>

        <div className="admin-stat-card success">
          <h3>Active Orders</h3>
          <p className="admin-stat-large">{stats.activeOrders}</p>
          <small>Current month</small>
        </div>

        <div className="admin-stat-card primary">
          <h3>Total Revenue</h3>
          <p className="admin-stat-large">${stats.totalRevenue.toFixed(2)}</p>
          <small>All time</small>
        </div>

        <div className="admin-stat-card warning">
          <h3>Pending Payments</h3>
          <p className="admin-stat-large">{stats.pendingPayments}</p>
          <small>Awaiting payment</small>
        </div>

        <div className="admin-stat-card danger">
          <h3>Suspended Accounts</h3>
          <p className="admin-stat-large">{stats.suspendedAccounts}</p>
          <small>Requires action</small>
        </div>

        <div className="admin-stat-card">
          <h3>Last Updated</h3>
          <p className="admin-stat-time">
            {stats.lastUpdated.toLocaleTimeString()}
          </p>
          <small>Real-time data</small>
        </div>
      </div>

      <div className="admin-charts">
        <div className="chart-container">
          <h3>Revenue Trend (Last 6 Months)</h3>
          {/* Add Chart.js or Recharts chart here */}
          <div className="placeholder-chart">Chart will render here</div>
        </div>

        <div className="chart-container">
          <h3>Workspace vs Voice Orders</h3>
          {/* Add pie chart */}
          <div className="placeholder-chart">Chart will render here</div>
        </div>
      </div>
    </div>
  );
};

// ==================== ADMIN CUSTOMERS ====================
const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const handleSuspend = async (customerId) => {
    if (window.confirm('Are you sure you want to suspend this account?')) {
      try {
        // PATCH /api/admin/customers/:id/suspend
        alert('Account suspended');
      } catch (error) {
        alert('Failed to suspend account');
      }
    }
  };

  const handleReactivate = async (customerId) => {
    try {
      // PATCH /api/admin/customers/:id/reactivate
      alert('Account reactivated');
    } catch (error) {
      alert('Failed to reactivate account');
    }
  };

  const handleReset = async (customerId) => {
    if (window.confirm('Reset all data for this customer?')) {
      try {
        // DELETE /api/admin/customers/:id/reset
        alert('Customer data reset');
      } catch (error) {
        alert('Failed to reset customer');
      }
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.businessEmail.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === 'all' || customer.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="section">
      <div className="section-header">
        <h2>Customer Management</h2>
        <div className="admin-controls">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      {selectedCustomer ? (
        <CustomerDetail
          customer={selectedCustomer}
          onBack={() => setSelectedCustomer(null)}
          onSuspend={handleSuspend}
          onReactivate={handleReactivate}
          onReset={handleReset}
        />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Total Users</th>
              <th>Total Spent</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer._id}>
                <td>
                  <strong>{customer.companyName}</strong>
                </td>
                <td>{customer.businessEmail}</td>
                <td>{customer.phone}</td>
                <td>{customer.totalUsers}</td>
                <td>${customer.totalCost.toFixed(2)}</td>
                <td>
                  <span className={`status ${customer.status}`}>
                    {customer.status}
                  </span>
                </td>
                <td>{new Date(customer.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn-action"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    View
                  </button>
                  <button
                    className="btn-action danger"
                    onClick={() => handleSuspend(customer._id)}
                  >
                    Suspend
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

// ==================== CUSTOMER DETAIL ====================
const CustomerDetail = ({ customer, onBack, onSuspend, onReactivate, onReset }) => {
  const [details, setDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="customer-detail">
      <button className="btn-back" onClick={onBack}>
        ← Back to Customers
      </button>

      <div className="detail-header">
        <div>
          <h3>{customer.companyName}</h3>
          <p>{customer.businessEmail}</p>
        </div>
        <div className="detail-actions">
          {customer.status === 'active' ? (
            <button
              className="btn btn-danger"
              onClick={() => onSuspend(customer._id)}
            >
              Suspend Account
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={() => onReactivate(customer._id)}
            >
              Reactivate
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => onReset(customer._id)}
          >
            Reset Data
          </button>
        </div>
      </div>

      <div className="detail-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Orders
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`tab ${activeTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveTab('invoices')}
        >
          Invoices
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'overview' && (
          <CustomerOverview customer={customer} />
        )}
        {activeTab === 'orders' && <CustomerOrders customerId={customer._id} />}
        {activeTab === 'users' && <CustomerUsers customerId={customer._id} />}
        {activeTab === 'invoices' && (
          <CustomerInvoices customerId={customer._id} />
        )}
      </div>
    </div>
  );
};

// ==================== CUSTOMER OVERVIEW ====================
const CustomerOverview = ({ customer }) => {
  return (
    <div className="overview-grid">
      <div className="overview-card">
        <h4>Contact Information</h4>
        <p>
          <strong>Email:</strong> {customer.businessEmail}
        </p>
        <p>
          <strong>Phone:</strong> {customer.phone}
        </p>
        <p>
          <strong>Address:</strong> {customer.address}
        </p>
        <p>
          <strong>Country:</strong> {customer.country}
        </p>
        <p>
          <strong>Tax ID:</strong> {customer.taxId}
        </p>
      </div>

      <div className="overview-card">
        <h4>Account Information</h4>
        <p>
          <strong>Status:</strong>{' '}
          <span className={`status ${customer.status}`}>{customer.status}</span>
        </p>
        <p>
          <strong>Reseller Code:</strong> {customer.resellerCode}
        </p>
        <p>
          <strong>Total Users:</strong> {customer.totalUsers}
        </p>
        <p>
          <strong>Total Spent:</strong> ${customer.totalCost.toFixed(2)}
        </p>
        <p>
          <strong>Joined:</strong>{' '}
          {new Date(customer.createdAt).toLocaleDateString()}
        </p>
        <p>
          <strong>Last Login:</strong>{' '}
          {customer.lastLogin
            ? new Date(customer.lastLogin).toLocaleString()
            : 'Never'}
        </p>
      </div>
    </div>
  );
};

// ==================== ADMIN ORDERS ====================
const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredOrders = orders.filter(
    (order) => filterStatus === 'all' || order.status === filterStatus
  );

  return (
    <div className="section">
      <h2>All Orders</h2>

      <div className="filter-controls">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Orders</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Customer</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Items</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order) => (
            <tr key={order._id}>
              <td>{order.orderNumber}</td>
              <td>{order.customer?.companyName}</td>
              <td>{new Date(order.createdAt).toLocaleDateString()}</td>
              <td>${order.totalAmount.toFixed(2)}</td>
              <td>{order.items.length}</td>
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
    </div>
  );
};

// ==================== ADMIN PAYMENTS ====================
const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [filterMethod, setFilterMethod] = useState('all');

  return (
    <div className="section">
      <h2>Payment Management</h2>

      <div className="filter-controls">
        <select
          value={filterMethod}
          onChange={(e) => setFilterMethod(e.target.value)}
        >
          <option value="all">All Payments</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="bank">Bank</option>
        </select>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment._id}>
              <td>{payment.transactionId}</td>
              <td>{payment.customer?.companyName}</td>
              <td>${payment.amount.toFixed(2)}</td>
              <td>{payment.method}</td>
              <td>
                <span className={`status ${payment.status}`}>
                  {payment.status}
                </span>
              </td>
              <td>{new Date(payment.timestamp).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ==================== ADMIN ANALYTICS ====================
const AdminAnalytics = () => {
  const [dateRange, setDateRange] = useState('month');

  return (
    <div className="section">
      <h2>Analytics & Reports</h2>

      <div className="analytics-controls">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="week">Last 7 Days</option>
          <option value="month">Last 30 Days</option>
          <option value="quarter">Last 3 Months</option>
          <option value="year">Last 12 Months</option>
        </select>
      </div>

      <div className="analytics-charts">
        <div className="chart-container">
          <h3>Daily Revenue</h3>
          <div className="placeholder-chart">Chart will render here</div>
        </div>

        <div className="chart-container">
          <h3>Orders by Type</h3>
          <div className="placeholder-chart">Chart will render here</div>
        </div>

        <div className="chart-container">
          <h3>Customer Growth</h3>
          <div className="placeholder-chart">Chart will render here</div>
        </div>

        <div className="chart-container">
          <h3>Payment Success Rate</h3>
          <div className="placeholder-chart">Chart will render here</div>
        </div>
      </div>

      <div className="analytics-summary">
        <h3>Summary</h3>
        <table className="summary-table">
          <tbody>
            <tr>
              <td>Total Revenue</td>
              <td className="amount">$0.00</td>
            </tr>
            <tr>
              <td>Total Orders</td>
              <td className="amount">0</td>
            </tr>
            <tr>
              <td>New Customers</td>
              <td className="amount">0</td>
            </tr>
            <tr>
              <td>Avg Order Value</td>
              <td className="amount">$0.00</td>
            </tr>
            <tr>
              <td>Payment Success Rate</td>
              <td className="amount">0%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== ADMIN SETTINGS ====================
const AdminSettings = () => {
  const [settings, setSettings] = useState({
    workspaceMarkup: 20,
    voiceMarkup: 15,
    minimumOrderAmount: 0,
    autoRenewDefault: true,
    invoiceDuesDays: 30,
  });

  const handleSave = async () => {
    try {
      // PUT /api/admin/settings
      alert('Settings saved successfully!');
    } catch (error) {
      alert('Failed to save settings');
    }
  };

  return (
    <div className="section">
      <h2>Platform Settings</h2>

      <div className="settings-form">
        <div className="form-group">
          <label>Google Workspace Markup (%)</label>
          <input
            type="number"
            value={settings.workspaceMarkup}
            onChange={(e) =>
              setSettings({
                ...settings,
                workspaceMarkup: parseFloat(e.target.value),
              })
            }
          />
          <small>Markup percentage on Google Workspace products</small>
        </div>

        <div className="form-group">
          <label>Google Voice Markup (%)</label>
          <input
            type="number"
            value={settings.voiceMarkup}
            onChange={(e) =>
              setSettings({
                ...settings,
                voiceMarkup: parseFloat(e.target.value),
              })
            }
          />
          <small>Markup percentage on Google Voice</small>
        </div>

        <div className="form-group">
          <label>Minimum Order Amount ($)</label>
          <input
            type="number"
            value={settings.minimumOrderAmount}
            onChange={(e) =>
              setSettings({
                ...settings,
                minimumOrderAmount: parseFloat(e.target.value),
              })
            }
          />
        </div>

        <div className="form-group">
          <label>Auto-Renew Default</label>
          <input
            type="checkbox"
            checked={settings.autoRenewDefault}
            onChange={(e) =>
              setSettings({
                ...settings,
                autoRenewDefault: e.target.checked,
              })
            }
          />
          <small>Enable auto-renewal by default for new subscriptions</small>
        </div>

        <div className="form-group">
          <label>Invoice Due Days</label>
          <input
            type="number"
            value={settings.invoiceDuesDays}
            onChange={(e) =>
              setSettings({
                ...settings,
                invoiceDuesDays: parseInt(e.target.value),
              })
            }
          />
          <small>Number of days until invoice is due</small>
        </div>

        <button className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
};

// Placeholder components for related data
const CustomerOrders = ({ customerId }) => <div>Orders data loading...</div>;
const CustomerUsers = ({ customerId }) => <div>Users data loading...</div>;
const CustomerInvoices = ({ customerId }) => <div>Invoices data loading...</div>;

export default AdminPanel;
