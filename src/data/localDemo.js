const seller = {
  previous: {
    sales: 200000,
    orders: 400,
    cancellations: 8,
    stockouts: 5,
    asp: 500
  },
  current: {
    sales: 135000,
    orders: 270,
    cancellations: 14,
    stockouts: 18,
    asp: 500
  }
};

const money = (value) => `₹${value.toLocaleString("en-IN")}`;

export function generateLocalDemoReply(history) {
  const userMessages = history
    .filter((message) => message.role === "seller")
    .map((message) => message.text.toLowerCase());

  const assistantMessages = history
    .filter((message) => message.role === "assistant")
    .map((message) => message.text.toLowerCase());

  const latest = userMessages.at(-1) || "";
  const allSellerText = userMessages.join(" ");

  const askedInventory = assistantMessages.some(
    (text) => text.includes("replenish") || text.includes("inventory")
  );

  const askedCancellation = assistantMessages.some(
    (text) => text.includes("cancellation") || text.includes("cancelled")
  );

  const askedVisibility = assistantMessages.some(
    (text) => text.includes("product views") || text.includes("impressions")
  );

  const inventoryMention =
    /stock|inventory|replenish|out of stock|unavailable/.test(allSellerText);

  const cancellationMention =
    /cancel|cancellation|cancelled/.test(allSellerText);

  const visibilityMention =
    /views|impressions|traffic|visibility|visitors/.test(allSellerText);

  const confirmsInventory =
    /yes|popular|bestseller|out of stock|unavailable|shortage|delay|not enough/.test(latest);

  const deniesInventory =
    /no stock issue|inventory is fine|enough stock|not an inventory|no shortage/.test(latest);

  const unknown =
    /don't know|do not know|not sure|haven't checked|have not checked|no idea/.test(latest);

  // Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(latest)) {
    return "Hello Aarav. What would you like to work on today: sales performance, inventory, cancellations or product visibility?";
  }

  // Summary request
  if (/summary|summarise|summarize|wrap up|finish/.test(latest)) {
    return buildLocalSummary(history);
  }

  // Recommendations request
  if (/recommend|what should i do|next steps|action plan/.test(latest)) {
    return "Based on the figures available, I would prioritise three actions. First, identify the 18 unavailable products and replenish the bestsellers; track the out-of-stock count against the previous level of 5. Second, review cancellation reasons and improve stock accuracy before accepting orders; track the cancellation rate against 8%. Third, compare product impressions and views with last month before changing listings or pricing. These are investigation-led actions, not guaranteed recovery outcomes. Would you like to start with inventory or cancellations?";
  }

  // Main sales decline concern
  if (/why.*sales|sales.*drop|sales.*declin|fewer orders|less orders/.test(latest)) {
    return `I understand. Your sales moved from ${money(seller.previous.sales)} to ${money(seller.current.sales)}, a decline of 32.5%. Orders also fell from 400 to 270, while the average selling price stayed at ₹500. So the figures point to lower order volume, not a lower average selling price. Stockouts increased from 5 products to 18. Have popular products been unavailable recently, or have you faced replenishment delays?`;
  }

  // Seller needs guidance
  if (unknown && /what.*check|where.*start|first/.test(latest)) {
    return "Start with the 18 products currently marked out of stock. Check which of them were bestsellers, when each became unavailable, and whether the listing inventory matches your physical stock. Then review the cancellation reasons for the same period. Which of those checks can you access first?";
  }

  // Inventory confirmation
  if (
    inventoryMention &&
    confirmsInventory &&
    (askedInventory || /popular|out of stock|shortage|replenish/.test(latest))
  ) {
    if (/two weeks|2 weeks|fortnight/.test(latest)) {
      return "That timing is useful. If popular products were unavailable for around two weeks, that could have limited order opportunities during that period. The dashboard shows 18 products out of stock, compared with 5 last month. Which products were affected, and have they been replenished yet?";
    }

    return "That could be contributing to the lower order volume, although we cannot attribute the full 32.5% decline to stockouts from these figures alone. There are 18 out-of-stock products now, compared with 5 last month. Are the affected products mainly your bestsellers, and how quickly can you replenish them?";
  }

  // Seller denies inventory problems
  if (deniesInventory && inventoryMention) {
    return "Thanks, that makes inventory less likely to be the main issue based on what you've observed. The cancellation rate has still risen from 8% to 14%. Do you know whether those cancellations are mainly customer-initiated, stock-related, or caused by dispatch delays?";
  }

  // Visibility investigation
  if (visibilityMention && /view|impression|traffic|visitor/.test(latest)) {
    return "We don't have impressions, product views or traffic history in the supplied data, so I can't confirm whether visibility has fallen. Compare this month's impressions and product views with last month, then check conversion rate if available. Have you noticed fewer customer visits, or is that data not available to you yet?";
  }

  // Cancellation linked to inventory or fulfilment
  if (
    cancellationMention &&
    (/stock|product|ready|available|shortage/.test(latest) || askedCancellation)
  ) {
    return "That suggests inventory accuracy or fulfilment may be involved in at least some cancellations. Your cancellation rate is 14%, up from 8% last month—a rise of 6 percentage points. Check whether the cancelled orders map to the unavailable products, and verify stock before accepting orders. Are dispatch delays also happening, or are the products simply unavailable?";
  }

  // General cancellation investigation
  if (cancellationMention) {
    return "Your cancellation rate increased from 8% to 14%, a rise of 6 percentage points. That is an important issue to investigate, but the dashboard does not include cancellation reasons. Are these cancellations mainly due to stock shortages, delayed dispatches, customer requests, or something else?";
  }

  // Unknown answer or visibility concern
  if (visibilityMention || unknown) {
    return "We don't have impressions, product views or traffic history in the supplied data, so I can't confirm whether visibility has fallen. Compare this month's impressions and product views with last month, then check conversion rate if available. Have you noticed fewer customer visits, or is that data not available to you yet?";
  }

  // Pricing question
  if (/price|discount|cheaper|competitor/.test(latest)) {
    return "Your average selling price is unchanged at ₹500 in both periods. That does not establish whether your prices are competitive, because we don't have competitor or product-level pricing data. Before offering discounts, compare similar products and check whether availability or cancellations are reducing completed orders. Do you have competitor pricing for your main products?";
  }

  // Dispatch question
  if (/dispatch|delivery|late|packing|fulfil/.test(latest)) {
    return "Dispatch delays can affect cancellations and the seller experience, but we don't have dispatch-time data to measure their impact here. Review pending orders, dispatch SLA breaches and cancellation reasons for the same period. Are delays happening across the store or only for particular products?";
  }

  // General investigation paths
  if (inventoryMention && !askedInventory) {
    return "Inventory is a sensible place to investigate: out-of-stock products increased from 5 to 18. Which products are unavailable, and are any of them regular bestsellers?";
  }

  if (cancellationMention && !askedCancellation) {
    return "The cancellation rate has risen from 8% to 14%. Do you know the most common reason for those cancellations?";
  }

  if (visibilityMention && !askedVisibility) {
    return "Visibility could be one area to check, but we don't have impressions or views in the current dataset. Can you compare product impressions and views with the previous month?";
  }

  // General response
  return "I can help narrow this down. The confirmed changes are a 32.5% sales decline, a 32.5% order decline, cancellations rising from 8% to 14%, and stockouts increasing from 5 to 18. Which area have you noticed most: inventory availability, cancellations, dispatch, or customer traffic?";
}

export function buildLocalSummary(history) {
  const sellerAnswers = history
    .filter((message) => message.role === "seller")
    .map((message) => message.text.trim())
    .filter(Boolean);

  const notes = sellerAnswers.length
    ? sellerAnswers.map((answer) => `• ${answer}`).join("\n")
    : "No additional seller details were provided.";

  return `Here is the current business review for Aarav Lifestyle Store.

Observed facts:
• Sales declined from ₹2,00,000 to ₹1,35,000 (32.5%).
• Orders declined from 400 to 270 (32.5%).
• Cancellation rate increased from 8% to 14% (+6 percentage points).
• Out-of-stock products increased from 5 to 18.
• Average selling price remained ₹500.

Seller information shared:
${notes}

Recommended next steps:
1. Prioritise replenishment of high-demand products among the 18 currently out of stock; monitor the stockout count against the reference level of 5.
2. Review cancellation reasons, improve inventory accuracy and monitor the cancellation rate against the reference level of 8%.
3. Compare product impressions and views with last month before concluding that visibility is a problem.

Review these measures in seven days. The previous-month figures are reference targets, not guaranteed outcomes. Stockouts and cancellations are possible contributors; the available data does not prove they caused the entire sales decline.`;
}