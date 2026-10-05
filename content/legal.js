// DEFAULT legal pages. They are shown until an admin saves their own version in the team area (Legal pages).
// IMPORTANT: this is a DRAFT built only from how the store actually works. It is not legal advice.
// Have a Nigerian lawyer review it (NDPA 2023 duties: consent, retention, breach notice) before going live.
//
// Format: "# Heading", "## Sub-heading", "- list item", blank line between paragraphs.
// Tokens filled in automatically from the saved Settings: {{name}} {{email}} {{phone}} {{address}} {{hours}} {{lagosFee}} {{otherFee}} {{freeThreshold}} {{lagosDays}} {{otherDays}} {{returnDays}}

export const LEGAL_SLUGS = ['privacy', 'terms', 'returns'];

export const LEGAL_DEFAULTS = {
  privacy: {
    title: 'Privacy Policy',
    body: `This policy explains what personal information {{name}} ("we", "us") collects when you use our website, why we collect it, and the choices you have.

# What we collect
- Order details: your name, email address, phone number, delivery address and delivery notes, and what you bought.
- Messages you send us through the contact form, and your email address if you subscribe to our newsletter.
- Basic technical data needed to keep the site secure, such as your IP address, which we use briefly to limit abuse.

We do not collect your card details. Payments are made on Paystack's secure page.

# Why we use it
- To process and deliver your order, and to send you updates about it.
- To answer your questions and handle returns or complaints.
- To send newsletters, only if you subscribed.
- To keep our records, meet legal and accounting duties, and protect the site from fraud and misuse.

# Who we share it with
We share information only with the services we need to run the store:
- Paystack, which processes your payment.
- Our hosting and database providers, which store the site's data.
- Our email provider, which sends order and delivery emails.
- Our delivery partners, who receive your name, phone number and address so they can deliver.

We do not sell your personal information. Some of these providers may store or process data outside Nigeria.

# Cookies and similar storage
We do not use advertising or tracking cookies. Your browser stores your bag, wishlist, recent searches and promo code on your own device so the shop works. You can clear them in your browser settings.

# How long we keep it
We keep order and customer records for as long as needed to fulfil orders, handle returns and complaints, keep accounting and tax records, and meet legal obligations.

# Your choices
You can ask us to show you the information we hold about you, correct it, or delete it where the law allows. You can ask to be removed from our mailing list at any time. Contact us using the details below.

# Children
Our site is not meant for children under 18 to buy from without a parent or guardian.

# Changes
We may update this policy. The date at the top of this page shows when it was last changed.

# Contact
{{name}}, {{address}}
Email: {{email}} · Phone: {{phone}}`,
  },

  terms: {
    title: 'Terms of Sale',
    body: `By placing an order on this website you agree to these terms. Please read them with our Privacy Policy and Returns Policy.

# Who we are
{{name}}, {{address}}. Email {{email}}, phone {{phone}}.

# Prices and payment
- All prices are in Nigerian Naira (₦).
- Payment is made online through Paystack. Your order is confirmed when Paystack confirms your payment.
- We check prices and stock when you pay. If a product has sold out in the meantime, we will contact you to offer a replacement or a refund.

# Delivery
- Lagos: {{lagosFee}} (free on orders over {{freeThreshold}}), usually {{lagosDays}}.
- Other Nigerian states: {{otherFee}}, usually {{otherDays}}.
- Delivery times are estimates, not guarantees. Please give a complete address and a phone number that is reachable.

# Cancelling an order
You can cancel before your order ships. Message us on WhatsApp with your order number.

# Returns
Please see our Returns Policy.

# Products
We take care to describe products accurately, but colours, packaging and sizes may differ slightly from the pictures. Read the ingredients and directions, and do a patch test before first use. If you have allergies or a medical condition, ask a professional before using a product.

# Spa and wellness bookings
Spa treatments are booked through WhatsApp and are confirmed only when we reply with a time.

# Our responsibility
Nothing in these terms limits your rights under Nigerian consumer law. Beyond that, we are not responsible for losses we could not reasonably have foreseen, or for delays caused by events outside our control.

# Governing law
These terms are governed by the laws of the Federal Republic of Nigeria.

# Changes
We may update these terms. The version on this page when you place your order applies to that order.`,
  },

  returns: {
    title: 'Returns Policy',
    body: `We want you to be happy with your order. Here is how returns and replacements work.

# Unopened products
Unopened products can be returned within {{returnDays}} days of delivery.

# Damaged or incorrect items
If an item arrives damaged or is not what you ordered, we will replace it at no cost. Message us on WhatsApp with a photo.

# How to start a return
- Message us on WhatsApp or email {{email}}.
- Give your order number and tell us what is wrong, with a photo if the item is damaged or incorrect.
- We will tell you what to do next, and how and when your replacement or refund will be handled.

# Items we cannot take back
For hygiene and safety reasons, opened products cannot be returned unless they were damaged or incorrect when they arrived.

# Contact
{{name}}, {{address}}
Email: {{email}} · Phone: {{phone}}`,
  },
};
