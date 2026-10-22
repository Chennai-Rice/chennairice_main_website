/* Shipping Policy and Return & Refund Policy, as approved (PDFs, October 2026).
   Each section has any of: paragraphs, list, steps (numbered), table, after. */

const OPERATOR = 'This website is operated by Chennai Rice Industries India Private Limited, SF No. 116/1,2,4-B, N. Thayirpalayam Village, Nasiyanur, Gangapuram Post, Erode, Tamil Nadu – 638102 (GSTIN 33AAFCC1691K1ZM, FSSAI Licence 12415007000253).'

export const POLICY_CONTACT = {
  hours: 'Reach us any working day, 9:30 AM – 6:30 PM, with your order number:',
  phone: '+91 70666 46667',
  phoneHref: 'tel:+917066646667',
  whatsappHref: 'https://wa.me/917066646667',
  email: 'support@chennairiceindustries.com',
}

export const SHIPPING_POLICY = {
  lastUpdated: 'October 2026',
  intro: [`${OPERATOR} This policy explains how we pack, ship and deliver orders placed on our website.`],
  sections: [
    {
      title: '1. Where we deliver',
      paragraphs: ['We deliver across India through trusted courier partners.'],
      list: [
        'Enter your pincode on the product page to check if we deliver to your area.',
        'If a pincode is not serviceable, you will see this before you place the order.',
      ],
    },
    {
      title: '2. Order processing and dispatch',
      paragraphs: ['Once your payment is confirmed, you receive an order confirmation by SMS / WhatsApp / email.'],
      list: [
        'We pack and hand over your order to our courier partner within approximately 1–2 working days of a confirmed order.',
        'Every pack is sealed at our facility and packed in a protective outer carton or bag for safe transit.',
      ],
    },
    {
      title: '3. Estimated delivery',
      paragraphs: ["Once your order is dispatched, the estimated delivery date is shown on our courier partner's tracking page."],
      list: ['All delivery dates and timelines shared are estimates, not guaranteed dates.'],
    },
    {
      title: '4. Shipping charges',
      paragraphs: ['The delivery charge is shown clearly at checkout, along with the product price and taxes, as one final total before you pay. There are no hidden charges at the doorstep.'],
      list: [
        'Delivery charges depend on the weight of the order and your delivery location.',
        'Any free-delivery offer (for example, above a minimum order value) is shown on the website and applied automatically at checkout.',
        'Our product prices never go above the MRP printed on the pack.',
      ],
    },
    {
      title: '5. Tracking your order',
      paragraphs: ['As soon as your order is dispatched, we send you a tracking link by SMS / WhatsApp / email so you can follow it until it reaches you.'],
      link: { to: '/track-order', label: 'Track your order' },
    },
    {
      title: '6. Address and delivery attempts',
      list: [
        'Please give a complete address, a nearby landmark and a phone number that will be reachable on the delivery day.',
        'Once an order is dispatched, the delivery address cannot be changed.',
        'Our courier partner will make up to 3 delivery attempts. If you are not available, they may call you to reschedule.',
      ],
    },
    {
      title: '7. Undelivered orders',
      paragraphs: ['If an order comes back to us because the address was incorrect or incomplete, the phone was unreachable after all attempts, or the parcel was refused without a valid reason:'],
      list: [
        'We will refund the amount you paid minus the actual delivery and return-courier charges.',
        'We will always tell you the exact deduction before processing the refund.',
        'The refund is made within 5–7 working days of the parcel reaching us.',
      ],
    },
    {
      title: '8. Receiving your order',
      paragraphs: ['A quick 1-minute check at delivery protects you and helps us solve any issue the same day.'],
      list: [
        'If the outer carton or bag is visibly torn, wet, open or tampered with, you may refuse the parcel, or accept it and ask the delivery person to note the damage. Either way, tell us — you will not be charged.',
        'Report any damaged, wrong, missing or short-weight item within 48 hours of delivery. Our Return & Refund Policy explains what happens next.',
      ],
      link: { to: '/refund', label: 'Return & Refund Policy' },
    },
  ],
  closing: [
    'We may update this policy from time to time. The version shown on the website when you place your order is the one that applies to that order.',
    'This policy is framed in line with the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.',
  ],
}

