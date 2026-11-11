
export const sellerData = {
  sellerName: "Aarav Sharma",
  storeName: "Aarav Lifestyle Store",
  period: "November 2026",
  metrics: {
    sales: {
      previous: 200000,
      current: 135000,
      change: -32.5
    },
    orders: {
      previous: 400,
      current: 270,
      change: -32.5
    },
    cancellationRate: {
      previous: 8,
      current: 14,
      change: 6
    },
    averageSellingPrice: {
      previous: 500,
      current: 500
    },
    outOfStock: {
      previous: 5,
      current: 18,
      change: 13
    }
  },
  recommendations: [
    {
      id: 1,
      title: "Fix inventory availability",
      description: "Identify and replenish the 18 unavailable products, prioritising bestsellers.",
      priority: "High",
      impact: "Inventory recovery",
      status: "pending"
    },
    {
      id: 2,
      title: "Reduce order cancellations",
      description: "Improve stock accuracy and check product availability before accepting orders.",
      priority: "High",
      impact: "Cancellation rate",
      status: "pending"
    },
    {
      id: 3,
      title: "Investigate product visibility",
      description: "Compare product impressions and views against the previous month.",
      priority: "Medium",
      impact: "Order volume",
      status: "pending"
    }
  ],
  recoveryGoals: [
    {
      label: "Cancellation rate",
      current: 14,
      target: 8,
      unit: "%"
    },
    {
      label: "Out-of-stock products",
      current: 18,
      target: 5,
      unit: " products"
    }
  ]
};
