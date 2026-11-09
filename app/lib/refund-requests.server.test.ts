import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import {
  categories,
  coupons,
  courses,
  CourseStatus,
  enrollments,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  RefundRequestStatus,
  refundRequests,
  RefundStatus,
  teams,
  UserRole,
  users,
} from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  getRefundRequestDetail,
  getRefundRequestsForLearner,
  hasApprovedRefundRequest,
  listOpenRefundRequests,
} from "~/lib/refund-requests.server";

vi.mock("~/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("~/db/schema");

  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, getSqlite: () => sqlite };
});

let supportTeamMember: number;
let learner: number;
let course: number;
let team: number;
let uniqueCounter = 0;

function createUser(name: string, role = UserRole.Student) {
  uniqueCounter += 1;
  return db
    .insert(users)
    .values({ name, email: `${uniqueCounter}@example.com`, role })
    .returning()
    .get().id;
}

function createCourse() {
  uniqueCounter += 1;
  const category = db
    .insert(categories)
    .values({ name: "Topic", slug: `topic-${uniqueCounter}` })
    .returning()
    .get().id;
  return db
    .insert(courses)
    .values({
      title: `Course ${uniqueCounter}`,
      slug: `course-${uniqueCounter}`,
      description: "A course",
      salesCopy: "Buy it.",
      instructorId: supportTeamMember,
      categoryId: category,
      status: CourseStatus.Published,
      price: 7900,
    })
    .returning()
    .get().id;
}

function createPurchase(userId: number, courseId: number, amountPaid: number) {
  return db
    .insert(purchases)
    .values({ userId, courseId, amountPaid })
    .returning()
    .get().id;
}

function raiseRefundRequest(purchaseId: number, requestedAt?: string) {
  return db
    .insert(refundRequests)
    .values({
      purchaseId,
      reason: "It was not what I expected.",
      ...(requestedAt ? { requestedAt } : {}),
    })
    .returning()
    .get().id;
}

function createSeats(purchaseId: number, courseId: number, count: number) {
  return Array.from({ length: count }, () => {
    uniqueCounter += 1;
    return db
      .insert(coupons)
      .values({
        teamId: team,
        courseId,
        code: `CODE-${uniqueCounter}`,
        purchaseId,
      })
      .returning()
      .get().id;
  });
}

function claimSeat(couponId: number, userId: number) {
  db.update(coupons)
    .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
    .where(eq(coupons.id, couponId))
    .run();
}

function isEnrolled(userId: number) {
  return (
    db
      .select()
      .from(enrollments)
      .where(eq(enrollments.userId, userId))
      .all().length > 0
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  supportTeamMember = createUser("Support", UserRole.Admin);
  learner = createUser("Liam");
  course = createCourse();
  team = db.insert(teams).values({}).returning().get().id;
});

