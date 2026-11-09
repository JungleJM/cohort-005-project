import { data } from "react-router";
import { and, desc, asc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  RefundRequestStatus,
  refundRequests,
  refunds,
  RefundStatus,
  UserRole,
  users,
  videoWatchEvents,
} from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import {
  calculateLessonWatchTime,
  calculateRefund,
  dayOfRefundWindow,
  isEverySeatClaimed,
  isTeamPurchase,
  type Progress,
  type SeatCounts,
} from "~/lib/refunds";
import { formatPrice } from "~/lib/utils";

export async function requireSupportTeamMember(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only the Support Team can view Refund Requests.", {
      status: 403,
    });
  }

  return currentUser;
}

export function getOpenRefundRequest(purchaseId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Open)
      )
    )
    .get();
}

export function hasApprovedRefundRequest(purchaseId: number): boolean {
  const approved = db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        eq(refundRequests.status, RefundRequestStatus.Approved)
      )
    )
    .get();

  return !!approved;
}

export function getSeatCounts(purchaseId: number): SeatCounts {
  const seats = db
    .select({ redeemedAt: coupons.redeemedAt })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchaseId))
    .all();

  return {
    total: seats.length,
    claimed: seats.filter((seat) => seat.redeemedAt !== null).length,
  };
}

type DecidedRefundRequest = {
  id: number;
  learnerId: number;
  courseTitle: string;
  status: RefundRequestStatus;
  requestedAt: string;
};

function getDecidedRefundRequestsForLearners(
  learnerIds: number[]
): DecidedRefundRequest[] {
  if (learnerIds.length === 0) return [];

  return db
    .select({
      id: refundRequests.id,
      learnerId: purchases.userId,
      courseTitle: courses.title,
      status: refundRequests.status,
      requestedAt: refundRequests.requestedAt,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(
      and(
        inArray(purchases.userId, learnerIds),
        ne(refundRequests.status, RefundRequestStatus.Open)
      )
    )
    .orderBy(desc(refundRequests.requestedAt))
    .all();
}

export function listOpenRefundRequests() {
  const openRefundRequests = db
    .select({
      id: refundRequests.id,
      learnerId: users.id,
      learnerName: users.name,
      courseTitle: courses.title,
      amountPaid: purchases.amountPaid,
      requestedAt: refundRequests.requestedAt,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refundRequests.status, RefundRequestStatus.Open))
    .orderBy(asc(refundRequests.requestedAt))
    .all();

  const decided = getDecidedRefundRequestsForLearners(
    openRefundRequests.map((request) => request.learnerId)
  );

  return openRefundRequests.map((request) => {
    const earlier = decided.filter(
      (other) =>
        other.learnerId === request.learnerId &&
        other.requestedAt < request.requestedAt
    );

    return {
      ...request,
      earlierApproved: earlier.filter(
        (other) => other.status === RefundRequestStatus.Approved
      ).length,
      earlierDeclined: earlier.filter(
        (other) => other.status === RefundRequestStatus.Declined
      ).length,
    };
  });
}

/**
 * A Learner's Progress on a course, across every purchase of it. Pass `asOf`
 * to see it as it stood at that moment.
 */
export function getCourseProgress(
  learnerId: number,
  courseId: number,
  asOf?: string
): Progress {
  const lessonIds = db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((lesson) => lesson.id);

  if (lessonIds.length === 0) {
    return { watchTimeSeconds: 0, lessonsCompleted: 0, totalLessons: 0 };
  }

  const watchEvents = db
    .select({
      lessonId: videoWatchEvents.lessonId,
      positionSeconds: videoWatchEvents.positionSeconds,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, learnerId),
        inArray(videoWatchEvents.lessonId, lessonIds),
        asOf ? lte(videoWatchEvents.createdAt, asOf) : undefined
      )
    )
    .all();

  const positionsByLesson = new Map<number, number[]>();
  for (const event of watchEvents) {
    const positions = positionsByLesson.get(event.lessonId) ?? [];
    positions.push(event.positionSeconds);
    positionsByLesson.set(event.lessonId, positions);
  }

  const completed = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, learnerId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds),
        asOf ? lte(lessonProgress.completedAt, asOf) : undefined
      )
    )
    .get();

  return {
    watchTimeSeconds: [...positionsByLesson.values()].reduce(
      (total, positions) => total + calculateLessonWatchTime(positions),
      0
    ),
    lessonsCompleted: completed?.count ?? 0,
    totalLessons: lessonIds.length,
  };
}

