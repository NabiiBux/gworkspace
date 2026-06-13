/**
 * Google Workspace Reseller Portal - Database Schema
 * MongoDB Collections and Models
 */

// ==================== CUSTOMERS COLLECTION ====================
db.createCollection("customers", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "companyName",
        "businessEmail",
        "password",
        "phone",
        "country",
        "status",
        "createdAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        companyName: { bsonType: "string", description: "Company name" },
        businessEmail: {
          bsonType: "string",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
          description: "Primary business email",
        },
        password: {
          bsonType: "string",
          description: "Hashed password",
        },
        phone: { bsonType: "string", description: "Business phone number" },
        country: { bsonType: "string", description: "Country" },
        address: { bsonType: "string", description: "Business address" },
        taxId: { bsonType: "string", description: "Tax ID / VAT number" },
        resellerCode: {
          bsonType: "string",
          description: "Unique reseller identification code",
        },
        status: {
          enum: ["active", "inactive", "suspended"],
          description: "Account status",
        },
        totalUsers: { bsonType: "int", default: 0 },
        totalCost: { bsonType: "double", default: 0 },
        createdAt: { bsonType: "date" },
        lastLogin: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.customers.createIndex({ businessEmail: 1 }, { unique: true });
db.customers.createIndex({ resellerCode: 1 }, { unique: true });
db.customers.createIndex({ status: 1 });
db.customers.createIndex({ createdAt: -1 });

// ==================== ORDERS COLLECTION ====================
db.createCollection("orders", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "customerId",
        "orderNumber",
        "totalAmount",
        "status",
        "createdAt",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        customerId: {
          bsonType: "objectId",
          description: "Reference to customer",
        },
        orderNumber: {
          bsonType: "string",
          description: "Unique order identifier",
        },
        items: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              productType: { enum: ["workspace", "voice", "addon"] },
              productName: { bsonType: "string" },
              quantity: { bsonType: "int" },
              monthlyPrice: { bsonType: "double" },
              totalPrice: { bsonType: "double" },
            },
          },
        },
        totalAmount: { bsonType: "double" },
        status: {
          enum: ["pending", "active", "expired", "cancelled"],
        },
        paymentStatus: {
          enum: ["unpaid", "paid", "refunded"],
        },
        paymentMethod: {
          enum: ["stripe", "paypal", "bank", "manual"],
        },
        transactionId: { bsonType: "string" },
        startDate: { bsonType: "date" },
        renewalDate: { bsonType: "date" },
        createdAt: { bsonType: "date" },
        notes: { bsonType: "string" },
      },
    },
  },
});

// Create indexes
db.orders.createIndex({ customerId: 1 });
db.orders.createIndex({ orderNumber: 1 }, { unique: true });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ paymentStatus: 1 });
db.orders.createIndex({ createdAt: -1 });

