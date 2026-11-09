export const REFUND_WINDOW_DAYS = 14;

export interface SeatCounts {
  total: number;
  claimed: number;
}

export interface RefundCalculation {
  amount: number;
  refundedSeats: number;
}

export function isTeamPurchase(seats: SeatCounts): boolean {
  return seats.total > 0;
}

export function isEverySeatClaimed(seats: SeatCounts): boolean {
  return isTeamPurchase(seats) && seats.claimed >= seats.total;
}

/**
 * A Refund is the full amount paid, less the price of any Claimed Seats. A
 * purchase with no Seats is refunded in full.
 */
export function calculateRefund(
  amountPaid: number,
  seats: SeatCounts
): RefundCalculation {
  if (!isTeamPurchase(seats)) {
    return { amount: amountPaid, refundedSeats: 0 };
  }

  const refundedSeats = seats.total - seats.claimed;
  return {
    amount: Math.round((amountPaid * refundedSeats) / seats.total),
    refundedSeats,
  };
}

function startOfLocalDay(iso: string): number {
  const when = new Date(iso);
  return new Date(
    when.getFullYear(),
    when.getMonth(),
    when.getDate()
  ).getTime();
}

/**
 * Which day of the Refund Window a Refund Request was raised on, counted in
 * whole calendar days from the purchase. The day of purchase is day 0.
 */
export function dayOfRefundWindow(
  purchasedAtIso: string,
  requestedAtIso: string
): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (startOfLocalDay(requestedAtIso) - startOfLocalDay(purchasedAtIso)) /
      millisecondsPerDay
  );
}

export function formatWatchTime(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