export function getRefundRequestDetail(id: number) {
  const row = db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      reason: refundRequests.reason,
      reasonForDecline: refundRequests.reasonForDecline,
      requestedAt: refundRequests.requestedAt,
      decidedAt: refundRequests.decidedAt,
      decidedByUserId: refundRequests.decidedByUserId,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      purchasedAt: purchases.createdAt,
      courseId: courses.id,
      courseTitle: courses.title,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refundRequests.id, id))
    .get();

  if (!row) return null;

  const seats = getSeatCounts(row.purchaseId);
  const refund = db
    .select()
    .from(refunds)
    .where(eq(refunds.refundRequestId, row.id))
    .get();
  const refundedSeats = refund
    ? db
        .select({ count: sql<number>`count(*)` })
        .from(coupons)
        .where(eq(coupons.refundId, refund.id))
        .get()?.count ?? 0
    : 0;
  const decidedBy = row.decidedByUserId
    ? db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, row.decidedByUserId))
        .get()
    : undefined;

  return {
    ...row,
    dayOfRefundWindow: dayOfRefundWindow(row.purchasedAt, row.requestedAt),
    progress: getCourseProgress(
      row.learnerId,
      row.courseId,
      row.decidedAt ?? undefined
    ),
    seats,
    refundIfApproved: calculateRefund(row.amountPaid, seats),
    canApprove: !isEverySeatClaimed(seats),
    refund: refund
      ? { amount: refund.amount, status: refund.status, refundedSeats }
      : null,
    decidedByName: decidedBy?.name ?? null,
    earlierRefundRequests: getDecidedRefundRequestsForLearners([
      row.learnerId,
    ]).filter(
      (other) => other.id !== row.id && other.requestedAt < row.requestedAt
    ),
  };
}