// ==================== SUBSCRIPTIONS COLLECTION ====================
db.createCollection("subscriptions", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["customerId", "orderId", "subscriptionId", "type", "status"],
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        orderId: { bsonType: "objectId" },
        subscriptionId: {
          bsonType: "string",
          description: "Unique subscription ID",
        },
        type: {
          enum: ["workspace", "voice", "addon"],
          description: "Subscription type",
        },
        plan: {
          bsonType: "string",
          description: "Plan name (e.g., business_starter)",
        },
        seats: { bsonType: "int", description: "Number of user seats" },
        monthlyPrice: { bsonType: "double" },
        status: {
          enum: ["active", "suspended", "cancelled"],
        },
        googleWorkspaceSkuId: { bsonType: "string" },
        autoRenew: { bsonType: "bool", default: true },
        nextBillingDate: { bsonType: "date" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.subscriptions.createIndex({ customerId: 1 });
db.subscriptions.createIndex({ orderId: 1 });
db.subscriptions.createIndex({ subscriptionId: 1 }, { unique: true });
db.subscriptions.createIndex({ status: 1 });
db.subscriptions.createIndex({ nextBillingDate: 1 });

// ==================== USERS COLLECTION ====================
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["customerId", "email", "firstName", "lastName", "status"],
      properties: {
        _id: { bsonType: "objectId" },
        customerId: {
          bsonType: "objectId",
          description: "Reference to customer (company)",
        },
        firstName: { bsonType: "string" },
        lastName: { bsonType: "string" },
        email: {
          bsonType: "string",
          pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
        },
        role: {
          enum: ["admin", "user", "viewer"],
          default: "user",
        },
        status: {
          enum: ["active", "inactive", "suspended"],
        },
        googleWorkspaceId: {
          bsonType: "string",
          description: "Google Workspace user ID",
        },
        voiceNumber: {
          bsonType: "string",
          description: "Google Voice number",
        },
        forwardingNumber: {
          bsonType: "string",
          description: "Number calls forward to",
        },
        createdAt: { bsonType: "date" },
        lastLogin: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.users.createIndex({ customerId: 1 });
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ googleWorkspaceId: 1 });
db.users.createIndex({ status: 1 });

// ==================== INVOICES COLLECTION ====================
db.createCollection("invoices", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "customerId",
        "invoiceNumber",
        "amount",
        "total",
        "status",
        "issueDate",
      ],
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        invoiceNumber: {
          bsonType: "string",
          description: "Unique invoice number",
        },
        orderId: { bsonType: "objectId", description: "Related order" },
        amount: { bsonType: "double", description: "Subtotal" },
        tax: { bsonType: "double", description: "Tax amount" },
        total: { bsonType: "double", description: "Total amount due" },
        status: {
          enum: ["draft", "sent", "paid", "overdue"],
        },
        issueDate: { bsonType: "date" },
        dueDate: { bsonType: "date" },
        paidDate: { bsonType: "date" },
        paymentMethod: {
          enum: ["stripe", "paypal", "bank", "manual", "pending"],
        },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.invoices.createIndex({ customerId: 1 });
db.invoices.createIndex({ invoiceNumber: 1 }, { unique: true });
db.invoices.createIndex({ status: 1 });
db.invoices.createIndex({ dueDate: 1 });
db.invoices.createIndex({ issueDate: -1 });

// ==================== DOMAINS COLLECTION ====================
db.createCollection("domains", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["customerId", "domainName"],
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        domainName: {
          bsonType: "string",
          description: "Domain name",
        },
        verified: {
          bsonType: "bool",
          default: false,
        },
        verificationMethod: {
          enum: ["dns", "cname", "html", "email"],
          description: "How domain was verified",
        },
        txtRecord: {
          bsonType: "string",
          description: "TXT record for DNS verification",
        },
        mxRecords: {
          bsonType: "array",
          items: { bsonType: "string" },
        },
        spfRecord: { bsonType: "string" },
        dkimRecord: { bsonType: "string" },
        createdAt: { bsonType: "date" },
        verifiedAt: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.domains.createIndex({ customerId: 1 });
db.domains.createIndex({ domainName: 1 });
db.domains.createIndex({ verified: 1 });

// ==================== AUDIT LOG COLLECTION ====================
db.createCollection("auditLogs", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        userId: { bsonType: "objectId" },
        action: {
          bsonType: "string",
          description: "Action performed (CREATE, UPDATE, DELETE, LOGIN)",
        },
        resource: {
          bsonType: "string",
          description: "Resource affected (USER, ORDER, DOMAIN, etc.)",
        },
        resourceId: { bsonType: "objectId" },
        details: {
          bsonType: "object",
          description: "Detailed information about the action",
        },
        ipAddress: { bsonType: "string" },
        userAgent: { bsonType: "string" },
        timestamp: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.auditLogs.createIndex({ customerId: 1 });
db.auditLogs.createIndex({ action: 1 });
db.auditLogs.createIndex({ timestamp: -1 });

// ==================== PAYMENTS COLLECTION ====================
db.createCollection("payments", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        orderId: { bsonType: "objectId" },
        invoiceId: { bsonType: "objectId" },
        amount: { bsonType: "double" },
        currency: {
          bsonType: "string",
          default: "USD",
        },
        status: {
          enum: ["pending", "completed", "failed", "refunded"],
        },
        method: {
          enum: ["stripe", "paypal", "bank", "manual"],
        },
        transactionId: { bsonType: "string" },
        stripePaymentId: { bsonType: "string" },
        paypalTransactionId: { bsonType: "string" },
        description: { bsonType: "string" },
        metadata: { bsonType: "object" },
        timestamp: { bsonType: "date" },
        completedAt: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.payments.createIndex({ customerId: 1 });
db.payments.createIndex({ status: 1 });
db.payments.createIndex({ transactionId: 1 });
db.payments.createIndex({ timestamp: -1 });

// ==================== SUPPORT TICKETS COLLECTION ====================
db.createCollection("supportTickets", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        _id: { bsonType: "objectId" },
        customerId: { bsonType: "objectId" },
        ticketNumber: { bsonType: "string" },
        subject: { bsonType: "string" },
        description: { bsonType: "string" },
        category: {
          enum: ["billing", "technical", "account", "other"],
        },
        priority: {
          enum: ["low", "medium", "high", "urgent"],
        },
        status: {
          enum: ["open", "in-progress", "resolved", "closed"],
        },
        assignedTo: { bsonType: "objectId" },
        messages: {
          bsonType: "array",
          items: {
            bsonType: "object",
            properties: {
              author: { bsonType: "objectId" },
              message: { bsonType: "string" },
              attachments: { bsonType: "array" },
              timestamp: { bsonType: "date" },
            },
          },
        },
        createdAt: { bsonType: "date" },
        resolvedAt: { bsonType: "date" },
      },
    },
  },
});

// Create indexes
db.supportTickets.createIndex({ customerId: 1 });
db.supportTickets.createIndex({ status: 1 });
db.supportTickets.createIndex({ priority: 1 });

// ==================== SAMPLE DATA ====================

// Insert sample customer
db.customers.insertOne({
  companyName: "Demo Company",
  businessEmail: "demo@example.com",
  password: "$2a$10$...", // hashed password
  phone: "+1-234-567-8900",
  country: "United States",
  address: "123 Demo Street",
  taxId: "12-3456789",
  resellerCode: "RSL-1234567890",
  status: "active",
  totalUsers: 0,
  totalCost: 0,
  createdAt: new Date(),
});

// ==================== VIEW DEFINITIONS (Analytics) ====================

// Revenue by month
db.createCollection("view_monthly_revenue", {
  viewOn: "orders",
  pipeline: [
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        totalRevenue: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } },
  ],
});

// Customer with most orders
db.createCollection("view_top_customers", {
  viewOn: "orders",
  pipeline: [
    {
      $group: {
        _id: "$customerId",
        totalSpent: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { totalSpent: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },
  ],
});

// Active subscriptions
db.createCollection("view_active_subscriptions", {
  viewOn: "subscriptions",
  pipeline: [
    {
      $match: { status: "active" },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        totalSeats: { $sum: "$seats" },
        totalMonthlyRevenue: { $sum: "$monthlyPrice" },
      },
    },
  ],
});

// ==================== TRANSACTION SETTINGS ====================
// Enable multi-document ACID transactions
db.adminCommand({ setFeatureCompatibilityVersion: "4.4" });

// ==================== EXPORT SCHEMA ====================
// To export this schema:
// mongodump --uri "mongodb://localhost:27017/workspace-reseller" --out ./backup

// To import:
// mongorestore --uri "mongodb://localhost:27017/workspace-reseller" ./backup
