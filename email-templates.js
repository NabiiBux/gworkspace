/**
 * Email Templates for Google Workspace Reseller Portal
 * HTML templates for various email notifications
 */

const emailTemplates = {
  // ==================== REGISTRATION CONFIRMATION ====================
  registrationConfirmation: (customer) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Google Workspace Portal</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #1f2937 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .btn { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
        .info-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; }
        h2 { color: #1f2937; }
        .code { background: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to Google Workspace Portal</h1>
        </div>
        
        <div class="content">
          <h2>Hello ${customer.companyName}!</h2>
          
          <p>Thank you for registering with our Google Workspace Reseller Portal. Your account has been successfully created!</p>
          
          <div class="info-box">
            <strong>Account Details:</strong>
            <p>
              <strong>Company:</strong> ${customer.companyName}<br>
              <strong>Email:</strong> ${customer.businessEmail}<br>
              <strong>Reseller Code:</strong> <span class="code">${customer.resellerCode}</span>
            </p>
          </div>
          
          <h3>Getting Started:</h3>
          <ol>
            <li>Log in to your account</li>
            <li>Browse our Google Workspace products</li>
            <li>Create your first order</li>
            <li>Add users to your account</li>
            <li>Manage subscriptions and billing</li>
          </ol>
          
          <p>
            <a href="https://yourportal.com/login" class="btn">Login to Your Account</a>
          </p>
          
          <h3>Need Help?</h3>
          <p>Our support team is ready to assist you. Contact us at <strong>support@yourreseller.com</strong> or call <strong>+1-XXX-XXX-XXXX</strong>.</p>
          
          <p>Best regards,<br><strong>Google Workspace Reseller Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
          <p>If you didn't create this account, please contact us immediately.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // ==================== ORDER CONFIRMATION ====================
  orderConfirmation: (order, customer) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #1f2937 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .order-summary { background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 20px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        table th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .total-row { font-weight: bold; background: #ecfdf5; }
        .status { background: #10b981; color: white; padding: 5px 10px; border-radius: 4px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Order Confirmed!</h1>
          <p>Order #${order.orderNumber}</p>
        </div>
        
        <div class="content">
          <h2>Thank you for your order!</h2>
          
          <p>Your order has been successfully placed and is being processed. Below are your order details:</p>
          
          <div class="order-summary">
            <h3>Order Details</h3>
            <p>
              <strong>Order Number:</strong> ${order.orderNumber}<br>
              <strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}<br>
              <strong>Status:</strong> <span class="status">${order.status.toUpperCase()}</span>
            </p>
          </div>
          
          <h3>Items Ordered:</h3>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map((item) => `
                <tr>
                  <td>${item.productName}</td>
                  <td>${item.quantity}</td>
                  <td>$${item.monthlyPrice.toFixed(2)}/month</td>
                  <td>$${item.totalPrice.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3">Total Monthly Cost</td>
                <td>$${order.totalAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <h3>Next Steps:</h3>
          <ol>
            <li>Payment will be processed on ${new Date(order.renewalDate).toLocaleDateString()}</li>
            <li>You will receive a detailed invoice shortly</li>
            <li>Your services will be activated upon successful payment</li>
            <li>You can add users to your account immediately</li>
          </ol>
          
          <h3>What Happens Next?</h3>
          <p>Our team will process your order within 24 hours. You'll receive an invoice via email, and your Google Workspace services will be activated upon successful payment processing.</p>
          
          <h3>Manage Your Order</h3>
          <p>
            <a href="https://yourportal.com/orders/${order._id}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Order in Dashboard
            </a>
          </p>
          
          <p>If you have any questions, please don't hesitate to contact our support team.</p>
          
          <p>Best regards,<br><strong>Google Workspace Reseller Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // ==================== INVOICE NOTIFICATION ====================
  invoiceNotification: (invoice, order) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice #${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #1f2937 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .invoice-header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        table th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .total-row { font-weight: bold; background: #ecfdf5; font-size: 16px; }
        .due-date { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .btn { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Invoice</h1>
          <p>#${invoice.invoiceNumber}</p>
        </div>
        
        <div class="content">
          <div class="invoice-header">
            <p>
              <strong>Invoice Date:</strong> ${new Date(invoice.issueDate).toLocaleDateString()}<br>
              <strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}
            </p>
          </div>
          
          <h3>Items:</h3>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map((item) => `
                <tr>
                  <td>${item.productName}</td>
                  <td>${item.quantity}</td>
                  <td>$${item.monthlyPrice.toFixed(2)}</td>
                  <td>$${item.totalPrice.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr>
                <td colspan="3">Subtotal</td>
                <td>$${invoice.amount.toFixed(2)}</td>
              </tr>
              <tr>
                <td colspan="3">Tax</td>
                <td>$${invoice.tax.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3">Total Due</td>
                <td>$${invoice.total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="due-date">
            <strong>⚠️ Payment Due:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}
            <p>Please arrange payment by the due date to avoid service interruption.</p>
          </div>
          
          <h3>Payment Options:</h3>
          <ul>
            <li><strong>Credit Card:</strong> Available in your portal</li>
            <li><strong>PayPal:</strong> Available in your portal</li>
            <li><strong>Bank Transfer:</strong> Contact support for details</li>
          </ul>
          
          <p>
            <a href="https://yourportal.com/invoices/${invoice._id}" class="btn">Pay Invoice</a>
          </p>
          
          <p>If you have questions about this invoice, please reply to this email or contact our billing team.</p>
          
          <p>Best regards,<br><strong>Billing Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // ==================== USER INVITATION ====================
  userInvitation: (user, customer) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Google Workspace Account Created</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #1f2937 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .welcome-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; }
        .btn { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
        .info-box { background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 15px; margin: 15px 0; }
        code { background: #f3f4f6; padding: 3px 6px; border-radius: 3px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Welcome to Google Workspace!</h1>
        </div>
        
        <div class="content">
          <h2>Your account is ready!</h2>
          
          <p>Hello ${user.firstName} ${user.lastName},</p>
          
          <p>A Google Workspace account has been created for you by ${customer.companyName}.</p>
          
          <div class="welcome-box">
            <strong>Your Account Details:</strong>
            <p>
              <strong>Email:</strong> <code>${user.email}</code><br>
              <strong>Company:</strong> ${customer.companyName}
            </p>
          </div>
          
          <h3>Getting Started:</h3>
          <ol>
            <li>Go to <a href="https://mail.google.com">mail.google.com</a></li>
            <li>Sign in with your email address</li>
            <li>Set up your password (you'll be prompted)</li>
            <li>Start using Gmail, Calendar, Drive, and more!</li>
          </ol>
          
          <div class="info-box">
            <strong>📧 Your Email:</strong> ${user.email}<br>
            <strong>🔐 Workspace Features Available:</strong>
            <ul>
              <li>Gmail - Professional email</li>
              <li>Calendar - Schedule and events</li>
              <li>Google Drive - Cloud storage (30GB+)</li>
              <li>Google Meet - Video conferencing</li>
              <li>Google Docs/Sheets/Slides - Office suite</li>
            </ul>
          </div>
          
          ${user.voiceNumber ? `
            <div class="info-box">
              <strong>📱 Google Voice:</strong><br>
              Your Google Voice number: <code>${user.voiceNumber}</code><br>
              Forwarding number: <code>${user.forwardingNumber}</code><br>
              You can manage these settings in your Google Voice settings.
            </div>
          ` : ''}
          
          <h3>Next Steps:</h3>
          <ul>
            <li>Set up your profile picture and out-of-office message</li>
            <li>Configure your email forwarding if needed</li>
            <li>Set up Google Voice for incoming calls</li>
            <li>Share your calendar with team members</li>
          </ul>
          
          <p>
            <a href="https://mail.google.com" class="btn">Access Gmail</a>
          </p>
          
          <h3>Need Help?</h3>
          <p>For assistance, visit <a href="https://support.google.com/workspace">Google Workspace Help Center</a> or contact your administrator at <strong>${customer.businessEmail}</strong>.</p>
          
          <p>Welcome aboard!<br><strong>Google Workspace Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // ==================== SUBSCRIPTION RENEWAL REMINDER ====================
  renewalReminder: (subscription, customer) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Subscription Renewal Reminder</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .reminder-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
        .btn { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Subscription Renewal Reminder</h1>
        </div>
        
        <div class="content">
          <h2>Your subscription is expiring soon</h2>
          
          <p>Hello ${customer.companyName},</p>
          
          <p>This is a friendly reminder that your Google Workspace subscription is set to renew on <strong>${new Date(subscription.nextBillingDate).toLocaleDateString()}</strong>.</p>
          
          <div class="reminder-box">
            <strong>Subscription Details:</strong>
            <p>
              <strong>Plan:</strong> ${subscription.plan}<br>
              <strong>Number of Seats:</strong> ${subscription.seats}<br>
              <strong>Monthly Cost:</strong> $${subscription.monthlyPrice.toFixed(2)}<br>
              <strong>Renewal Date:</strong> ${new Date(subscription.nextBillingDate).toLocaleDateString()}
            </p>
          </div>
          
          <h3>What Happens Next?</h3>
          <p>Your subscription will automatically renew on the renewal date if auto-renewal is enabled. You will be charged the monthly subscription fee.</p>
          
          <h3>Manage Your Subscription</h3>
          <ul>
            <li>Add or remove seats</li>
            <li>Upgrade or downgrade your plan</li>
            <li>Disable auto-renewal</li>
            <li>Update payment method</li>
          </ul>
          
          <p>
            <a href="https://yourportal.com/subscriptions/${subscription._id}" class="btn">Manage Subscription</a>
          </p>
          
          <h3>Questions?</h3>
          <p>If you have any questions or need to make changes, please contact our support team at <strong>support@yourreseller.com</strong> or log in to your dashboard.</p>
          
          <p>Best regards,<br><strong>Google Workspace Reseller Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // ==================== PAYMENT RECEIVED ====================
  paymentReceived: (payment, invoice) => `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; }
        .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .success-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Payment Received</h1>
        </div>
        
        <div class="content">
          <h2>Thank you for your payment!</h2>
          
          <p>We have successfully received your payment. Your services remain active.</p>
          
          <div class="success-box">
            <strong>Payment Details:</strong>
            <p>
              <strong>Transaction ID:</strong> ${payment.transactionId}<br>
              <strong>Amount:</strong> $${payment.amount.toFixed(2)}<br>
              <strong>Payment Method:</strong> ${payment.method.toUpperCase()}<br>
              <strong>Date:</strong> ${new Date(payment.timestamp).toLocaleDateString()}<br>
              <strong>Invoice:</strong> #${invoice.invoiceNumber}
            </p>
          </div>
          
          <p>Your receipt has been attached to this email for your records.</p>
          
          <p>Best regards,<br><strong>Billing Team</strong></p>
        </div>
        
        <div class="footer">
          <p>&copy; 2024 Google Workspace Reseller Portal. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,
};

module.exports = emailTemplates;
