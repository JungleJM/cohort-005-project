import { describe, expect, it } from "vitest";
import {
  calculateRefund,
  dayOfRefundWindow,
  formatWatchTime,
  isEverySeatClaimed,
} from "./refunds";

describe("calculateRefund", () => {
  it("refunds a personal purchase in full", () => {
    expect(calculateRefund(7900, { total: 0, claimed: 0 })).toEqual({
      amount: 7900,
      refundedSeats: 0,
    });
  });

  it("leaves out the price of Claimed Seats", () => {
    expect(calculateRefund(39500, { total: 5, claimed: 1 })).toEqual({
      amount: 31600,
      refundedSeats: 4,
    });
  });

  it("refunds a team purchase in full when no Seat is claimed", () => {
    expect(calculateRefund(39500, { total: 5, claimed: 0 })).toEqual({
      amount: 39500,
      refundedSeats: 5,
    });
  });
});

describe("isEverySeatClaimed", () => {
  it("is false for a purchase with no Seats", () => {
    expect(isEverySeatClaimed({ total: 0, claimed: 0 })).toBe(false);
  });

  it("is true only when no unclaimed Seat is left", () => {
    expect(isEverySeatClaimed({ total: 2, claimed: 1 })).toBe(false);
    expect(isEverySeatClaimed({ total: 2, claimed: 2 })).toBe(true);
  });
});

describe("dayOfRefundWindow", () => {
  it("counts whole calendar days from the purchase", () => {
    expect(
      dayOfRefundWindow("2026-03-01T23:00:00", "2026-03-11T08:00:00")
    ).toBe(10);
  });

  it("calls the day of purchase day 0", () => {
    expect(
      dayOfRefundWindow("2026-03-01T08:00:00", "2026-03-01T23:00:00")
    ).toBe(0);
  });
});

describe("formatWatchTime", () => {
  it("shows hours and minutes", () => {
    expect(formatWatchTime(3900)).toBe("1h 5m");
  });

  it("shows only minutes under an hour", () => {
    expect(formatWatchTime(125)).toBe("2m");
  });
});