describe("approving a Refund Request", () => {
  it("on a personal purchase creates a Pending Refund for the full amount and ends access", () => {
    const purchase = createPurchase(learner, course, 7900);
    db.insert(enrollments).values({ userId: learner, courseId: course }).run();
    const id = raiseRefundRequest(purchase);

    expect(approveRefundRequest(id, supportTeamMember).outcome).toBe(
      "approved"
    );

    const detail = getRefundRequestDetail(id)!;
    expect(detail.status).toBe(RefundRequestStatus.Approved);
    expect(detail.refund).toEqual({
      amount: 7900,
      status: RefundStatus.Pending,
      refundedSeats: 0,
    });
    expect(detail.decidedByName).toBe("Support");
    expect(isEnrolled(learner)).toBe(false);
  });

  it("keeps the Learner's lesson progress when access ends", () => {
    const purchase = createPurchase(learner, course, 7900);
    db.insert(enrollments).values({ userId: learner, courseId: course }).run();
    const module = db
      .insert(modules)
      .values({ courseId: course, title: "One", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(lessons)
      .values({ moduleId: module.id, title: "One", position: 1 })
      .returning()
      .get();
    db.insert(lessonProgress)
      .values({
        userId: learner,
        lessonId: lesson.id,
        status: LessonProgressStatus.Completed,
      })
      .run();

    approveRefundRequest(raiseRefundRequest(purchase), supportTeamMember);

    expect(
      db
        .select()
        .from(lessonProgress)
        .where(eq(lessonProgress.userId, learner))
        .all()
    ).toHaveLength(1);
  });

  it("on a team purchase refunds only unclaimed Seats and stops their codes", () => {
    const purchase = createPurchase(learner, course, 39500);
    db.insert(enrollments).values({ userId: learner, courseId: course }).run();
    const [firstSeat] = createSeats(purchase, course, 5);
    claimSeat(firstSeat, createUser("Colleague"));
    const id = raiseRefundRequest(purchase);

    expect(getRefundRequestDetail(id)!.refundIfApproved).toEqual({
      amount: 31600,
      refundedSeats: 4,
    });

    approveRefundRequest(id, supportTeamMember);

    expect(getRefundRequestDetail(id)!.refund).toEqual({
      amount: 31600,
      status: RefundStatus.Pending,
      refundedSeats: 4,
    });
    const claimed = db
      .select()
      .from(coupons)
      .where(eq(coupons.id, firstSeat))
      .get()!;
    expect(claimed.refundId).toBeNull();
    expect(isEnrolled(learner)).toBe(true);
  });

  it("is refused when every Seat has been claimed, and the request stays Open", () => {
    const purchase = createPurchase(learner, course, 15800);
    const colleague = createUser("Colleague");
    createSeats(purchase, course, 2).forEach((seat) =>
      claimSeat(seat, colleague)
    );
    const id = raiseRefundRequest(purchase);

    expect(getRefundRequestDetail(id)!.canApprove).toBe(false);
    expect(approveRefundRequest(id, supportTeamMember).outcome).toBe(
      "nothing-to-refund"
    );
    expect(getRefundRequestDetail(id)!.status).toBe(RefundRequestStatus.Open);
  });

  it("marks the purchase as having an Approved Refund Request", () => {
    const purchase = createPurchase(learner, course, 7900);

    approveRefundRequest(raiseRefundRequest(purchase), supportTeamMember);

    expect(hasApprovedRefundRequest(purchase)).toBe(true);
  });
});

describe("declining a Refund Request", () => {
  it("records the Reason for Decline, creates no Refund, and keeps access", () => {
    const purchase = createPurchase(learner, course, 7900);
    db.insert(enrollments).values({ userId: learner, courseId: course }).run();
    const id = raiseRefundRequest(purchase);

    expect(
      declineRefundRequest(id, supportTeamMember, "Outside our policy.").outcome
    ).toBe("declined");

    const detail = getRefundRequestDetail(id)!;
    expect(detail.status).toBe(RefundRequestStatus.Declined);
    expect(detail.reasonForDecline).toBe("Outside our policy.");
    expect(detail.refund).toBeNull();
    expect(isEnrolled(learner)).toBe(true);
  });
});

describe("decisions are final", () => {
  it("tells a second Support Team Member the request was already decided", () => {
    const purchase = createPurchase(learner, course, 7900);
    const id = raiseRefundRequest(purchase);
    approveRefundRequest(id, supportTeamMember);

    expect(approveRefundRequest(id, supportTeamMember).outcome).toBe(
      "already-decided"
    );
    expect(
      declineRefundRequest(id, supportTeamMember, "Too late.").outcome
    ).toBe("already-decided");
    expect(getRefundRequestDetail(id)!.status).toBe(
      RefundRequestStatus.Approved
    );
  });

  it("reports a Refund Request that doesn't exist", () => {
    expect(approveRefundRequest(999999, supportTeamMember).outcome).toBe(
      "not-found"
    );
  });
});

describe("the Open Refund Requests list", () => {
  it("shows only Open Refund Requests, oldest first, with earlier outcomes across purchases", () => {
    const otherLearner = createUser("Sophia");
    const otherCourse = createCourse();

    const approved = raiseRefundRequest(
      createPurchase(learner, otherCourse, 5000),
      "2026-01-01T12:00:00.000Z"
    );
    approveRefundRequest(approved, supportTeamMember);
    const declined = raiseRefundRequest(
      createPurchase(learner, course, 7900),
      "2026-01-02T12:00:00.000Z"
    );
    declineRefundRequest(declined, supportTeamMember, "No.");

    const newest = raiseRefundRequest(
      createPurchase(learner, course, 7900),
      "2026-03-01T12:00:00.000Z"
    );
    const oldest = raiseRefundRequest(
      createPurchase(otherLearner, course, 7900),
      "2026-02-01T12:00:00.000Z"
    );

    const rows = listOpenRefundRequests().filter((row) =>
      [newest, oldest, approved, declined].includes(row.id)
    );

    expect(rows.map((row) => row.id)).toEqual([oldest, newest]);
    expect(rows[1]).toMatchObject({ earlierApproved: 1, earlierDeclined: 1 });
    expect(rows[0]).toMatchObject({ earlierApproved: 0, earlierDeclined: 0 });
  });
});

describe("what the Learner sees", () => {
  it("includes decided Refund Requests with the Reason for Decline", () => {
    const purchase = createPurchase(learner, course, 7900);
    declineRefundRequest(
      raiseRefundRequest(purchase),
      supportTeamMember,
      "Outside our policy."
    );

    expect(getRefundRequestsForLearner(learner)).toEqual([
      expect.objectContaining({
        status: RefundRequestStatus.Declined,
        reasonForDecline: "Outside our policy.",
        refundAmount: null,
      }),
    ]);
  });
});
