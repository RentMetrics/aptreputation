// Pricing and the current sign-up offer, in one place so the checkout, the
// site and the emails always agree.

export const LIST_PRICE = 99;

/** New subscriptions started before `endsAt` pay `price` per property for their first `months` months. */
export const PROMO = {
  price: 49,
  months: 12,
  /** Midnight at the end of December 31, 2026, Mountain Time. */
  endsAt: Date.UTC(2027, 0, 1, 7),
  deadline: "December 31",
  name: "2027 special",
  /** The Stripe coupon, created on first use. 50.51% off $99 is $49. */
  couponId: "special-2027-49",
  percentOff: "50.51",
};

export const promoActive = (now: number) => now < PROMO.endsAt;

/** One sentence for pages and emails, or null once the offer has ended. */
export function promoLine(now: number): string | null {
  return promoActive(now)
    ? `${PROMO.name}: subscribe by ${PROMO.deadline} and pay $${PROMO.price} per property a month for your first ${PROMO.months} months, instead of $${LIST_PRICE}.`
    : null;
}