export function getRefundRequestsForLearner(learnerId: number) {
  return db
    .select({
      id: refundRequests.id,
      status: refundRequests.status,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      amountPaid: purchases.amountPaid,
      reason: refundRequests.reason,
      reasonForDecline: refundRequests.reasonForDecline,
      requestedAt: refundRequests.requestedAt,
      refundAmount: refunds.amount,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .leftJoin(refunds, eq(refunds.refundRequestId, refundRequests.id))
    .where(eq(purchases.userId, learnerId))
    .orderBy(desc(refundRequests.requestedAt))
    .all();
}

export type DecisionOutcome =
  | "approved"
  | "declined"
  | "already-decided"
  | "nothing-to-refund"
  | "not-found";

type Decidable = {
  status: RefundRequestStatus;
  purchaseId: number;
  amountPaid: number;
  courseId: number;
  courseTitle: string;
  learnerId: number;
  learnerName: string;
  learnerEmail: string;
};

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function getDecidable(
  tx: Transaction,
  id: number
): Decidable | undefined {
  return tx
    .select({
      status: refundRequests.status,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      courseId: courses.id,
      courseTitle: courses.title,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refundRequests.id, id))
    .get();
}

function logEmail(email: { to: string; subject: string; body: string }) {
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.body}`);
}

function sendApprovedEmail(
  request: Decidable,
  amount: number,
  refundedSeats: number,
  teamPurchase: boolean
) {
  const whatHappensNext = teamPurchase
    ? `The refund covers the ${refundedSeats} unclaimed ${refundedSeats === 1 ? "seat" : "seats"} on this purchase, and those codes no longer work. Anyone who has already claimed a seat keeps the course.`
    : "Your access to the course has ended. Your lesson progress is kept, in case you come back.";

  logEmail({
    to: request.learnerEmail,
    subject: `Refund request approved — ${request.courseTitle}`,
    body: [
      `Hi ${request.learnerName},`,
      "",
      `We have approved your refund request for "${request.courseTitle}".`,
      `Your refund is ${formatPrice(amount)}.`,
      "",
      whatHappensNext,
      "",
      "— The Cadence team",
    ].join("\n"),
  });
}

function sendDeclinedEmail(request: Decidable, reasonForDecline: string) {
  logEmail({
    to: request.learnerEmail,
    subject: `Refund request declined — ${request.courseTitle}`,
    body: [
      `Hi ${request.learnerName},`,
      "",
      `We have declined your refund request for "${request.courseTitle}".`,
      "",
      `Reason for decline: ${reasonForDecline}`,
      "",
      "— The Cadence team",
    ].join("\n"),
  });
}

/**
 * Everything an approval changes happens in one transaction, and the claimed
 * Seats are counted inside it, so a code redeemed a moment earlier is never
 * refunded and two Support Team Members can't both decide the same request.
 */
export function approveRefundRequest(
  id: number,
  decidedByUserId: number
): { outcome: DecisionOutcome } {
  const result = db.transaction((tx) => {
    const request = getDecidable(tx, id);

    if (!request) return { outcome: "not-found" as const };
    if (request.status !== RefundRequestStatus.Open) {
      return { outcome: "already-decided" as const };
    }

    const seats = tx
      .select({ redeemedAt: coupons.redeemedAt })
      .from(coupons)
      .where(eq(coupons.purchaseId, request.purchaseId))
      .all();
    const seatCounts: SeatCounts = {
      total: seats.length,
      claimed: seats.filter((seat) => seat.redeemedAt !== null).length,
    };

    if (isEverySeatClaimed(seatCounts)) {
      return { outcome: "nothing-to-refund" as const };
    }

    const { amount, refundedSeats } = calculateRefund(
      request.amountPaid,
      seatCounts
    );

    tx.update(refundRequests)
      .set({
        status: RefundRequestStatus.Approved,
        decidedAt: new Date().toISOString(),
        decidedByUserId,
      })
      .where(eq(refundRequests.id, id))
      .run();

    const refund = tx
      .insert(refunds)
      .values({ refundRequestId: id, amount, status: RefundStatus.Pending })
      .returning()
      .get();

    const teamPurchase = isTeamPurchase(seatCounts);

    if (teamPurchase) {
      tx.update(coupons)
        .set({ refundId: refund.id })
        .where(
          and(
            eq(coupons.purchaseId, request.purchaseId),
            isNull(coupons.redeemedAt)
          )
        )
        .run();
    } else {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, request.learnerId),
            eq(enrollments.courseId, request.courseId)
          )
        )
        .run();
    }

    return {
      outcome: "approved" as const,
      email: { request, amount, refundedSeats, teamPurchase },
    };
  });

  if (result.outcome === "approved") {
    const { request, amount, refundedSeats, teamPurchase } = result.email;
    sendApprovedEmail(request, amount, refundedSeats, teamPurchase);
  }

  return { outcome: result.outcome };
}

export function declineRefundRequest(
  id: number,
  decidedByUserId: number,
  reasonForDecline: string
): { outcome: DecisionOutcome } {
  const result = db.transaction((tx) => {
    const request = getDecidable(tx, id);

    if (!request) return { outcome: "not-found" as const };
    if (request.status !== RefundRequestStatus.Open) {
      return { outcome: "already-decided" as const };
    }

    tx.update(refundRequests)
      .set({
        status: RefundRequestStatus.Declined,
        reasonForDecline,
        decidedAt: new Date().toISOString(),
        decidedByUserId,
      })
      .where(eq(refundRequests.id, id))
      .run();

    return { outcome: "declined" as const, request };
  });

  if (result.outcome === "declined") {
    sendDeclinedEmail(result.request, reasonForDecline);
  }

  return { outcome: result.outcome };
}