export const REFUND_POLICY = {
  lastUpdated: 'October 2026',
  intro: [OPERATOR],
  sections: [
    {
      title: '1. Our promise',
      paragraphs: [
        'If your rice reaches you damaged, wrong, short in weight or not up to our quality, we will replace it or refund you in full — quickly and fairly.',
        'Rice is a food product. For your safety and the safety of every other customer, we cannot resell food that has left our hands. So this policy is built around fixing problems quickly, not around sending rice back and forth.',
      ],
    },
    {
      title: '2. Problems we cover',
      table: {
        head: ['Problem', 'Report within', 'What we need'],
        rows: [
          ['Pack torn, leaking or damaged in transit', '48 hours of delivery', 'Photos of the outer package and the damaged pack'],
          ['Wrong product, variety or pack size sent', '48 hours of delivery', 'Photo of the pack received'],
          ['Item missing from the order', '48 hours of delivery', 'Unboxing video and photos of the package'],
          ['Pack weighs less than the net weight printed', '48 hours of delivery', 'Unboxing video and photo of the unopened pack on a weighing scale'],
          ['Expired product, or less than the shelf life shown on the website', '7 days of delivery', 'Photo of the date / batch details on the pack'],
          ['Quality problem in an unopened or just-opened pack — insects, foul smell, fungus, stones or foreign matter', '7 days of delivery', 'Photos / video and the batch number; please keep the remaining rice until we close your request'],
        ],
      },
    },
    {
      title: '3. How to raise a request',
      paragraphs: ['WhatsApp or email us with:'],
      steps: [
        'Your order number',
        'The batch number printed on the pack',
        'Photos of the outer box, shipping label and product',
        'An unboxing video for missing-item or short-weight claims — starting with the sealed parcel (label visible) and running without a cut until everything is unpacked',
        'A one-line description of the problem',
      ],
      after: ['You will get a ticket number to track your request. We reply within 48 hours and share a decision within 3 working days of receiving these details.'],
    },
    {
      title: '4. Replacement or refund — your choice',
      paragraphs: ['Once the issue is verified, you choose a free replacement or a full refund of the amount paid for that item, including its delivery charge.'],
      list: [
        'In most cases we will not ask you to send the rice back — your photos and video are enough. If we need the pack for quality testing, we will arrange the pickup free of charge.',
        'Replacements are sent subject to stock. If the same product is not available, we will refund you in full instead.',
        'Please do not send any product back without speaking to us first — parcels returned without our approval cannot be accepted.',
      ],
    },
    {
      title: '5. What we cannot take back',
      paragraphs: ['Because rice is a food item, we cannot accept returns for reasons that are not a fault in the product or delivery:'],
      list: [
        'Change of mind after the order has been dispatched — for example, ordered the wrong variety by mistake or no longer need it.',
        'Personal taste preference — grain size, cooking style or aroma that is as described on the product page.',
        'Issues that start after delivery due to storage — moisture, insects or smell that appear later because the rice was kept in a damp, hot or open place. Please store rice in a cool, dry, airtight container.',
        'Packs that have been largely used, mixed with other rice, or moved into another container, unless the problem was present from the start.',
        'Problems reported after the time windows in point 2, unless you could not report earlier for a genuine reason — just tell us and we will look into it fairly.',
        'Free gifts given with an offer cannot be refunded separately.',
      ],
      after: ['Natural variation is normal in rice: small differences in colour, grain length or cooking time between harvests and batches are not defects.'],
    },
    {
      title: '6. Cancellations',
      list: [
        'You can cancel any order free of charge before it is dispatched, from your account or by contacting us.',
        'Once dispatched, an order cannot be cancelled.',
        'We may cancel an order if an item is out of stock, the pincode is not serviceable, or there is a clear pricing error. In that case you get a full refund and we will tell you why.',
      ],
    },
    {
      title: '7. Refund amount and timeline',
      table: {
        head: ['Situation', 'Refund amount', 'Refund time'],
        rows: [
          ['Cancelled before dispatch', '100% of amount paid', 'Started within 24 hours'],
          ['Damaged, wrong, missing, short-weight, expired or quality issue', '100% of item value + its delivery charge', 'Within 5–7 working days of approval'],
          ['Returned undelivered due to wrong address / unreachable / refusal without reason', 'Amount paid minus actual courier charges both ways', 'Within 5–7 working days of the parcel reaching us'],
        ],
      },
      list: [
        'Refunds go back to the original payment method (UPI, card, net banking or wallet).',
        'If you used a coupon, discount or combo offer, the refund is based on the amount you actually paid for that item.',
        "Refund not received? First check with your bank or UPI app, as banks can take a few extra days. If it still hasn't arrived 10 working days after approval, contact us with your ticket number and we will trace it for you.",
      ],
    },
  ],
  closing: [
    'Fair use: this policy is built on trust. If we see repeated claims that do not match our dispatch records, we may ask for additional proof before approving further requests.',
    'Policy updates: we may update this policy from time to time. The version shown on the website when you place your order is the one that applies to that order. This policy does not limit any of your rights under the Consumer Protection Act, 2019 and the Consumer Protection (E-Commerce) Rules, 2020.',
  ],
}
