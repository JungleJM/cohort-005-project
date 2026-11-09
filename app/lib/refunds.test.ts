import { describe, expect, it } from "vitest";
import {
  calculateLessonWatchTime,
  calculateRefund,
  dayOfRefundWindow,
  formatWatchTime,
  hasReachedRefundLimit,
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

describe("calculateLessonWatchTime", () => {
  it("counts video played straight through", () => {
    expect(calculateLessonWatchTime([0, 10, 20, 30])).toBe(30);
  });

  it("adds nothing for rewatching the same video", () => {
    expect(calculateLessonWatchTime([0, 10, 20, 0, 10, 20])).toBe(20);
  });

  it("does not count video skipped over", () => {
    expect(calculateLessonWatchTime([0, 10, 2400, 2410])).toBe(20);
  });

  it("counts video played at double speed in full", () => {
    expect(calculateLessonWatchTime([0, 20, 40])).toBe(40);
  });

  it("is zero with nothing to measure between", () => {
    expect(calculateLessonWatchTime([])).toBe(0);
    expect(calculateLessonWatchTime([2400])).toBe(0);
  });
});

describe("hasReachedRefundLimit", () => {
  const underEveryLimit = {
    watchTimeSeconds: 0,
    lessonsCompleted: 0,
    totalLessons: 10,
  };

  it("is false under both limits", () => {
    expect(hasReachedRefundLimit(underEveryLimit)).toBe(false);
  });

  it("is reached at two hours of Watch Time", () => {
    expect(
      hasReachedRefundLimit({ ...underEveryLimit, watchTimeSeconds: 7199 })
    ).toBe(false);
    expect(
      hasReachedRefundLimit({ ...underEveryLimit, watchTimeSeconds: 7200 })
    ).toBe(true);
  });

  it("is reached at half the lessons completed", () => {
    expect(
      hasReachedRefundLimit({ ...underEveryLimit, lessonsCompleted: 4 })
    ).toBe(false);
    expect(
      hasReachedRefundLimit({ ...underEveryLimit, lessonsCompleted: 5 })
    ).toBe(true);
  });

  it("is false for a course with no lessons", () => {
    expect(
      hasReachedRefundLimit({
        watchTimeSeconds: 0,
        lessonsCompleted: 0,
        totalLessons: 0,
      })
    ).toBe(false);
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
